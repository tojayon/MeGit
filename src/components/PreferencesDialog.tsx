import { Moon, Sun, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePreferences, updatePreferences } from '../preferences/store';
import { themes, languages, type Language } from '../preferences/storage';
import { Dialog } from './Dialogs';
import { languageNames } from '../i18n/languages';
import { Field } from './Field';

export function PreferencesDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { preferences, issue } = usePreferences();
  return (
    <Dialog title={t('preferences.title')} onClose={onClose}>
      <div className="dialog-body preferences-body">
        <fieldset className="theme-fieldset">
          <legend>{t('preferences.theme')}</legend>
          <div className="theme-options">
            {themes.map((theme) => (
              <button
                key={theme}
                className="theme-option"
                aria-pressed={preferences.theme === theme}
                onClick={() => updatePreferences({ theme })}
              >
                <span className={`theme-preview theme-preview-${theme}`} aria-hidden="true">
                  <i />
                  <span>
                    <b />
                    <b />
                    <b />
                  </span>
                </span>
                <span className="theme-option-label">
                  {theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
                  {t(`preferences.${theme}`)}
                  {preferences.theme === theme && <Check size={15} />}
                </span>
              </button>
            ))}
          </div>
        </fieldset>
        <Field label={t('preferences.language')}>
          <select
            value={preferences.language}
            onChange={(event) => updatePreferences({ language: event.target.value as Language })}
          >
            {languages.map((language) => (
              <option key={language} value={language} lang={language}>
                {languageNames[language]}
              </option>
            ))}
          </select>
        </Field>
        <p className={issue ? 'error-message' : 'muted'} role={issue ? 'alert' : 'status'}>
          {t(`preferences.${issue || 'saved'}`)}
        </p>
      </div>
    </Dialog>
  );
}
