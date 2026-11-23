import { useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProjectPlan, ProjectResult } from '../../shared/assistant-project';
import { formatError } from '../lib/messages';
import { Button } from './Button';
import { AssistantCapability } from './AssistantCapability';

export function ProjectReview({
  plan,
  apply,
  busy,
  locked,
  reviewRef,
  showSummary = true,
  repositoryName,
}: {
  plan: ProjectPlan;
  apply: (configure: boolean) => void;
  busy: boolean;
  locked: boolean;
  reviewRef?: Ref<HTMLElement>;
  showSummary?: boolean;
  repositoryName?: string;
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
      {repositoryName && (
        <p>
          {t('projectDelivery.repository')}: <strong>{repositoryName}</strong>
        </p>
      )}
      {showSummary && <p>{plan.summary}</p>}
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

export function ProjectOutcome({
  result,
  busy,
  error,
}: {
  result?: ProjectResult;
  busy: boolean;
  error?: unknown;
}) {
  const { t } = useTranslation();
  return (
    <>
      {busy && <p role="status">{t('projectDelivery.applying')}</p>}
      {result && (result.written.length > 0 || result.configured) && (
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
      {!!(error || result?.error) && (
        <p role="alert" className="error-message">
          {formatError(error || result?.error)}
        </p>
      )}
    </>
  );
}

export function AssistantProjectExample() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<boolean>();
  const [writeEnabled, setWriteEnabled] = useState(false);
  const repository = { id: 'example', name: 'Example Wiki', path: 'C:\\Projects\\Example-Wiki' };
  const entry = 'scripts/start.ps1';
  return (
    <section className="design-card">
      <h2>{t('projectDelivery.title')}</h2>
      <AssistantCapability
        settings={{
          endpoint: 'http://127.0.0.1:8080/v1/chat/completions',
          model: 'local-model',
          hasApiKey: false,
          projectDelivery: true,
        }}
        repository={repository}
        referenceCount={1}
        writable={writeEnabled}
        busy={false}
        onGrant={async () => setWriteEnabled(true)}
        onRevoke={async () => setWriteEnabled(false)}
      />
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
