import { useEffect, useRef, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiSettings } from '../../shared/ai';
import type { ProjectPlan, ProjectResult } from '../../shared/assistant-project';
import type { Repository } from '../../shared/types';
import { request } from '../lib/api';
import { formatError } from '../lib/messages';
import { Button } from './Button';
import { Field } from './Field';

function ProjectReview({
  plan,
  apply,
  busy,
  locked,
  reviewRef,
}: {
  plan: ProjectPlan;
  apply: (configure: boolean) => void;
  busy: boolean;
  locked: boolean;
  reviewRef?: Ref<HTMLElement>;
}) {
  const { t } = useTranslation();
  const [trusted, setTrusted] = useState(false);
  return (
    <section
      ref={reviewRef}
      tabIndex={reviewRef ? -1 : undefined}
      className="assistant-project-review"
      aria-label={t('projectDelivery.review')}
    >
      <h3>{t('projectDelivery.review')}</h3>
      <p>{plan.summary}</p>
      {plan.read.length > 0 && (
        <details>
          <summary>{t('projectDelivery.sentFiles', { count: plan.read.length })}</summary>
          <ul>
            {plan.read.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
      {plan.files.map((file) => (
        <details key={file.path}>
          <summary>
            <span>
              {t(file.before === null ? 'projectDelivery.create' : 'projectDelivery.edit')}
            </span>{' '}
            <code>{file.path}</code>
          </summary>
          {file.before !== null && (
            <>
              <p>{t('projectDelivery.before')}</p>
              <pre tabIndex={0} aria-label={t('projectDelivery.before')}>
                {file.before}
              </pre>
            </>
          )}
          <p>{t('projectDelivery.after')}</p>
          <pre tabIndex={0} aria-label={t('projectDelivery.after')}>
            {file.content}
          </pre>
        </details>
      ))}
      {plan.service && (
        <div className="assistant-project-config">
          <strong>{t('projectDelivery.service')}</strong>
          <p>
            <code>{plan.service.entry}</code>
          </p>
          <p>
            {t('localService.directory')}: <code>{plan.service.directory}</code> ·{' '}
            {plan.service.port == null
              ? t('projectDelivery.portNone')
              : t('localService.listenPort', { port: plan.service.port })}
          </p>
          {plan.replacesService && <p className="muted">{t('projectDelivery.configReplaces')}</p>}
          {plan.serviceAvailable ? (
            <label className="assistant-diff-option">
              <input
                type="checkbox"
                checked={trusted}
                disabled={busy || locked}
                onChange={(event) => setTrusted(event.target.checked)}
              />
              <span>{t('projectDelivery.trust')}</span>
            </label>
          ) : (
            <p className="muted">{t('errors.localServiceUnavailable')}</p>
          )}
        </div>
      )}
      {!locked && (
        <div className="settings-actions">
          <Button
            variant={plan.serviceAvailable ? 'default' : 'primary'}
            disabled={busy}
            onClick={() => apply(false)}
          >
            {t('projectDelivery.filesOnly')}
          </Button>
          {plan.serviceAvailable && (
            <Button variant="primary" disabled={!trusted || busy} onClick={() => apply(true)}>
              {t('projectDelivery.saveConfig')}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

export function AssistantProject({
  repositories,
  initialRepository,
  initialPrompt,
  settings,
  active,
  onBack,
}: {
  repositories: Repository[];
  initialRepository: string;
  initialPrompt: string;
  settings: AiSettings;
  active: boolean;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [repoId, setRepoId] = useState(initialRepository);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [authorized, setAuthorized] = useState(false);
  const [plan, setPlan] = useState<ProjectPlan>();
  const [result, setResult] = useState<ProjectResult>();
  const [problem, setProblem] = useState<unknown>();
  const [busy, setBusy] = useState<'prepare' | 'apply'>();
  const [locked, setLocked] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const applying = useRef(false);
  const top = useRef<HTMLHeadingElement>(null);
  const review = useRef<HTMLElement>(null);
  const repo = repositories.find((item) => item.id === repoId);

  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (!active) pending.current?.abort();
    else (plan ? review.current : top.current)?.focus();
  }, [active, plan]);

  async function prepare() {
    if (!authorized || !repo || !prompt.trim() || pending.current || applying.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy('prepare');
    setProblem(undefined);
    try {
      const prepared = await request<ProjectPlan>('/ai/project/prepare', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({
          repositoryId: repo.id,
          repositoryPath: repo.path,
          prompt,
          endpoint: settings.endpoint,
          model: settings.model,
          approved: true,
        }),
      });
      if (!controller.signal.aborted) setPlan(prepared);
    } catch (error) {
      if (!controller.signal.aborted) setProblem(error);
    } finally {
      pending.current = null;
      setAuthorized(false);
      setBusy(undefined);
    }
  }

  async function apply(configure: boolean) {
    if (!plan || !repo || applying.current || locked) return;
    applying.current = true;
    setBusy('apply');
    setProblem(undefined);
    setLocked(true);
    try {
      setResult(
        await request<ProjectResult>(`/ai/project/${encodeURIComponent(plan.id)}/apply`, {
          method: 'POST',
          body: JSON.stringify({ configure, ...(configure ? { trusted: true } : {}) }),
        }),
      );
    } catch (error) {
      setProblem(error);
    } finally {
      applying.current = false;
      setBusy(undefined);
    }
  }

  return (
    <div
      className="assistant-project"
      onKeyDown={(event) => {
        if (busy === 'apply' && event.key === 'Escape') event.stopPropagation();
      }}
    >
      <div className="assistant-project-title">
        <h3 ref={top} tabIndex={-1}>
          {t('projectDelivery.title')}
        </h3>
        <Button size="compact" disabled={busy === 'apply'} onClick={onBack}>
          {t('projectDelivery.back')}
        </Button>
      </div>
      {!plan ? (
        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            void prepare();
          }}
        >
          <Field label={t('projectDelivery.repository')}>
            <select
              value={repoId}
              disabled={!!busy}
              onChange={(event) => {
                setRepoId(event.target.value);
                setAuthorized(false);
              }}
            >
              <option value="">{t('ai.selectRepository')}</option>
              {repositories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          {repo && <code className="muted">{repo.path}</code>}
          <Field label={t('projectDelivery.task')}>
            <textarea
              value={prompt}
              disabled={!!busy}
              maxLength={4000}
              rows={3}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </Field>
          <div className="assistant-project-config">
            <p>
              {t('projectDelivery.recipient', {
                endpoint: settings.endpoint,
                model: settings.model,
              })}
            </p>
            <label className="assistant-diff-option">
              <input
                type="checkbox"
                checked={authorized}
                disabled={!!busy || !repo}
                onChange={(event) => setAuthorized(event.target.checked)}
              />
              <span>{t('projectDelivery.disclosure')}</span>
            </label>
          </div>
          <div className="settings-actions">
            <Button
              type="submit"
              variant="primary"
              disabled={!repo || !authorized || !prompt.trim()}
              busy={busy === 'prepare'}
            >
              {t('projectDelivery.prepare')}
            </Button>
            {busy === 'prepare' && (
              <Button onClick={() => pending.current?.abort()}>
                {t('assistant.stopGeneration')}
              </Button>
            )}
          </div>
        </form>
      ) : (
        <>
          <p className="assistant-project-task">
            <strong>{repo?.name}</strong> · {prompt}
          </p>
          <ProjectReview
            plan={plan}
            reviewRef={review}
            locked={locked || !repo}
            busy={!!busy}
            apply={(configure) => void apply(configure)}
          />
          {!repo && (
            <p role="alert" className="error-message">
              {t('errors.repositoryMissing')}
            </p>
          )}
          {busy === 'apply' && <p role="status">{t('projectDelivery.applying')}</p>}
          {result && (
            <div role="status" className="assistant-project-config">
              {result.written.length > 0 && (
                <>
                  <strong>{t('projectDelivery.written', { count: result.written.length })}</strong>
                  <ul>
                    {result.written.map((name) => (
                      <li key={name}>
                        <code>{name}</code>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {result.configured && <p>{t('projectDelivery.configured')}</p>}
            </div>
          )}
          {!busy && (
            <div className="settings-actions">
              <Button
                onClick={() => {
                  setPlan(undefined);
                  setResult(undefined);
                  setProblem(undefined);
                  setLocked(false);
                }}
              >
                {t('projectDelivery.startOver')}
              </Button>
            </div>
          )}
        </>
      )}
      {!!(problem || result?.error) && (
        <p role="alert" className="error-message">
          {formatError(problem || result?.error)}
        </p>
      )}
    </div>
  );
}

export function AssistantProjectExample() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<boolean>();
  const entry = 'scripts/start.ps1';
  return (
    <section className="design-card">
      <h2>{t('projectDelivery.title')}</h2>
      <ProjectReview
        plan={{
          id: 'example',
          summary: t('projectDelivery.example'),
          read: ['README.md'],
          files: [
            { path: entry, before: null, content: "& node 'server.js'\nexit $LASTEXITCODE\n" },
          ],
          service: { kind: 'powershell', directory: '.', entry, port: null },
          serviceAvailable: true,
        }}
        apply={setSelected}
        busy={false}
        locked={selected !== undefined}
      />
      {selected !== undefined && (
        <p role="status">
          {selected ? t('projectDelivery.configured') : t('projectDelivery.written', { count: 1 })}
        </p>
      )}
    </section>
  );
}
