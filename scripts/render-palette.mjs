import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'public/brand');
const palette = JSON.parse(await fs.readFile(path.join(directory, 'palette.json'), 'utf8'));
const logo = await fs.readFile(path.join(directory, 'megit-logo.svg'), 'utf8');
const xml = (value) =>
  String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

function luminance(hex) {
  const rgb = [1, 3, 5].map((index) => {
    const c = parseInt(hex.slice(index, index + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
const textOn = (hex) => {
  const light = 1.05 / (luminance(hex) + 0.05);
  const dark = (luminance(hex) + 0.05) / (luminance('#000D1F') + 0.05);
  return dark >= light ? '#000D1F' : '#FFFFFF';
};
const familyNames = { blue: '深蓝', cyan: '亮青', lime: '品牌绿' };
const n = palette.neutral;
const parts = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1350" viewBox="0 0 1440 1350" role="img" aria-labelledby="title desc">',
  '<title id="title">MeGit 品牌与产品色卡</title>',
  '<desc id="desc">从 Logo 提取的四种原色、三组色阶、中性色、明暗主题用例，以及警告和危险扩展。全部数值见 palette.json。</desc>',
  `<rect width="1440" height="1350" fill="${n['50']}"/>`,
  '<g font-family="Segoe UI, Microsoft YaHei, sans-serif">',
];
function text(x, y, content, size = 16, fill = n['450'], weight = 400, extra = '') {
  parts.push(
    `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" ${extra}>${xml(content)}</text>`,
  );
}
function rect(x, y, width, height, fill, radius = 12, stroke = 'none') {
  parts.push(
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`,
  );
}

parts.push(
  logo
    .replace('<svg ', '<svg x="56" y="24" ')
    .replace(/width="\d+" height="\d+"/, 'width="190" height="91"'),
);
text(1384, 75, '品牌与产品配色  /  01', 14, n['400'], 500, 'text-anchor="end"');
text(56, 151, '由标志出发，让每个界面使用同一套颜色。', 28, n['800'], 600);
text(56, 185, 'LOGO 原色 · 语义色阶 · 明暗主题 · 对比度规范', 15, n['400']);

palette.core.forEach((color, index) => {
  const x = 56 + index * 336;
  rect(x, 218, 320, 174, color.hex, 12, color.id === 'white' ? palette.ramps.blue['200'] : 'none');
  text(x + 22, 253, `0${index + 1}`, 13, textOn(color.hex));
  text(x + 22, 337, color.name, 22, textOn(color.hex), 600);
  text(x + 22, 370, color.hex, 20, textOn(color.hex), 500);
  text(x + 1, 420, color.role, 14, n['450']);
});
text(56, 478, '同源色阶', 20, n['800'], 600);
text(1384, 478, '原色在色阶中标记 BASE', 13, n['400'], 400, 'text-anchor="end"');
Object.entries(palette.ramps).forEach(([family, ramp], row) => {
  const y = 503 + row * 86;
  text(56, y + 29, familyNames[family], 15, n['450'], 500);
  Object.entries(ramp).forEach(([level, hex], column) => {
    const x = 160 + column * 112;
    rect(x, y, 106, 50, hex, 5);
    const base = palette.core.some((color) => color.id === family && color.hex === hex);
    text(x + 10, y + 30, `${level}${base ? ' BASE' : ''}`, 11, textOn(hex), base ? 700 : 400);
    text(x + 1, y + 69, hex, 11, n['400']);
  });
});
text(56, 793, '中性色', 20, n['800'], 600);
const neutrals = ['0', '50', '100', '150', '200', '250', '400', '500', '600', '700', '800', '900'];
neutrals.forEach((level, index) => {
  const x = 56 + index * 112;
  rect(x, 815, 106, 46, n[level], 5, level === '0' ? palette.ramps.blue['200'] : 'none');
  text(x + 9, 844, level, 12, textOn(n[level]));
  text(x, 880, n[level], 11, n['400']);
});

function themePreview(theme, x, y, title) {
  const t = palette.themes[theme];
  rect(x, y, 654, 212, t.canvas, 12, t.border);
  text(x + 24, y + 35, title, 16, t.text, 600);
  text(x + 24, y + 64, '表面层级与文字保持克制，交互使用蓝 / 青。', 13, t.muted);
  rect(x + 24, y + 88, 292, 92, t.surface, 8, t['border-strong']);
  text(x + 40, y + 119, 'MeGit 开发流程', 15, t.text, 600);
  text(x + 40, y + 151, '查看仓库与关系', 13, t.accent);
  rect(x + 342, y + 88, 138, 38, t['accent-solid'], 6);
  text(x + 411, y + 112, '添加仓库', 14, t['on-accent'], 600, 'text-anchor="middle"');
  rect(x + 498, y + 88, 132, 38, t['green-soft'], 6, t['green-border']);
  text(x + 564, y + 112, '✓ 已包含', 14, t.green, 500, 'text-anchor="middle"');
  text(x + 344, y + 163, '主要动作 / 成功状态', 12, t.muted);
}
themePreview('dark', 56, 919, '默认暗黑');
themePreview('light', 730, 919, '明亮主题');
text(56, 1178, '功能扩展', 18, n['800'], 600);
text(171, 1178, '警告与危险不来自 Logo，仅用于状态和操作风险。', 14, n['400']);
[
  ['warning', '警告 / 待整合'],
  ['danger', '错误 / 冲突'],
].forEach(([family, name], index) => {
  const color = palette.functional[family];
  rect(56 + index * 336, 1198, 320, 44, color['light-bg'], 6, color['light-border']);
  text(72 + index * 336, 1226, `${name}  ${color['light-text']}`, 14, color['light-text'], 500);
});
text(750, 1219, '文字 ≥ 4.5:1  /  必要图形与焦点 ≥ 3:1', 15, n['450'], 500);
text(750, 1244, '亮青 / 绿色原色不直接用作白底小字。', 13, n['400']);
text(56, 1314, 'MeGit 配色规范 v1 · 2026-11-16', 13, n['400']);
text(
  1384,
  1314,
  '颜色数据 palette.json  /  运行时 themes.css',
  13,
  n['400'],
  400,
  'text-anchor="end"',
);
parts.push('</g></svg>');
const svg = parts.join('\n') + '\n';

const themeVariables = (theme) =>
  Object.entries(palette.themes[theme])
    .map(([key, hex]) => `--${key}:${hex}`)
    .join(';');
const allSwatches = Object.entries(palette.ramps)
  .map(
    ([family, ramp]) =>
      `<section class="ramp-section"><h3>${familyNames[family]}</h3><div class="ramp">${Object.entries(
        ramp,
      )
        .map(
          ([level, hex]) =>
            `<button type="button" class="ramp-swatch" data-copy="${hex}" aria-label="复制${familyNames[family]} ${level} ${hex}"><span class="paint" style="background:${hex};color:${textOn(hex)}">${level}${palette.core.some((color) => color.id === family && color.hex === hex) ? '<b>BASE</b>' : ''}</span><code>${hex}</code></button>`,
        )
        .join('')}</div></section>`,
  )
  .join('');
const coreCards = palette.core
  .map(
    (color, index) =>
      `<button type="button" class="core-swatch" data-copy="${color.hex}" aria-label="复制${color.name} ${color.hex}"><span class="core-paint" style="background:${color.hex};color:${textOn(color.hex)}"><small>0${index + 1}</small><strong>${color.name}</strong><code>${color.hex}</code></span><span class="swatch-role">${color.role}</span></button>`,
  )
  .join('');
const neutralCards = Object.entries(palette.neutral)
  .map(
    ([level, hex]) =>
      `<button type="button" class="ramp-swatch" data-copy="${hex}" aria-label="复制中性色 ${level} ${hex}"><span class="paint" style="background:${hex};color:${textOn(hex)}">${level}</span><code>${hex}</code></button>`,
  )
  .join('');
const previews = ['dark', 'light']
  .map(
    (theme) =>
      `<section class="theme-sample" style="${themeVariables(theme)}"><div class="sample-heading"><strong>${theme === 'dark' ? '默认暗黑' : '明亮主题'}</strong><code>${palette.themes[theme].canvas}</code></div><div class="sample-card"><strong>MeGit 开发流程</strong><span class="sample-muted">仓库和关系</span><div class="sample-link">查看提交历史 →</div></div><div class="sample-actions"><span class="sample-primary">添加仓库</span><span class="sample-success">✓ 已包含</span><span class="sample-warning">待整合</span><span class="sample-danger">冲突</span></div><div class="sample-muted">文字与状态使用语义色，结构使用中性色。</div></section>`,
  )
  .join('');

const html = `<!doctype html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MeGit · 品牌配色色卡</title>
<link rel="icon" type="image/svg+xml" href="megit-icon.svg">
<style>
:root{${themeVariables('dark')}}
:root[data-theme="light"]{${themeVariables('light')}}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--text);font:14px/1.7 'Segoe UI','Microsoft YaHei',sans-serif}button{font:inherit;cursor:pointer}button:focus-visible,a:focus-visible{outline:2px solid var(--focus);outline-offset:4px}button:disabled{cursor:default}.container{max-width:1248px;margin:auto;padding:32px 36px 48px}header{display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:1px solid var(--border);padding-bottom:26px}.brand{display:flex;align-items:center;gap:12px}.brand img{width:44px;height:44px;background:var(--brand-icon-surface);border-radius:7px;padding:2px}.brand strong{font-size:23px;color:var(--brand-wordmark);letter-spacing:-.7px}.brand small{display:block;color:var(--muted);font-size:11px}.controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.controls button{border:1px solid var(--border-strong);border-radius:6px;background:var(--surface);color:var(--text);padding:6px 12px}.controls button[aria-pressed="true"]{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}h1{font-size:30px;line-height:1.4;letter-spacing:-.7px;margin:34px 0 9px}p{margin:0;color:var(--muted)}h2{font-size:19px;margin:0;color:var(--text)}h3{font-size:13px;font-weight:500;color:var(--muted);margin:0 0 10px}.section-heading{display:flex;gap:18px;align-items:baseline;justify-content:space-between;margin:38px 0 18px}.section-heading span{font-size:12px;color:var(--muted)}.core-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:25px}.core-swatch{background:none;border:0;padding:0;min-width:0;text-align:left;color:var(--text)}.core-paint{display:flex;flex-direction:column;min-height:175px;padding:18px 20px;border-radius:9px;border:1px solid var(--border-strong)}.core-paint small{font-size:11px;opacity:.75}.core-paint strong{margin-top:45px;font-size:21px}.core-paint code{font-size:17px;margin-top:3px}.swatch-role{display:block;font-size:12px;color:var(--muted);padding-top:9px}.ramps{display:flex;flex-direction:column;gap:18px}.ramp{display:grid;grid-template-columns:repeat(11,minmax(0,1fr));gap:7px}.ramp-swatch{border:0;padding:0;background:none;min-width:0;color:var(--muted);text-align:left}.paint{height:52px;border-radius:5px;display:flex;align-items:center;justify-content:space-between;padding:8px;font-size:12px;border:1px solid var(--border)}.paint b{font-size:9px;letter-spacing:.4px}.ramp-swatch code{font-size:10px;display:block;margin-top:5px}.neutral-grid{display:grid;grid-template-columns:repeat(11,minmax(0,1fr));gap:14px 7px}.samples{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.theme-sample{padding:22px;border:1px solid var(--border-strong);border-radius:9px;background:var(--canvas);color:var(--text)}.sample-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}.sample-heading code{font-size:11px;color:var(--muted)}.sample-card{display:flex;flex-direction:column;padding:15px 16px;background:var(--surface);border:1px solid var(--border-strong);border-radius:6px}.sample-muted{font-size:12px;color:var(--muted)}.sample-link{color:var(--accent);font-size:12px;margin-top:13px}.sample-actions{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin:18px 0}.sample-actions span{padding:5px 10px;font-size:12px;border-radius:5px}.sample-primary{background:var(--accent-solid);color:var(--on-accent);font-weight:600}.sample-success{color:var(--green);background:var(--green-soft);border:1px solid var(--green-border)}.sample-warning{color:var(--orange);background:var(--orange-soft);border:1px solid var(--orange-border)}.sample-danger{color:var(--danger);background:var(--danger-soft);border:1px solid var(--danger-border)}.rules{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:24px;border-top:1px solid var(--border);margin-top:36px;padding-top:24px}.rules strong{font-size:14px}.rules p{font-size:12px;margin-top:7px}.functional{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:22px}.functional span{font-size:12px;color:var(--muted)}.functional button{border-radius:5px;padding:5px 10px;font-size:12px}.warning{color:var(--orange);background:var(--orange-soft);border:1px solid var(--orange-border)}.danger{color:var(--danger);background:var(--danger-soft);border:1px solid var(--danger-border)}footer{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;border-top:1px solid var(--border);padding-top:22px;margin-top:32px;color:var(--muted);font-size:12px}a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}#copy-status{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 18px;border:1px solid var(--border-strong);background:var(--surface-raised);color:var(--text);border-radius:6px;z-index:3}#copy-status:empty{display:none}code{font-family:Consolas,'Cascadia Code',monospace}@media(max-width:900px){.container{padding:24px}.ramp,.neutral-grid{grid-template-columns:repeat(6,minmax(0,1fr))}.samples,.rules{grid-template-columns:1fr}.core-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.section-heading{align-items:flex-start}.paint{height:48px}}@media(max-width:480px){.container{padding:20px 16px}header{align-items:flex-start}.controls{max-width:160px;justify-content:flex-end}.controls button{padding:5px 8px;font-size:12px}h1{font-size:24px}.core-grid{gap:14px 10px}.core-paint{padding:13px;min-height:157px}.core-paint strong{font-size:18px}.ramp,.neutral-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.section-heading{flex-direction:column;gap:5px}.brand strong{font-size:20px}.brand small{font-size:10px}}
</style>
</head>
<body><main class="container">
<header><div class="brand"><img src="megit-icon.svg" alt=""><div><strong>MeGit</strong><small>品牌配色规范 · v1</small></div></div><div class="controls" aria-label="色卡显示与复制"><a href="/design-system">组件规范</a><button type="button" data-theme="dark" aria-pressed="true">暗黑</button><button type="button" data-theme="light" aria-pressed="false">明亮</button><button type="button" id="copy-json">复制全部颜色</button></div></header>
<h1>由标志出发，让界面保持一致。</h1><p>四种原色、同源色阶与双主题映射。点击色块即可复制 HEX。</p>
<div class="core-grid">${coreCards}</div>
<div class="section-heading"><h2>品牌色阶</h2><span>BASE 为 Logo 原色；其他为白 / 黑混合色阶。</span></div><div class="ramps">${allSwatches}</div>
<div class="section-heading"><h2>中性色</h2><span>表面、文字、细边框与结构层级</span></div><div class="neutral-grid">${neutralCards}</div>
<div class="section-heading"><h2>两种主题，同一套语义</h2><span>实际产品颜色示例</span></div><div class="samples">${previews}</div>
<div class="functional"><span>功能扩展 · 并非 Logo 原色</span><button type="button" class="warning" id="copy-warning">警告</button><button type="button" class="danger" id="copy-danger">危险</button><span>仅用于实际状态或操作风险。</span></div>
<div class="rules"><div><strong>中性色为主，品牌色强调</strong><p>约 80–90% 中性结构、8–15% 蓝 / 青交互、2–5% 成功绿。比例是设计参考。</p></div><div><strong>文字 4.5:1 / 必要图形 3:1</strong><p>白底小字使用深青或深绿。亮青实底配深墨字，深蓝实底配白字。</p></div><div><strong>颜色统一通过语义使用</strong><p>界面使用 themes.css 的语义变量，禁止在组件内新增未登记色值。</p></div></div>
<footer><span>取自已确认的 MeGit SVG · 2026-11-16</span><span><a href="megit-palette.svg">矢量色卡</a> · <a href="palette.json">颜色数据</a></span></footer>
</main><div id="copy-status" role="status" aria-live="polite"></div>
<script id="palette-data" type="application/json">${JSON.stringify(palette).replaceAll('<', '\\u003c')}</script>
<script>
const palette=JSON.parse(document.getElementById('palette-data').textContent);
const status=document.getElementById('copy-status');let timer;
async function copy(value){try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(value)}else{const input=document.createElement('textarea');input.value=value;input.style.cssText='position:fixed;left:-9999px';document.body.append(input);input.select();const ok=document.execCommand('copy');input.remove();if(!ok)throw new Error('copy unavailable')}clearTimeout(timer);status.textContent=value.startsWith('{')?'已复制全部颜色数据':'已复制 '+value;timer=setTimeout(()=>{status.textContent=''},2200)}catch{status.textContent='浏览器未允许复制，请使用色块旁的色值。'}}
document.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',()=>copy(button.dataset.copy)));
document.querySelectorAll('button[data-theme]').forEach(button=>button.addEventListener('click',()=>{document.documentElement.dataset.theme=button.dataset.theme;document.querySelectorAll('button[data-theme]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)))}));
document.getElementById('copy-json').addEventListener('click',()=>copy(JSON.stringify(palette,null,2)));
document.getElementById('copy-warning').addEventListener('click',()=>copy(palette.themes[document.documentElement.dataset.theme].orange));
document.getElementById('copy-danger').addEventListener('click',()=>copy(palette.themes[document.documentElement.dataset.theme].danger));
</script></body></html>
`;

for (const [name, output] of [
  ['megit-palette.svg', svg],
  ['color-palette.html', html],
]) {
  const target = path.join(directory, name);
  if (process.argv.includes('--check')) {
    const current = await fs.readFile(target, 'utf8').catch(() => '');
    if (current !== output) {
      console.error(`${name} is out of date; run npm run brand:palette.`);
      process.exitCode = 1;
    }
  } else await fs.writeFile(target, output);
}
if (!process.exitCode)
  console.log(
    process.argv.includes('--check')
      ? 'Brand palette exports are up to date.'
      : 'Created SVG and interactive HTML color cards.',
  );
