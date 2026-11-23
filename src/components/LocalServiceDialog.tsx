import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Play, RotateCw, Square } from 'lucide-react';
import type {
  LocalServiceAction,
  LocalServiceState,
  LocalServiceTarget,
} from '../../shared/local-service';
import { request } from '../lib/api';
import { formatError } from '../lib/messages';
import { Button } from './Button';
import { Dialog } from './Dialogs';
import { Field } from './Field';
import type { Repository } from '../../shared/types';

const sample: LocalServiceState = {
  available: true,
  config: { kind: 'npm', directory: '.', entry: 'dev', port: 5173, revision: 'preview' },
  status: 'running',
  log: '> npm run dev\n\n  http://127.0.0.1:5173',
};

const defaultTarget: LocalServiceTarget = { kind: 'npm', directory: '.', entry: 'dev', port: null };
const actionIcons = { start: Play, stop: Square, restart: RotateCw };

function LocalServiceHeading({ name, state }: { name: string; state?: LocalServiceState }) {
  const { t } = useTranslation();
  const config = state?.config;
  const entry = config?.kind === 'npm' ? `npm run ${config.entry}` : config?.entry;
  return (
    <div className="local-service-heading">
      <span className="local-service-name" title={name}>
        {name}
      </span>
      {state?.available && config && (
        <div className="local-service-summary">
          <strong role="status" data-status={state.status}>
            {t(`localService.status.${state.status}`)}
          </strong>
          {entry && <code title={entry}>{entry}</code>}
          {config.port != null && (
            <span className="local-service-port">
              {t('localService.listenPort', { port: config.port })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function LocalServiceOutput({ log }: { log: string }) {
  const { t } = useTranslation();
  const output = useRef<HTMLPreElement>(null);
  const follow = useRef(true);

  useLayoutEffect(() => {
    const element = output.current;
    if (element && follow.current) element.scrollTop = element.scrollHeight;
  }, [log]);

  return (
    <pre
      ref={output}
      className="local-service-output"
      data-empty={!log || undefined}
      tabIndex={0}
      aria-label={t('localService.log')}
      onScroll={({ currentTarget }) => {
        const { scrollHeight, scrollTop, clientHeight } = currentTarget;
        follow.current = scrollHeight - scrollTop - clientHeight <= 2;
      }}
    >
      {log || t('localService.noLog')}
    </pre>
  );
}

function LocalServiceButton({
  action,
  busy,
  disabled,
  onClick,
}: {
  action: LocalServiceAction;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const Icon = actionIcons[action];
  return (
    <Button
      variant={action === 'stop' ? 'danger' : 'primary'}
      className={action === 'stop' ? 'local-service-stop' : undefined}
      size="compact"
      icon={<Icon size={16} />}
      busy={busy}
      disabled={disabled}
      onClick={onClick}
    >
      {t(`localService.${action}`)}
    </Button>
  );
}

export function LocalServiceExample({
  name = 'MeGit',
  onClose,
}: {
  name?: string;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState(sample);
  const running = state.status === 'running';
  const controls = (
    <footer className="dialog-footer">
      {running ? (
        <>
          <LocalServiceButton
            action="stop"
            onClick={() => setState({ ...sample, status: 'stopped' })}
          />
          <LocalServiceButton action="restart" onClick={() => setState(sample)} />
        </>
      ) : (
        <LocalServiceButton action="start" onClick={() => setState(sample)} />
      )}
    </footer>
  );
  if (onClose)
    return (
      <Dialog
        title={t('localService.title')}
        titleDetail={<LocalServiceHeading name={name} state={state} />}
        className="local-service-dialog local-service-console"
        onClose={onClose}
      >
        <div className="local-service-console-body">
          <LocalServiceOutput log={state.log} />
        </div>
        {controls}
      </Dialog>
    );

  return (
    <section className="design-card local-service-example" aria-label={t('localService.title')}>
      <div className="local-service-preview">
        <header className="dialog-header">
          <div className="dialog-title-context">
            <h2>{t('localService.title')}</h2>
            <LocalServiceHeading name={name} state={state} />
          </div>
        </header>
        <LocalServiceOutput log={state.log} />
        {controls}
      </div>
    </section>
  );
}

export function LocalServiceDialog({ repo, onClose }: { repo: Repository; onClose: () => void }) {
  const { t } = useTranslation();
  const endpoint = `/repositories/${encodeURIComponent(repo.id)}/local-service`;
  const [state, setState] = useState<LocalServiceState>();
  const [problem, setProblem] = useState<unknown>(null);
  const [readProblem, setReadProblem] = useState<unknown>(null);
  const [draft, setDraft] = useState<LocalServiceTarget | null>(null);
  const [trusted, setTrusted] = useState(false);
  const [busy, setBusy] = useState<LocalServiceAction | 'save' | null>(null);
  const [readVersion, setReadVersion] = useState(0);
  const formId = useId();
  const active =
    state?.status === 'starting' || state?.status === 'running' || state?.status === 'stopping';

  useEffect(() => {
    if (busy || draft) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const next = await request<LocalServiceState>(endpoint, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setState(next);
          setReadProblem(null);
        }
      } catch (error) {
        if (!controller.signal.aborted) setReadProblem(error);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void refresh(), 1000);
      }
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [endpoint, draft, busy, readVersion]);

  function configure() {
    setProblem(null);
    setTrusted(false);
    const config = state?.config;
    setDraft(
      config
        ? { kind: config.kind, directory: config.directory, entry: config.entry, port: config.port }
        : defaultTarget,
    );
  }

  async function operate(action: LocalServiceAction | 'save', input: object) {
    setBusy(action);
    setProblem(null);
    try {
      const next = await request<LocalServiceState>(endpoint, {
        method: action === 'save' ? 'PUT' : 'POST',
        body: JSON.stringify(input),
      });
      setState(next);
      if (action === 'save') setDraft(null);
    } catch (error) {
      setProblem(error);
    } finally {
      setBusy(null);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft && trusted && !busy)
      void operate('save', { ...draft, revision: state?.config?.revision ?? null, trusted });
  }

  function action(name: LocalServiceAction) {
    if (state?.config && !busy)
      void operate(name, { action: name, revision: state.config.revision });
  }

  return (
    <Dialog
      title={t('localService.title')}
      titleDetail={<LocalServiceHeading name={repo.name} state={draft ? undefined : state} />}
      className={draft ? 'local-service-dialog' : 'local-service-dialog local-service-console'}
      onClose={onClose}
      busy={busy !== null}
    >
      <div className={draft ? 'dialog-body' : 'local-service-console-body'}>
        {!state && !readProblem && (
          <p className="local-service-message" role="status">
            {t('localService.loading')}
          </p>
        )}
        {state && !state.available && (
          <p className="error-message local-service-message" role="alert">
            {t('errors.localServiceUnavailable')}
          </p>
        )}
        {state?.available && !draft && !state.config && (
          <p className="local-service-message">{t('localService.unconfigured')}</p>
        )}
        {!draft && state?.error && (
          <div className="error-message local-service-message" role="alert">
            <p>{formatError(state.error)}</p>
            {state.ownerPid != null && (
              <p>{t('localService.portOwner', { pid: state.ownerPid })}</p>
            )}
          </div>
        )}
        {draft && (
          <form id={formId} onSubmit={save} className="local-service-form">
            <div className="two-fields">
              <Field label={t('localService.kind')}>
                <select
                  value={draft.kind}
                  disabled={!!busy}
                  onChange={(event) => {
                    const kind = event.target.value === 'powershell' ? 'powershell' : 'npm';
                    setDraft({ ...draft, kind, entry: kind === 'npm' ? 'dev' : '' });
                  }}
                >
                  <option value="npm">{t('localService.npm')}</option>
                  <option value="powershell">{t('localService.powershell')}</option>
                </select>
              </Field>
              <Field label={t('localService.port')}>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={draft.port ?? ''}
                  disabled={!!busy}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      port: event.target.value ? event.target.valueAsNumber : null,
                    })
                  }
                />
              </Field>
            </div>
            <Field label={t('localService.directory')} hint={t('localService.directoryHint')}>
              <input
                required
                maxLength={500}
                value={draft.directory}
                disabled={!!busy}
                onChange={(event) => setDraft({ ...draft, directory: event.target.value })}
              />
            </Field>
            <Field
              label={t(
                draft.kind === 'npm' ? 'localService.scriptName' : 'localService.scriptPath',
              )}
            >
              <input
                required
                maxLength={500}
                value={draft.entry}
                disabled={!!busy}
                placeholder={draft.kind === 'npm' ? 'dev' : 'scripts/dev.ps1'}
                onChange={(event) => setDraft({ ...draft, entry: event.target.value })}
              />
            </Field>
            <label className="local-service-trust">
              <input
                type="checkbox"
                checked={trusted}
                disabled={!!busy}
                onChange={(event) => setTrusted(event.target.checked)}
              />
              <span>{t('localService.trust')}</span>
            </label>
          </form>
        )}
        {problem != null && (
          <p className="error-message local-service-message" role="alert">
            {formatError(problem)}
          </p>
        )}
        {readProblem != null && (
          <p className="error-message local-service-message" role="alert">
            {formatError(readProblem)}
          </p>
        )}
        {!draft && state?.available && state.config && <LocalServiceOutput log={state.log} />}
      </div>
      <footer className="dialog-footer">
        {readProblem != null && !draft && (
          <Button
            size="compact"
            onClick={() => {
              setReadVersion((version) => version + 1);
            }}
          >
            {t('repository.retry')}
          </Button>
        )}
        {draft ? (
          <>
            <Button
              size="compact"
              disabled={!!busy}
              onClick={() => {
                setDraft(null);
                setProblem(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              size="compact"
              form={formId}
              type="submit"
              variant="primary"
              busy={busy === 'save'}
              disabled={!trusted}
            >
              {t('localService.save')}
            </Button>
          </>
        ) : (
          state?.available && (
            <>
              {!active && (
                <Button size="compact" disabled={!!busy} onClick={configure}>
                  {t('localService.configure')}
                </Button>
              )}
              {state.config && active && (
                <LocalServiceButton
                  action="stop"
                  busy={busy === 'stop'}
                  disabled={!!busy || state.status === 'stopping'}
                  onClick={() => action('stop')}
                />
              )}
              {state.config && state.status === 'running' && state.config.port != null && (
                <a
                  className="button compact local-service-open"
                  href={`http://127.0.0.1:${state.config.port}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ArrowUpRight size={16} aria-hidden="true" />
                  <span className="button-label">{t('localService.open')}</span>
                </a>
              )}
              {state.config && state.status === 'running' && (
                <LocalServiceButton
                  action="restart"
                  busy={busy === 'restart'}
                  disabled={!!busy}
                  onClick={() => action('restart')}
                />
              )}
              {state.config && !active && (
                <LocalServiceButton
                  action="start"
                  busy={busy === 'start'}
                  disabled={!!busy}
                  onClick={() => action('start')}
                />
              )}
            </>
          )
        )}
      </footer>
    </Dialog>
  );
}
