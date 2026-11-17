// Autonyms are intentionally displayed in their own language.
export const languageNames = { 'zh-CN': '简体中文', en: 'English' } as const;
export type Language = keyof typeof languageNames;
export const languages = Object.keys(languageNames) as Language[];
