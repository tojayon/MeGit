import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Handle,
  Position,
  useStore,
  useNodeConnections,
  useNodeId,
  useUpdateNodeInternals,
} from '@xyflow/react';
import { portSides } from './RelationAppearance';
import { useSelectedConnectionPorts } from '../lib/use-selected-connection-ports';

const positions = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

export function RepositoryPorts({ name }: { name: string }) {
  const { t } = useTranslation();
  const id = useNodeId();
  const selectedPorts = useSelectedConnectionPorts().split(',');
  const connections = useNodeConnections();
  const updateNodeInternals = useUpdateNodeInternals();
  const activeType = useStore((state) => {
    const from = state.connection.inProgress
      ? state.connection.fromHandle.type
      : state.connectionClickStartHandle?.type;
    return from === 'source' ? 'target' : 'source';
  });
  const splitSides = portSides
    .filter(
      (side) =>
        connections.some((c) => c.source === id && c.sourceHandle === `source-${side}`) &&
        connections.some((c) => c.target === id && c.targetHandle === `target-${side}`),
    )
    .join(',');

  useEffect(() => {
    if (id) updateNodeInternals(id);
  }, [id, splitSides, updateNodeInternals]);

  return portSides.flatMap((side) => {
    const shared = !splitSides.split(',').includes(side);
    return (['target', 'source'] as const).map((type) => {
      const active = !shared || type === activeType;
      const offset = shared ? 50 : type === 'target' ? 43 : 57;
      return (
        <Handle
          key={`${type}-${side}`}
          id={`${type}-${side}`}
          className={
            selectedPorts.includes(`${type}-${side}`) ||
            (shared && selectedPorts.some((port) => port.endsWith(`-${side}`)))
              ? 'is-edge-selected'
              : undefined
          }
          type={type}
          position={positions[side]}
          style={{
            ...(side === 'top' || side === 'bottom'
              ? { left: `${offset}%` }
              : { top: `${offset}%` }),
            borderRadius: shared ? '50%' : undefined,
            opacity: active ? undefined : 0,
            pointerEvents: active ? undefined : 'none',
          }}
          aria-hidden={!active || undefined}
          aria-label={t(
            shared
              ? 'routing.connectionPoint'
              : type === 'target'
                ? 'routing.input'
                : 'routing.output',
            {
              name,
              side: t(`routing.${side}`),
            },
          )}
        />
      );
    });
  });
}
