import { useTranslation } from 'react-i18next';
import type { EdgeRouting, FlowEdge, PortSide } from '../../shared/types';
import { Field } from './Field';

export const portSides: PortSide[] = ['top', 'right', 'bottom', 'left'];

export function RelationAppearance({
  edge,
  onChange,
  portsOnly = false,
}: {
  edge: Pick<FlowEdge, 'routing' | 'sourcePort' | 'targetPort'>;
  onChange: (change: Partial<FlowEdge>) => void;
  portsOnly?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="relation-appearance inspector-fields">
      {!portsOnly && (
        <Field label={t('routing.label')}>
          <select
            aria-label={t('routing.label')}
            value={edge.routing || 'smoothstep'}
            onChange={(e) => onChange({ routing: e.target.value as EdgeRouting })}
          >
            {(['smoothstep', 'step', 'bezier', 'straight'] as const).map((routing) => (
              <option key={routing} value={routing}>
                {t(`routing.${routing}`)}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="two-fields">
        {(['sourcePort', 'targetPort'] as const).map((key) => (
          <Field key={key} label={t(`routing.${key}`)}>
            <select
              aria-label={t(`routing.${key}`)}
              value={edge[key] || (key === 'sourcePort' ? 'right' : 'left')}
              onChange={(e) => onChange({ [key]: e.target.value })}
            >
              {portSides.map((side) => (
                <option key={side} value={side}>
                  {t(`routing.${side}`)}
                </option>
              ))}
            </select>
          </Field>
        ))}
      </div>
    </div>
  );
}
