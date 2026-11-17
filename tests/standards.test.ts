import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { resources } from '../src/i18n';
import { languages } from '../src/i18n/languages';

describe('开发标准', () => {
  it('注册语言均有本地资源，资源均可从设置选择', () => {
    expect(Object.keys(resources).sort()).toEqual([...languages].sort());
  });
  it('两种主题的文字和状态色达到 WCAG AA 对比度', async () => {
    const source = await readFile(path.resolve('src/themes.css'), 'utf8');
    function luminance(hex: string) {
      const rgb = hex
        .match(/[a-f\d]{2}/gi)!
        .map((n) => parseInt(n, 16) / 255)
        .slice(0, 3)
        .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    }
    for (const [, theme, body] of source.matchAll(
      /:root\[data-theme='(dark|light)'\]\s*{([^}]+)}/g,
    )) {
      const tokens = Object.fromEntries(
        [...body.matchAll(/(--[\w-]+):\s*(#[\da-f]+);/g)].map((m) => [m[1], m[2]]),
      );
      for (const [foreground, background] of [
        ['text', 'surface'],
        ['muted', 'surface'],
        ['text-secondary', 'canvas'],
        ['muted', 'surface-raised'],
        ['accent', 'accent-soft'],
        ['on-accent', 'accent-solid'],
        ['green', 'green-soft'],
        ['orange', 'orange-soft'],
        ['danger', 'danger-soft'],
        ['diff-add-text', 'diff-add-bg'],
        ['diff-remove-text', 'diff-remove-bg'],
        ['diff-hunk-text', 'diff-hunk-bg'],
      ]) {
        const levels = [
          luminance(tokens[`--${foreground}`]),
          luminance(tokens[`--${background}`]),
        ].sort((a, b) => b - a);
        expect(
          (levels[0] + 0.05) / (levels[1] + 0.05),
          `${theme}: ${foreground} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
