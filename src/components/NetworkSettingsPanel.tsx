import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProxySettings } from '../../shared/types';
import { request } from '../lib/api';
import { formatError } from '../lib/messages';
import { Button } from './Button';
import { Field } from './Field';

const initial: ProxySettings = { enabled: false, address: '' };

export function NetworkSettingsPanel({ example = false }: { example?: boolean }) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState<ProxySettings>();
  const [draft, setDraft] = useState<ProxySettings>(example ? { enabled: true, address: 'http://127.0.0.1:7890' } : initial);
  const [busy, setBusy] = useState<'save' | 'test'>();
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState<'saved' | 'connected'>();
  const [testedAddress, setTestedAddress] = useState('');
  const dirty = !!saved && (draft.enabled !== saved.enabled || draft.address.trim() !== saved.address);
  const needsTest = draft.enabled && (!saved?.enabled || draft.address.trim() !== saved.address)
    && (!testedAddress || testedAddress !== draft.address.trim());

  useEffect(() => {
    if (example) return;
    const controller = new AbortController();
    void request<ProxySettings>('/network/settings', { signal: controller.signal }).then((settings) => {
      if (controller.signal.aborted) return;
      setSaved(settings);
      setDraft(settings);
    }).catch((failure: unknown) => {
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
        await request('/network/test', { method: 'POST', body: JSON.stringify({ address: draft.address }) });
        setTestedAddress(draft.address.trim());
        setNotice('connected');
      } else {
        const settings = await request<ProxySettings>('/network/settings', { method: 'PUT', body: JSON.stringify(draft) });
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

  return (
    <div className="settings-form">
      <fieldset className="theme-fieldset settings-form" disabled={example || !saved || !!busy} aria-label={t('settings.network')}>
        <label>
          <input type="checkbox" checked={draft.enabled} onChange={(event) => edit({ ...draft, enabled: event.target.checked })} />
          {t('settings.proxyEnabled')}
        </label>
        <Field label={t('settings.proxyAddress')} hint={t('settings.proxyHelp')}>
          <input type="url" autoComplete="off" maxLength={2048} placeholder={t('settings.proxyExample')} value={draft.address} onChange={(event) => edit({ ...draft, address: event.target.value })} />
        </Field>
        <div className="settings-actions">
          <Button disabled={!draft.address.trim()} busy={busy === 'test'} onClick={() => void run('test')}>{t('settings.proxyTest')}</Button>
          <Button variant="primary" disabled={!dirty || needsTest} busy={busy === 'save'} onClick={() => void run('save')}>{t('settings.proxySave')}</Button>
        </div>
        {needsTest && <p className="muted">{t('settings.proxyTestBeforeSave')}</p>}
      </fieldset>
      {!!error && <p className="field-error" role="alert">{formatError(error)}</p>}
      {notice && <p role="status">{t(notice === 'saved' ? 'settings.proxySaved' : 'settings.proxyConnected')}</p>}
    </div>
  );
}
