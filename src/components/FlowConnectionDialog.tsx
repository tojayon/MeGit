import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Board, FlowConnection, Repository } from '../../shared/types';
import { Dialog } from './Dialogs';
import { Field, focusFirstError } from './Field';
import { Button } from './Button';

export function FlowConnectionDialog({
  board,
  repositories,
  initial,
  onSave,
  onClose,
}: {
  board: Board;
  repositories: Repository[];
  initial?: Partial<FlowConnection>;
  onSave: (connection: FlowConnection) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const endpoints = [
    ...board.nodes.map((n) => ({
      id: n.id,
      title: repositories.find((r) => r.id === n.repoId)?.name || n.id,
    })),
    ...(board.notes || []).map((n) => ({ id: n.id, title: n.title })),
  ];
  const [draft, setDraft] = useState<FlowConnection>({
    id: initial?.id || crypto.randomUUID(),
    source: endpoints[0]?.id || '',
    target: endpoints[1]?.id || '',
    label: '',
    sourcePort: 'bottom',
    targetPort: 'top',
    ...initial,
  });
  const [error, setError] = useState<'different' | 'duplicate' | null>(null);
  return (
    <Dialog title={t('flowchart.connection')} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.source || !draft.target || draft.source === draft.target) {
            setError('different');
            focusFirstError(event.currentTarget);
            return;
          }
          if (
            board.connections?.some(
              (c) =>
                c.id !== draft.id &&
                c.source === draft.source &&
                c.target === draft.target &&
                c.label === draft.label.trim(),
            )
          ) {
            setError('duplicate');
            focusFirstError(event.currentTarget);
            return;
          }
          onSave({ ...draft, label: draft.label.trim() });
          onClose();
        }}
      >
        <div className="dialog-body inspector-fields">
          <p className="flow-connection-endpoints">
            {endpoints.find((n) => n.id === draft.source)?.title} →{' '}
            {endpoints.find((n) => n.id === draft.target)?.title}
          </p>
          <Field
            label={t('flowchart.condition')}
            error={error ? t(`relation.${error}`) : undefined}
          >
            <input
              maxLength={100}
              value={draft.label}
              onChange={(e) => {
                setDraft({ ...draft, label: e.target.value });
                setError(null);
              }}
            />
          </Field>
          {draft.waypoints?.length ? (
            <Button onClick={() => setDraft({ ...draft, waypoints: undefined })}>
              {t('flowchart.resetRoute')}
            </Button>
          ) : null}
          <p className="muted">{t('flowchart.manual')}</p>
        </div>
        <footer className="dialog-footer">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={endpoints.length < 2}>
            {t('common.save')}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
