import { expect, it } from 'vitest';
import { relationPorts } from '../src/lib/relation-ports';

it('根据实际卡片中心选择相对连接边，保留显式端口和手动路线', () => {
  const a = { x: 0, y: 0, width: 280, height: 180 };
  expect(relationPorts({}, a, { ...a, x: 700 })).toEqual({
    sourcePort: 'right',
    targetPort: 'left',
  });
  expect(relationPorts({}, a, { ...a, y: 600 })).toEqual({
    sourcePort: 'bottom',
    targetPort: 'top',
  });
  expect(relationPorts({}, a, { ...a, x: -600, y: 400 })).toEqual({
    sourcePort: 'left',
    targetPort: 'right',
  });
  expect(relationPorts({ sourcePort: 'top' }, a, { ...a, x: 700 })).toEqual({
    sourcePort: 'top',
    targetPort: 'left',
  });
  expect(relationPorts({ waypoints: [{ x: 500, y: 300 }] }, a, { ...a, y: 600 })).toEqual({
    sourcePort: 'right',
    targetPort: 'left',
  });
});
