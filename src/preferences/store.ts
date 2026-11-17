import { useSyncExternalStore } from 'react';
import { i18n } from '../i18n';
import { readPreferences, writePreferences, PREFERENCES_KEY, type Preferences } from './storage';

const storage = () => window.localStorage;
let current = readPreferences(storage);
const listeners = new Set<() => void>();
function apply() {
  document.documentElement.dataset.theme = current.preferences.theme;
  document.documentElement.lang = current.preferences.language;
  void i18n.changeLanguage(current.preferences.language);
  document.title = i18n.t('app.title');
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute('content', i18n.t('app.description'));
  const color = getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}
export function initializePreferences() {
  apply();
  window.addEventListener('storage', (event) => {
    if (event.key !== PREFERENCES_KEY && event.key !== null) return;
    current = readPreferences(storage);
    apply();
    listeners.forEach((listener) => listener());
  });
}
export function updatePreferences(patch: Partial<Omit<Preferences, 'version'>>) {
  const preferences = { ...current.preferences, ...patch };
  current = { preferences, issue: writePreferences(storage, preferences) };
  apply();
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function usePreferences() {
  return useSyncExternalStore(subscribe, () => current);
}
