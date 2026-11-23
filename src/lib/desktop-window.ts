import { createContext } from 'react';

export interface DesktopWindowSettings {
  systemTitleBar: boolean;
  closeToTray: boolean;
}

export type DesktopSetting = 'setSystemTitleBar' | 'setCloseToTray';
export type WindowAction = 'drag' | 'minimize' | 'toggleMaximize' | 'close';

type DesktopRequest =
  | { action: 'read' | WindowAction }
  | { action: 'setLanguage'; language: 'en' | 'zh-CN' }
  | { action: DesktopSetting; enabled: boolean };

declare global {
  interface Window {
    megitDesktop?: (request: DesktopRequest) => Promise<DesktopWindowSettings>;
  }
}

export const DesktopWindowContext = createContext<{
  settings?: DesktopWindowSettings;
  busy: boolean;
  error: 'read' | 'save' | null;
  save: (action: DesktopSetting, enabled: boolean) => Promise<void>;
  reload: () => Promise<void>;
  run: (action: WindowAction) => Promise<void>;
} | null>(null);
