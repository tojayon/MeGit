import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { DesktopWindowContext } from '../lib/desktop-window';
import { Button } from './Button';
import { Tooltip } from './Tooltip';

export function DesktopWindowSettingsPanel({ example }: { example: boolean }) {
  const { t } = useTranslation();
  const desktop = useContext(DesktopWindowContext);
  const settings = example ? { systemTitleBar: true, closeToTray: false } : desktop?.settings;
  return (
    <div className="settings-form">
      {settings && (
        <fieldset
          className="theme-fieldset desktop-window-options"
          disabled={example || desktop?.busy}
          aria-label={t('settings.interface')}
        >
          <Tooltip content={t('settings.systemTitleBarHelp')}>
            <label>
              <input
                type="checkbox"
                role="switch"
                checked={settings.systemTitleBar}
                onChange={(event) => void desktop?.save('setSystemTitleBar', event.target.checked)}
              />
              {t('settings.systemTitleBar')}
            </label>
          </Tooltip>
          <Tooltip content={t('settings.closeToTrayHelp')}>
            <label>
              <input
                type="checkbox"
                role="switch"
                checked={settings.closeToTray}
                onChange={(event) => void desktop?.save('setCloseToTray', event.target.checked)}
              />
              {t('settings.closeToTray')}
            </label>
          </Tooltip>
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
