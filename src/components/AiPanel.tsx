import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiDiagram, AiSettings } from '../../shared/ai';
import type { Repository } from '../../shared/types';
import { request } from '../lib/api';
import { formatError } from '../lib/messages';
import { Button } from './Button';
import { Field } from './Field';
import { SettingsActions, SettingsOption } from './SettingsForm';

type AiResult = { kind: 'diagram'; diagram: AiDiagram } | { kind: 'repository'; text: string };
const exampleSettings: AiSettings = {
  endpoint: 'https://example.invalid/v1',
  model: 'example-model',
  hasApiKey: true,
  projectDelivery: true,
};

export function AiPanel({
  repositories,
  selectedRepo,
  applyDiagram,
  canApply,
  section,
  quick = false,
  example = false,
  onSaved,
  onBusy,
}: {
  repositories: Repository[];
  selectedRepo?: string | null;
  applyDiagram?: (diagram: AiDiagram) => boolean;
  canApply?: boolean;
  section: 'service' | 'assistant';
  quick?: boolean;
  example?: boolean;
  onSaved?: (settings: AiSettings) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState<AiSettings | undefined>(
    example ? exampleSettings : undefined,
  );
  const [endpoint, setEndpoint] = useState(example ? exampleSettings.endpoint : '');
  const [model, setModel] = useState(example ? exampleSettings.model : '');
  const [key, setKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [projectDelivery, setProjectDelivery] = useState(
    example && exampleSettings.projectDelivery === true,
  );
  const [busy, setBusy] = useState<'save' | 'test' | 'repository' | 'diagram'>();
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState<'saved' | 'connected' | 'applied'>();
  const [repositoryId, setRepositoryId] = useState(selectedRepo ?? '');
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<AiResult>();
  const dirty =
    endpoint !== settings?.endpoint ||
    model !== settings?.model ||
    Boolean(key) ||
    clearKey ||
    (!quick && projectDelivery !== (settings?.projectDelivery === true));
  const ready = Boolean(settings?.model) && !dirty && !busy;

  useEffect(() => {
    if (example) return;
    const controller = new AbortController();
    void request<AiSettings>('/ai/settings', { signal: controller.signal })
      .then((value) => {
        if (controller.signal.aborted) return;
        setSettings(value);
        setEndpoint(value.endpoint);
        setModel(value.model);
        setProjectDelivery(value.projectDelivery === true);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failure);
      });
    return () => controller.abort();
  }, [example]);

  async function run(action: 'save' | 'test' | 'repository' | 'diagram') {
    if (busy || example) return;
    setBusy(action);
    onBusy?.(true);
    setError(undefined);
    setNotice(undefined);
    setResult(undefined);
    try {
      const language = i18n.resolvedLanguage === 'en' ? 'en' : 'zh-CN';
      if (action === 'save') {
        const value = await request<AiSettings>('/ai/settings', {
          method: 'PUT',
          body: JSON.stringify({
            endpoint,
            model,
            projectDelivery: quick ? undefined : projectDelivery,
            apiKey: clearKey ? '' : key || undefined,
          }),
        });
        setSettings(value);
        setEndpoint(value.endpoint);
        setModel(value.model);
        setKey('');
        setClearKey(false);
        setNotice('saved');
        onSaved?.(value);
      } else if (action === 'test') {
        await request('/ai/test', { method: 'POST' });
        setNotice('connected');
      } else {
        setResult(
          await request<AiResult>('/ai/assist', {
            method: 'POST',
            body: JSON.stringify(
              action === 'diagram'
                ? { kind: action, language, prompt }
                : { kind: action, language, repositoryId },
            ),
          }),
        );
      }
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(undefined);
      onBusy?.(false);
    }
  }

  const feedback = busy ? (
    <p className="muted" role="status">
      {t('ai.working')}
    </p>
  ) : error ? (
    <p role="alert" className="error-message">
      {formatError(error)}
    </p>
  ) : notice ? (
    <p className="settings-success" role="status">
      {t(`ai.${notice}`)}
    </p>
  ) : !settings && section === 'service' ? (
    <p className="muted" role="status">
      {t('settings.loading')}
    </p>
  ) : null;

  if (section === 'service') {
    const disabled = !settings || !!busy || example;
    return (
      <div className="settings-form">
        <div className="settings-fields">
          <fieldset
            className="theme-fieldset settings-group"
            aria-label={quick ? t('ai.service') : undefined}
            disabled={disabled}
          >
            {!quick && <legend>{t('settings.connection')}</legend>}
            <Field label={t('ai.endpoint')}>
              <input
                type="url"
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
              />
            </Field>
            <Field label={t('ai.model')}>
              <input value={model} onChange={(event) => setModel(event.target.value)} />
            </Field>
            <Field label={t(settings?.hasApiKey ? 'ai.savedKey' : 'ai.key')}>
              <input
                type="password"
                autoComplete="new-password"
                disabled={clearKey}
                value={key}
                onChange={(event) => setKey(event.target.value)}
              />
            </Field>
            {settings?.hasApiKey && (
              <SettingsOption
                label={t('ai.clearKey')}
                checked={clearKey}
                onChange={(event) => setClearKey(event.target.checked)}
              />
            )}
          </fieldset>
          {!quick && (
            <fieldset className="theme-fieldset settings-group" disabled={disabled}>
              <legend>{t('settings.permissions')}</legend>
              <SettingsOption
                label={t('projectDelivery.enable')}
                help={t('settings.projectDeliveryHelp')}
                checked={projectDelivery}
                onChange={(event) => setProjectDelivery(event.target.checked)}
              />
            </fieldset>
          )}
        </div>
        <SettingsActions feedback={feedback}>
          <Button
            disabled={disabled || !ready}
            busy={busy === 'test' || undefined}
            onClick={() => void run('test')}
          >
            {t('ai.test')}
          </Button>
          <Button
            variant="primary"
            disabled={disabled || !dirty || !endpoint.trim() || !model.trim()}
            busy={busy === 'save' || undefined}
            onClick={() => void run('save')}
          >
            {t('ai.save')}
          </Button>
        </SettingsActions>
      </div>
    );
  }

  return (
    <div className="settings-form settings-standalone">
      {!settings?.model && !error && (
        <p className="muted">{t(settings ? 'settings.configureAi' : 'ai.working')}</p>
      )}
      {settings?.model && !repositories.length && !applyDiagram && (
        <p className="muted">{t('settings.openBoard')}</p>
      )}
      {repositories.length > 0 && (
        <fieldset className="theme-fieldset" disabled={!ready}>
          <legend>{t('ai.repository')}</legend>
          <Field label={t('ai.repositoryScope')}>
            <select
              value={repositoryId}
              onChange={(event) => {
                setRepositoryId(event.target.value);
                setResult(undefined);
              }}
            >
              <option value="">{t('ai.selectRepository')}</option>
              {repositories.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.name}
                </option>
              ))}
            </select>
          </Field>
          <p className="muted">{t('ai.repositoryDisclosure')}</p>
          <Button
            disabled={!repositories.some((repo) => repo.id === repositoryId)}
            onClick={() => void run('repository')}
          >
            {t('ai.explain')}
          </Button>
        </fieldset>
      )}
      {applyDiagram && (
        <fieldset className="theme-fieldset" disabled={!ready}>
          <legend>{t('ai.diagram')}</legend>
          <Field label={t('ai.prompt')}>
            <textarea
              maxLength={4000}
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
                setResult(undefined);
              }}
            />
          </Field>
          <Button disabled={!prompt.trim()} onClick={() => void run('diagram')}>
            {t('ai.generate')}
          </Button>
        </fieldset>
      )}
      {feedback}
      {result?.kind === 'repository' && (
        <p role="status" className="ai-output">
          {result.text}
        </p>
      )}
      {result?.kind === 'diagram' && (
        <section aria-label={t('ai.preview')}>
          <h3>{t('ai.preview')}</h3>
          <ol>
            {result.diagram.nodes.map((node, index) => (
              <li key={index}>
                {t(`ai.node.${node.kind}`)}：{node.title}
              </li>
            ))}
          </ol>
          <ul>
            {result.diagram.edges.map((edge, index) => (
              <li key={index}>
                {result.diagram.nodes[edge.source].title} →{' '}
                {result.diagram.nodes[edge.target].title} {edge.label}
              </li>
            ))}
          </ul>
          {!canApply && <p className="muted">{t('ai.boardUnavailable')}</p>}
          <Button
            variant="primary"
            disabled={!canApply || !!busy}
            onClick={() => {
              if (applyDiagram?.(result.diagram)) {
                setResult(undefined);
                setNotice('applied');
              } else {
                setError({ code: 'aiBoardUnavailable' });
              }
            }}
          >
            {t('ai.apply')}
          </Button>
        </section>
      )}
    </div>
  );
}
