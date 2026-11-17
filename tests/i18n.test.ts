import { describe, expect, it } from 'vitest';
import { i18n, resources } from '../src/i18n';
import { timeAgo } from '../src/lib/api';
import { ApiError, formatError } from '../src/lib/messages';
import { validateLocaleResource } from '../src/i18n/validate-resources';

describe('多语言资源和格式化', () => {
  it('所有语言的键和插值参数完整一致', () => {
    for (const [locale, resource] of Object.entries(resources))
      expect(
        validateLocaleResource(resources['zh-CN'].translation, resource.translation, locale),
      ).toEqual([]);
  });
  it('接受俄语和阿拉伯语所需的复数形式，并拒绝缺失形式或插值', () => {
    const base = { items_one: '{{count}} for {{name}}', items_other: '{{count}} for {{name}}' };
    const russian = {
      items_one: '{{count}} для {{name}}',
      items_few: '{{count}} для {{name}}',
      items_many: '{{count}} для {{name}}',
      items_other: '{{count}} для {{name}}',
    };
    expect(validateLocaleResource(base, russian, 'ru')).toEqual([]);
    const arabic = Object.fromEntries(
      ['zero', 'one', 'two', 'few', 'many', 'other'].map((form) => [
        `items_${form}`,
        '{{count}} لـ {{name}}',
      ]),
    );
    expect(validateLocaleResource(base, arabic, 'ar')).toEqual([]);
    expect(
      validateLocaleResource(
        base,
        { items_one: '{{count}} for {{name}}', items_other: '{{count}} for {{name}}' },
        'ru',
      ),
    ).toContain('ru: missing items_few');
    expect(validateLocaleResource(base, { ...russian, items_few: '{{count}}' }, 'ru')).toContain(
      'ru: mismatched parameters in items',
    );
  });
  it('英文使用复数规则，用户内容只作为插值原样呈现', () => {
    expect(i18n.t('board.repositories', { lng: 'en', count: 1 })).toBe('1 repository');
    expect(i18n.t('board.repositories', { lng: 'en', count: 2 })).toBe('2 repositories');
    expect(i18n.t('repository.viewNamed', { lng: 'en', name: '用户的仓库 <feature>' })).toBe(
      'View 用户的仓库 <feature>',
    );
  });
  it('时间按所选语言格式化，空值和无效时间不会伪造日期', () => {
    const now = Date.parse('2026-11-16T10:00:00Z');
    expect(timeAgo('2026-11-16T09:58:00Z', 'en', now)).toBe('2 minutes ago');
    expect(timeAgo('2026-11-16T09:58:00Z', 'zh-CN', now)).toBe('2分钟前');
    expect(timeAgo(null, 'en', now)).toBe('Never');
    expect(timeAgo('invalid', 'zh-CN', now)).toBe('未获取');
  });
  it('已存在的应用错误随语言重译，Git 技术详情保留', async () => {
    const error = new ApiError('gitFailed', 'fatal: custom diagnostic');
    await i18n.changeLanguage('en');
    expect(formatError(error)).toBe(
      'Git operation could not be completed.\nfatal: custom diagnostic',
    );
    await i18n.changeLanguage('zh-CN');
    expect(formatError(error)).toContain('Git 操作未完成。');
  });
});
