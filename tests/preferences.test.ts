import { describe, expect, it } from 'vitest';
import {
  defaults,
  readPreferences,
  writePreferences,
  PREFERENCES_KEY,
} from '../src/preferences/storage';

function memoryStorage(raw: string | null = null) {
  const values = new Map<string, string>(raw === null ? [] : [[PREFERENCES_KEY, raw]]);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
describe('主题和语言偏好', () => {
  it('旧偏好默认开启智能吸附，开关独立保存且拒绝无效值', () => {
    const storage = memoryStorage('{"version":1,"theme":"dark","language":"zh-CN"}');
    expect(readPreferences(() => storage).preferences.snappingEnabled).toBe(true);
    writePreferences(() => storage, { ...defaults, snappingEnabled: false });
    expect(readPreferences(() => storage).preferences.snappingEnabled).toBe(false);
    const invalid = memoryStorage(JSON.stringify({ ...defaults, snappingEnabled: 'yes' }));
    expect(readPreferences(() => invalid).issue).toBe('invalid');
  });
  it('保存详情区域宽度，旧偏好补默认值，无效宽度不会覆盖原配置', () => {
    const storage = memoryStorage('{"version":1,"theme":"dark","language":"zh-CN"}');
    expect(readPreferences(() => storage).preferences.inspectorWidth).toBe(365);
    writePreferences(() => storage, { ...defaults, inspectorWidth: 800 });
    expect(readPreferences(() => storage).preferences.inspectorWidth).toBe(800);
    for (const width of [-1, 0, 'wide', null]) {
      const raw = JSON.stringify({ ...defaults, inspectorWidth: width });
      const invalid = memoryStorage(raw);
      expect(readPreferences(() => invalid).issue).toBe('invalid');
      expect(invalid.getItem(PREFERENCES_KEY)).toBe(raw);
    }
  });
  it('恢复导航折叠状态，同时兼容未包含该字段的版本 1 偏好', () => {
    const storage = memoryStorage('{"version":1,"theme":"light","language":"en"}');
    expect(readPreferences(() => storage)).toEqual({
      preferences: { ...defaults, theme: 'light', language: 'en', navigationCollapsed: false },
      issue: null,
    });
    writePreferences(() => storage, { ...defaults, navigationCollapsed: true });
    expect(readPreferences(() => storage).preferences).toMatchObject({ navigationCollapsed: true });
  });
  it('不接受非布尔的导航折叠偏好，也不覆盖存储', () => {
    const raw = '{"version":1,"theme":"light","language":"en","navigationCollapsed":"false"}';
    const storage = memoryStorage(raw);
    expect(readPreferences(() => storage)).toEqual({ preferences: defaults, issue: 'invalid' });
    expect(storage.getItem(PREFERENCES_KEY)).toBe(raw);
  });
  it('首次使用为暗黑与简体中文，切换后能独立恢复', () => {
    const storage = memoryStorage();
    expect(readPreferences(() => storage)).toEqual({ preferences: defaults, issue: null });
    expect(
      writePreferences(() => storage, { ...defaults, theme: 'light', language: 'en' }),
    ).toBeNull();
    const first = readPreferences(() => storage).preferences;
    expect(first).toMatchObject({ theme: 'light', language: 'en' });
    writePreferences(() => storage, { ...first, theme: 'dark' });
    expect(readPreferences(() => storage).preferences).toMatchObject({
      theme: 'dark',
      language: 'en',
    });
  });
  it.each([
    'bad json',
    'null',
    '[]',
    '{"version":2,"theme":"light","language":"en"}',
    '{"version":1,"theme":"system","language":"en"}',
    '{"version":1,"theme":"dark","language":"unknown"}',
  ])('损坏或不支持的配置回退默认，不静默覆盖：%s', (raw) => {
    const storage = memoryStorage(raw);
    expect(readPreferences(() => storage)).toEqual({ preferences: defaults, issue: 'invalid' });
    expect(storage.getItem(PREFERENCES_KEY)).toBe(raw);
  });
  it('读取或写入受限时返回可呈现的状态', () => {
    const blocked = () => {
      throw new Error('Access denied');
    };
    expect(readPreferences(blocked)).toEqual({ preferences: defaults, issue: 'unavailable' });
    expect(writePreferences(blocked, defaults)).toBe('unavailable');
    expect(
      writePreferences(
        () => ({
          getItem: () => null,
          setItem: () => {
            throw new Error('Quota');
          },
        }),
        defaults,
      ),
    ).toBe('unavailable');
  });
});
