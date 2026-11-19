import { useNodeId, useStore } from '@xyflow/react';

/** Highlight the existing node handles without changing React Flow's hit geometry. */
export function useSelectedConnectionPorts() {
  const id = useNodeId();
  return useStore((state) =>
    state.edges
      .flatMap((edge) => {
        if (!edge.selected || edge.reconnectable === false) return [];
        return [
          ...(edge.source === id && edge.sourceHandle ? [edge.sourceHandle] : []),
          ...(edge.target === id && edge.targetHandle ? [edge.targetHandle] : []),
        ];
      })
      .join(','),
  );
}
