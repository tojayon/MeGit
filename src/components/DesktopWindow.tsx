import { useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Maximize, Minus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DesktopWindowContext,
  type DesktopSetting,
  type DesktopWindowSettings,
  type WindowAction,
} from '../lib/desktop-window';
import { IconButton } from './IconButton';

export function DesktopWindow({
  children,
  invoke,
}: {
  children: ReactNode;
  invoke: NonNullable<Window['megitDesktop']>;
}) {
  const { i18n } = useTranslation();
  const [settings, setSettings] = useState<DesktopWindowSettings>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<'read' | 'save' | null>(null);
  const language = i18n.resolvedLanguage === 'en' ? 'en' : 'zh-CN';
  const readSettings = useCallback(
    () =>
      Promise.resolve()
        .then(() => invoke({ action: 'read' }))
        .then(setSettings)
        .catch(() => setError('read'))
        .finally(() => setBusy(false)),
    [invoke],
  );

  useEffect(() => void readSettings(), [readSettings]);
  useEffect(() => {
    void invoke({ action: 'setLanguage', language }).catch(() => undefined);
  }, [invoke, language]);

  async function reload() {
    setBusy(true);
    setError(null);
    await readSettings();
  }
  async function save(action: DesktopSetting, enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      setSettings(await invoke({ action, enabled }));
    } catch {
      setError('save');
    } finally {
      setBusy(false);
    }
  }
  async function run(action: WindowAction) {
    await invoke({ action });
  }

  return (
    <DesktopWindowContext.Provider value={{ settings, busy, error, save, reload, run }}>
      {children}
    </DesktopWindowContext.Provider>
  );
}

export function DesktopWindowControls() {
  const { t } = useTranslation();
  const desktop = useContext(DesktopWindowContext);
  const [actionFailed, setActionFailed] = useState(false);
  if (desktop?.settings?.systemTitleBar !== false) return null;
  async function run(action: WindowAction) {
    setActionFailed(false);
    try {
      await desktop?.run(action);
    } catch {
      setActionFailed(true);
    }
  }

  return (
    <div className="desktop-title-bar">
      <div
        className="desktop-title-drag"
        aria-hidden="true"
        onMouseDown={(event) => {
          if (event.button === 0) void run(event.detail === 2 ? 'toggleMaximize' : 'drag');
        }}
      />
      {actionFailed && (
        <span className="field-error" role="alert">
          {t('settings.windowActionError')}
        </span>
      )}
      <div className="desktop-title-actions" role="group" aria-label={t('settings.windowControls')}>
        <IconButton label={t('settings.windowMinimize')} onClick={() => void run('minimize')}>
          <Minus size={15} aria-hidden="true" />
        </IconButton>
        <IconButton label={t('settings.windowMaximize')} onClick={() => void run('toggleMaximize')}>
          <Maximize size={15} aria-hidden="true" />
        </IconButton>
        <IconButton
          label={t('settings.windowClose')}
          variant="danger"
          onClick={() => void run('close')}
        >
          <X size={15} aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}
