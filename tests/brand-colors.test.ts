import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

type Palette = {
  core: { id: string; hex: string; logoColors: string[] }[];
  ramps: Record<string, Record<string, string>>;
  neutral: Record<string, string>;
  functional: Record<string, Record<string, string>>;
  themes: Record<string, Record<string, string>>;
};

async function loadPalette(): Promise<Palette> {
  return JSON.parse(await readFile('public/brand/palette.json', 'utf8'));
}

function luminance(hex: string) {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(first: string, second: string) {
  const levels = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (levels[0] + 0.05) / (levels[1] + 0.05);
}

describe('MeGit 品牌色规范', () => {
  it('品牌原色均取自已确认的 SVG，渐变端点完整记录', async () => {
    const palette = await loadPalette();
    const svg = await readFile('public/brand/megit-logo.svg', 'utf8');
    const logoColors = new Set(
      [...svg.matchAll(/#[\da-f]{6}\b/gi)].map(([hex]) => hex.toUpperCase()),
    );
    if (/fill="#fff"/.test(svg)) logoColors.add('#FFFFFF');
    expect(palette.core.map((color) => color.hex)).toEqual([
      '#01357C',
      '#86D21F',
      '#00A9F3',
      '#FFFFFF',
    ]);
    const catalogued = new Set(palette.core.flatMap((color) => color.logoColors));
    expect([...catalogued].sort()).toEqual([...logoColors].sort());
    for (const color of palette.core) expect(logoColors.has(color.hex)).toBe(true);
  });

  it('运行时两套主题只使用色卡内的颜色，且与交付规范一致', async () => {
    const palette = await loadPalette();
    const source = await readFile('src/themes.css', 'utf8');
    const allowed = new Set([
      ...palette.core.flatMap((color) => color.logoColors),
      ...Object.values(palette.ramps).flatMap(Object.values),
      ...Object.values(palette.neutral),
      ...Object.values(palette.functional).flatMap(Object.values),
    ]);
    const blocks = [...source.matchAll(/:root\[data-theme='(dark|light)'\]\s*{([^}]+)}/g)];
    expect(blocks).toHaveLength(2);
    for (const [, theme, body] of blocks) {
      const tokens = Object.fromEntries(
        [...body.matchAll(/--([\w-]+):\s*(#[\da-f]+);/gi)].map(([, key, hex]) => [
          key,
          hex.toUpperCase(),
        ]),
      );
      expect(tokens).toEqual(palette.themes[theme]);
      for (const [key, hex] of Object.entries(tokens)) {
        expect(allowed.has(hex.slice(0, 7)), `${theme}: ${key} = ${hex}`).toBe(true);
      }
    }
  });

  it('主要动作、辅助色、连线与焦点在各自使用场景保持可辨识', async () => {
    const { themes } = await loadPalette();
    for (const [theme, tokens] of Object.entries(themes)) {
      for (const foreground of ['accent', 'green', 'orange', 'danger', 'muted', 'placeholder']) {
        for (const background of ['surface', 'surface-raised', 'canvas']) {
          expect(
            contrast(tokens[foreground], tokens[background]),
            `${theme}: ${foreground} on ${background}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
      for (const foreground of ['edge-integration', 'edge-neutral', 'focus', 'handle']) {
        for (const background of ['canvas', 'whiteboard-surface']) {
          expect(
            contrast(tokens[foreground], tokens[background]),
            `${theme}: ${foreground} on ${background}`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
      for (const foreground of ['text', 'text-secondary']) {
        expect(contrast(tokens[foreground], tokens['whiteboard-surface'])).toBeGreaterThanOrEqual(
          4.5,
        );
      }
      for (const background of ['accent-solid', 'accent-hover']) {
        expect(
          contrast(tokens['on-accent'], tokens[background]),
          `${theme}: button text on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      for (const foreground of ['card-toolbar-text', 'card-toolbar-accent']) {
        for (const background of ['card-toolbar-bg', 'card-toolbar-disabled']) {
          expect(contrast(tokens[foreground], tokens[background])).toBeGreaterThanOrEqual(4.5);
        }
      }
      for (const background of ['card-stage-bg', 'card-stage-hover']) {
        expect(contrast(tokens['card-stage-text'], tokens[background])).toBeGreaterThanOrEqual(4.5);
      }
      for (const background of ['sync-pull-bg', 'sync-pull-hover']) {
        expect(contrast(tokens['sync-pull-text'], tokens[background])).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(tokens.canvas, tokens.danger)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens['card-toolbar-bg'], tokens['card-commit-hover'])).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrast(tokens['card-input-accent'], tokens['card-input-hover'])).toBeGreaterThanOrEqual(
        4.5,
      );
      for (const foreground of ['card-input-text', 'card-input-muted', 'card-input-accent']) {
        expect(contrast(tokens[foreground], tokens['card-input-bg'])).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
