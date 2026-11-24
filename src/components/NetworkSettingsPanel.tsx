import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProxySettings } from '../../shared/types';
import { request } from '../lib/api';
import { formatError } from '../lib/messages';
import { Button } from './Button';
import { Field } from './Field';
import { SettingsActions, SettingsOption } from './SettingsForm';

const initial: ProxySettings = { enabled: false, address: '' };

export function NetworkSettingsPanel({ example = false }: { example?: boolean }) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState<ProxySettings>();
  const [draft, setDraft] = useState<ProxySettings>(
    example ? { enabled: true, address: 'http://127.0.0.1:7890' } : initial,
  );
  const [busy, setBusy] = useState<'save' | 'test'>();
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState<'saved' | 'connected'>();
  const [testedAddress, setTestedAddress] = useState('');
  const dirty =
    !!saved && (draft.enabled !== saved.enabled || draft.address.trim() !== saved.address);
  const needsTest =
    draft.enabled &&
    (!saved?.enabled || draft.address.trim() !== saved.address) &&
    (!testedAddress || testedAddress !== draft.address.trim());

  useEffect(() => {
    if (example) return;
    const controller = new AbortController();
    void request<ProxySettings>('/network/settings', { signal: controller.signal })
      .then((settings) => {
        if (controller.signal.aborted) return;
        setSaved(settings);
        setDraft(settings);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failure);
      });
    return () => controller.abort();
  }, [example]);

  function edit(value: ProxySettings) {
    setError(undefined);
    setNotice(undefined);
    setDraft(value);
  }

  async function run(action: 'save' | 'test') {
    setError(undefined);
    setNotice(undefined);
    setBusy(action);
    try {
      if (action === 'test') {
        setTestedAddress('');
        await request('/network/test', {
          method: 'POST',
          body: JSON.stringify({ address: draft.address }),
        });
        setTestedAddress(draft.address.trim());
        setNotice('connected');
      } else {
        const settings = await request<ProxySettings>('/network/settings', {
          method: 'PUT',
          body: JSON.stringify(draft),
        });
        setSaved(settings);
        setDraft(settings);
        setNotice('saved');
      }
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(undefined);
    }
  }

  const disabled = example || !saved || !!busy;
  const feedback = error ? (
    <p className="error-message" role="alert">
      {formatError(error)}
    </p>
  ) : notice ? (
    <p className="settings-success" role="status">
      {t(notice === 'saved' ? 'settings.proxySaved' : 'settings.proxyConnected')}
    </p>
  ) : busy || (!saved && !example) ? (
    <p className="muted" role="status">
      {t(busy ? 'ai.working' : 'settings.loading')}
    </p>
  ) : needsTest && !example ? (
    <p className="muted">{t('settings.proxyTestBeforeSave')}</p>
  ) : null;

  return (
    <div className="settings-form">
      <div className="settings-fields">
        <fieldset
          className="theme-fieldset settings-group"
          disabled={disabled}
          aria-label={t('settings.network')}
        >
          <SettingsOption
            label={t('settings.proxyEnabled')}
            checked={draft.enabled}
            onChange={(event) => edit({ ...draft, enabled: event.target.checked })}
          />
          <Field label={t('settings.proxyAddress')} hint={t('settings.proxyHelp')}>
            <input
              type="url"
              autoComplete="off"
              maxLength={2048}
              placeholder={t('settings.proxyExample')}
              value={draft.address}
              onChange={(event) => edit({ ...draft, address: event.target.value })}
            />
          </Field>
        </fieldset>
      </div>
      <SettingsActions feedback={feedback}>
        <Button
          disabled={disabled || !draft.address.trim()}
          busy={busy === 'test' || undefined}
          onClick={() => void run('test')}
        >
          {t('settings.proxyTest')}
        </Button>
        <Button
          variant="primary"
          disabled={disabled || !dirty || needsTest}
          busy={busy === 'save' || undefined}
          onClick={() => void run('save')}
        >
          {t('settings.proxySave')}
        </Button>
      </SettingsActions>
    </div>
  );
}
