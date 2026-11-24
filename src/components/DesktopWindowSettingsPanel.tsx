import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { DesktopWindowContext } from '../lib/desktop-window';
import { Button } from './Button';
import { SettingsOption } from './SettingsForm';

export function DesktopWindowSettingsPanel({ example }: { example: boolean }) {
  const { t } = useTranslation();
  const desktop = useContext(DesktopWindowContext);
  const settings = example ? { systemTitleBar: true, closeToTray: false } : desktop?.settings;
  return (
    <div className="settings-form settings-standalone">
      {settings && (
        <fieldset
          className="theme-fieldset settings-group"
          disabled={example || desktop?.busy}
          aria-label={t('settings.interface')}
        >
          <SettingsOption
            role="switch"
            label={t('settings.systemTitleBar')}
            help={t('settings.systemTitleBarHelp')}
            checked={settings.systemTitleBar}
            onChange={(event) => void desktop?.save('setSystemTitleBar', event.target.checked)}
          />
          <SettingsOption
            role="switch"
            label={t('settings.closeToTray')}
            help={t('settings.closeToTrayHelp')}
            checked={settings.closeToTray}
            onChange={(event) => void desktop?.save('setCloseToTray', event.target.checked)}
          />
        </fieldset>
      )}
      {!example && desktop?.busy && !settings && (
        <p className="muted" role="status">
          {t('settings.windowLoading')}
        </p>
      )}
      {!example && desktop?.error && (
        <p className="field-error" role="alert">
          {t(desktop.error === 'read' ? 'settings.windowReadError' : 'settings.windowSaveError')}
        </p>
      )}
      {!example && desktop?.error === 'read' && (
        <div>
          <Button onClick={() => void desktop.reload()}>{t('settings.windowRetry')}</Button>
        </div>
      )}
    </div>
  );
}
