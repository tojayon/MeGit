export const PREFERENCES_KEY = 'megit.preferences';
export const themes = ['dark', 'light'] as const;
import { languages, type Language } from '../i18n/languages';
export { languages, type Language } from '../i18n/languages';
export type Theme = (typeof themes)[number];
export interface Preferences {
  version: 1;
  theme: Theme;
  language: Language;
  navigationCollapsed: boolean;
  inspectorWidth: number;
  snappingEnabled: boolean;
}
export const defaults: Preferences = {
  version: 1,
  theme: 'dark',
  language: 'zh-CN',
  navigationCollapsed: false,
  inspectorWidth: 365,
  snappingEnabled: true,
};
export type PreferenceIssue = 'unavailable' | 'invalid' | null;
type StorageAccess = () => Pick<Storage, 'getItem' | 'setItem'>;
export function readPreferences(storage: StorageAccess): {
  preferences: Preferences;
  issue: PreferenceIssue;
} {
  try {
    const raw = storage().getItem(PREFERENCES_KEY);
    if (!raw) return { preferences: { ...defaults }, issue: null };
    const value = JSON.parse(raw);
    if (
      value?.version !== 1 ||
      !themes.includes(value.theme) ||
      !languages.includes(value.language) ||
      (value.navigationCollapsed !== undefined && typeof value.navigationCollapsed !== 'boolean') ||
      (value.snappingEnabled !== undefined && typeof value.snappingEnabled !== 'boolean') ||
      (value.inspectorWidth !== undefined &&
        (typeof value.inspectorWidth !== 'number' ||
          !Number.isFinite(value.inspectorWidth) ||
          value.inspectorWidth <= 0 ||
          value.inspectorWidth > 16384))
    )
      return { preferences: { ...defaults }, issue: 'invalid' };
    return {
      preferences: {
        version: 1,
        theme: value.theme,
        language: value.language,
        navigationCollapsed: value.navigationCollapsed ?? false,
        inspectorWidth: value.inspectorWidth ?? defaults.inspectorWidth,
        snappingEnabled: value.snappingEnabled ?? defaults.snappingEnabled,
      },
      issue: null,
    };
  } catch (error) {
    return {
      preferences: { ...defaults },
      issue: error instanceof SyntaxError ? 'invalid' : 'unavailable',
    };
  }
}
export function writePreferences(
  storage: StorageAccess,
  preferences: Preferences,
): PreferenceIssue {
  try {
    storage().setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    return null;
  } catch {
    return 'unavailable';
  }
}
