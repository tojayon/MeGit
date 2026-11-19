import type { Point, Size } from './whiteboard';
import type { FlowNote } from '../../shared/types';

type Tone = 'success' | 'warning' | 'danger';
type ExportNode = {
  id: string;
  kind: 'repository' | 'group' | 'note';
  position: Point;
  width: number;
  height: number;
  title: string;
  subtitle: string;
  lines: string[];
  tone?: Tone;
  logoDataUrl?: string;
  shape?: FlowNote['kind'];
};
type ExportEdge = {
  id: string;
  path: string;
  bounds: Point & Size;
  label: string;
  status: string;
  position: Point;
  width: number;
  kind: string;
  tone?: Tone;
};
export type ExportScene = { title: string; nodes: ExportNode[]; edges: ExportEdge[] };
export type ExportColors = Record<
  'canvas' | 'surface' | 'group' | 'text' | 'muted' | 'border' | 'edge' | Tone,
  string
>;
const xml = (text: string) =>
  [...text]
    .filter((c) => c.charCodeAt(0) >= 32 || ['\n', '\r', '\t'].includes(c))
    .join('')
    .replace(
      /[<>&"']/g,
      (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
    );
const round = (n: number) => Math.round(n * 100) / 100;
const edgeLabelWidth = (edge: ExportEdge) =>
  Math.max(
    100,
    edge.width,
    edge.kind === 'process'
      ? [...edge.label].reduce(
          (width, char) => width + (char.codePointAt(0)! > 255 ? 11 : 11 * 0.57),
          20,
        )
      : 0,
  );

export function exportBounds(scene: ExportScene) {
  const boxes = [
    ...scene.nodes.map((n) => ({ ...n.position, width: n.width, height: n.height })),
    ...scene.edges.flatMap((e) => [
      e.bounds,
      {
        x: e.position.x - edgeLabelWidth(e) / 2,
        y: e.position.y - 16,
        width: edgeLabelWidth(e),
        height: 32,
      },
    ]),
  ];
  if (!boxes.length) return { x: 0, y: 0, width: 640, height: 360 };
  const x = Math.min(...boxes.map((b) => b.x)) - 32;
  const y = Math.min(...boxes.map((b) => b.y)) - 32;
  return {
    x: round(x),
    y: round(y),
    width: round(Math.max(...boxes.map((b) => b.x + b.width)) + 32 - x),
    height: round(Math.max(...boxes.map((b) => b.y + b.height)) + 32 - y),
  };
}

function wrap(text: string, width: number, size: number) {
  const result: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '',
      length = 0;
    for (const char of paragraph) {
      const advance = char.codePointAt(0)! > 255 ? size : size * 0.57;
      if (length + advance > width && line) {
        result.push(line);
        line = '';
        length = 0;
      }
      line += char;
      length += advance;
    }
    result.push(line);
  }
  return result;
}
const shorten = (text: string, width: number, size = 13) => {
  const lines = wrap(text.replace(/\s+/g, ' '), width, size);
  return lines.length > 1 ? lines[0].slice(0, -1) + '…' : lines[0] || '';
};

export function boardSvg(scene: ExportScene, colors: ExportColors) {
  const bounds = exportBounds(scene);
  const text = (
    x: number,
    y: number,
    value: string,
    size = 13,
    color = colors.text,
    weight = 400,
  ) =>
    `<text x="${round(x)}" y="${round(y)}" font-size="${size}" fill="${xml(color)}" font-weight="${weight}">${xml(value)}</text>`;
  const rect = (
    x: number,
    y: number,
    width: number,
    height: number,
    fill = colors.surface,
    dashed = false,
  ) =>
    `<rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" rx="8" fill="${xml(fill)}" stroke="${xml(colors.border)}"${dashed ? ' stroke-dasharray="5 4"' : ''}/>`;
  const groups = scene.nodes
    .filter((n) => n.kind === 'group')
    .map(
      (n) =>
        rect(n.position.x, n.position.y, n.width, n.height, colors.group) +
        text(
          n.position.x + 16,
          n.position.y + 27,
          shorten(n.title, n.width - 60),
          13,
          colors.text,
          600,
        ) +
        text(n.position.x + n.width - 32, n.position.y + 27, n.subtitle, 11, colors.muted) +
        n.lines
          .map((line, i) =>
            text(
              n.position.x + 16,
              n.position.y + 65 + i * 18,
              shorten(line, n.width - 32, 12),
              12,
              n.tone ? colors[n.tone] : colors.muted,
            ),
          )
          .join(''),
    )
    .join('');
  const paths = scene.edges
    .map(
      (e) =>
        e.kind === 'process'
          ? `<path d="${xml(e.path)}" fill="none" stroke="${xml(colors.edge)}" stroke-width="1.8" marker-end="url(#export-arrow)"/>`
          : `<g fill="none" stroke-linejoin="round"><path d="${xml(e.path)}" stroke="${xml(colors.edge)}" stroke-width="7.5"/><path d="${xml(e.path)}" stroke="${xml(colors.canvas)}" stroke-width="5.5"/><path d="${xml(e.path)}" stroke="${xml(colors.edge)}" stroke-width="3" marker-start="url(#export-bridge-source)" marker-end="url(#export-bridge-target)"/></g>`,
    )
    .join('');
  const nodes = scene.nodes
    .filter((n) => n.kind !== 'group')
    .map((n) => {
      const { x, y } = n.position;
      if (n.shape && n.shape !== 'note') {
        const isDecision = n.shape === 'decision';
        const shape = isDecision
          ? `<polygon points="${x + n.width / 2},${y} ${x + n.width},${y + n.height / 2} ${x + n.width / 2},${y + n.height} ${x},${y + n.height / 2}" fill="none" stroke="${xml(colors.border)}"/>`
          : `<rect x="${x}" y="${y}" width="${n.width}" height="${n.height}" rx="${n.shape === 'process' ? 8 : n.height / 2}" fill="none" stroke="${xml(colors.border)}"/>`;
        const lineLimit = n.shape === 'start' || n.shape === 'end' ? 1 : 2;
        const visibleLines = (value: string) => {
          const wrapped = wrap(value, n.width - (isDecision ? 100 : 32), 12);
          const visible = wrapped.slice(0, lineLimit);
          if (wrapped.length > lineLimit)
            visible[lineLimit - 1] = visible[lineLimit - 1].slice(0, -1) + '…';
          return visible;
        };
        const lines = [...visibleLines(n.title), ...n.lines.filter(Boolean).flatMap(visibleLines)];
        return (
          shape +
          lines
            .map((line, i) =>
              text(
                x + n.width / 2,
                y + n.height / 2 - (lines.length - 1) * 8 + i * 16 + 4,
                line,
                12,
              ).replace('<text ', '<text text-anchor="middle" '),
            )
            .join('')
        );
      }
      const isNote = n.kind === 'note';
      const logo =
        !isNote &&
        n.logoDataUrl &&
        /^data:image\/(?:png|jpeg|webp|gif|x-icon|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(
          n.logoDataUrl,
        )
          ? n.logoDataUrl
          : undefined;
      const titleInset = logo ? 52 : 16;
      const lines = n.lines.flatMap((line) => wrap(line, n.width - 32, 12));
      const limit = isNote ? 4 : 2;
      const visible = lines.slice(0, limit);
      if (lines.length > limit) visible[limit - 1] = visible[limit - 1].slice(0, -1) + '…';
      return (
        rect(x, y, n.width, n.height, colors.surface, isNote) +
        (isNote ? text(x + 16, y + 25, n.subtitle, 11, colors.muted) : '') +
        (logo
          ? `<image x="${round(x + 16)}" y="${round(y + 12)}" width="28" height="28" preserveAspectRatio="xMidYMid meet" href="${xml(logo)}"/>`
          : '') +
        text(
          x + titleInset,
          y + (isNote ? 52 : 30),
          shorten(n.title, n.width - titleInset - 16),
          13,
          colors.text,
          600,
        ) +
        (!isNote
          ? text(x + 16, y + 61, shorten(n.subtitle, n.width - 32, 12), 12, colors.muted)
          : '') +
        visible
          .map((line, i) =>
            text(
              x + 16,
              y + (isNote ? 77 : 91) + i * 18,
              line,
              12,
              !isNote && n.tone ? colors[n.tone] : colors.text,
            ),
          )
          .join('')
      );
    })
    .join('');
  const labels = scene.edges
    .filter((e) => e.label || e.status)
    .map((e) => {
      const width = edgeLabelWidth(e);
      return (
        rect(e.position.x - width / 2, e.position.y - 14, width, 28).replace(
          'rx="8"',
          e.kind === 'process' ? 'rx="8"' : 'rx="14"',
        ) +
        `<title>${xml(e.label)}</title>` +
        text(
          e.position.x - width / 2 + 10,
          e.position.y + 4,
          e.kind === 'process' ? e.label : shorten(e.status || e.label, width - 20, 12),
          11,
          e.tone ? colors[e.tone] : colors.text,
        )
      );
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}" font-family="Segoe UI, Microsoft YaHei, sans-serif"><title>${xml(scene.title)}</title><defs><marker id="export-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${xml(colors.edge)}"/></marker><marker id="export-bridge-source" viewBox="-6 -6 12 12" refX="0" refY="0" markerWidth="16" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto"><circle r="3.5" fill="${xml(colors.canvas)}" stroke="${xml(colors.edge)}" stroke-width="1.8"/></marker><marker id="export-bridge-target" viewBox="-8 -8 16 16" refX="0" refY="0" markerWidth="20" markerHeight="20" markerUnits="userSpaceOnUse" orient="auto"><path d="M -5 -6 Q 0 -6 0 0 Q 0 6 -5 6" fill="none" stroke="${xml(colors.edge)}" stroke-width="2" stroke-linecap="round"/></marker></defs><rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="${xml(colors.canvas)}"/>${groups}${paths}${nodes}${labels}</svg>`;
}

export async function downloadBoard(
  scene: ExportScene,
  colors: ExportColors,
  format: 'svg' | 'png',
) {
  let blob = new Blob([boardSvg(scene, colors)], { type: 'image/svg+xml;charset=utf-8' });
  if (format === 'png') {
    const source = URL.createObjectURL(blob);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = reject;
        image.src = source;
      });
      const { width, height } = exportBounds(scene);
      const scale = Math.min(
        2,
        8192 / width,
        8192 / height,
        Math.sqrt(16_000_000 / (width * height)),
      );
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('png'))), 'image/png'),
      );
    } finally {
      URL.revokeObjectURL(source);
    }
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${scene.title.replace(/[<>:"/\\|?*]|\p{Cc}/gu, '_').slice(0, 80) || 'MeGit'}.${format}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
