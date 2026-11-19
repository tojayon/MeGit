import { describe, expect, it } from 'vitest';
import { boardSvg, type ExportScene } from '../src/lib/board-export';

const colors = {
  canvas: 'Canvas',
  surface: 'Canvas',
  group: 'Canvas',
  text: 'CanvasText',
  muted: 'GrayText',
  border: 'GrayText',
  edge: 'LinkText',
  success: 'CanvasText',
  warning: 'CanvasText',
  danger: 'CanvasText',
};
describe('干净的白板导出', () => {
  it('仓库状态桥与执行箭头保持不同端点，保留关系原名且导出状态胶囊', () => {
    const edge = {
      id: 'relation',
      path: 'M 0 0 L 200 0',
      bounds: { x: 0, y: 0, width: 200, height: 0 },
      position: { x: 100, y: 0 },
      width: 100,
      label: '公共更新整合',
      status: '已整合',
      kind: 'integration',
    };
    const svg = boardSvg(
      {
        title: 'Bridge',
        nodes: [],
        edges: [edge, { ...edge, id: 'flow', kind: 'process', label: '执行', status: '' }],
      },
      colors,
    );
    expect(svg).toContain(
      'marker-start="url(#export-bridge-source)" marker-end="url(#export-bridge-target)"',
    );
    expect(svg).toContain('marker-end="url(#export-arrow)"');
    expect(svg).toContain('<title>公共更新整合</title>');
    expect(svg).toContain('rx="14"');
    expect(svg).toContain('已整合');
  });
  it('只包含显示投影，输出可移植矢量并转义用户内容，裁切覆盖负坐标与连线', () => {
    const scene: ExportScene = {
      title: 'Board <one>',
      nodes: [
        {
          id: 'g',
          kind: 'group',
          position: { x: -200, y: 0 },
          width: 500,
          height: 400,
          title: 'Client & server',
          subtitle: '2',
          lines: [],
        },
        {
          id: 'n',
          kind: 'note',
          position: { x: -180, y: 80 },
          width: 276,
          height: 180,
          title: '<script>alert(1)</script>',
          subtitle: 'Manual note',
          lines: ['First line', 'Next <value>'],
          privatePath: 'C:/private/credentials',
        } as ExportScene['nodes'][number],
      ],
      edges: [
        {
          id: 'e',
          path: 'M -200,-100 L 0,100',
          bounds: { x: -200, y: -100, width: 200, height: 200 },
          label: 'A → B',
          status: 'Flow',
          position: { x: 0, y: 0 },
          width: 180,
          kind: 'dependency',
        },
      ],
    };
    const result = boardSvg(scene, colors);
    expect(result).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(result).toContain('viewBox="-232 -132 564 564"');
    expect(result).toContain('Client &amp; server');
    expect(result).toContain('&lt;script&gt;');
    expect(result).toContain('Next &lt;value&gt;');
    expect(result).not.toMatch(/<script>|private|credentials|foreignObject|react-flow|canvas-tool/);
  });
  it('空场景也导出有效画布，不产生 Infinity 或 NaN', () => {
    expect(boardSvg({ title: 'Empty', nodes: [], edges: [] }, colors)).not.toMatch(/Infinity|NaN/);
  });
  it('仓库头像内嵌导出且只接受图片 data URL，不携带磁盘路径或外部资源', () => {
    const scene: ExportScene = {
      title: 'Avatar',
      edges: [],
      nodes: [
        {
          id: 'repo',
          kind: 'repository',
          position: { x: 0, y: 0 },
          width: 276,
          height: 180,
          title: 'Project',
          subtitle: 'main',
          lines: [],
          logoDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        },
      ],
    };
    expect(boardSvg(scene, colors)).toContain('<image');
    expect(boardSvg(scene, colors)).toContain('data:image/png;base64,iVBORw0KGgo=');
    for (const invalid of [
      'https://outside.invalid/logo.png',
      'file:///D:/private/logo.svg',
      'data:text/html;base64,AAAA',
    ]) {
      scene.nodes[0].logoDataUrl = invalid;
      expect(boardSvg(scene, colors)).not.toContain('<image');
      expect(boardSvg(scene, colors)).not.toContain(invalid);
    }
  });
});
