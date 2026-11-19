import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FlowNote } from '../../shared/types';
import { Dialog } from './Dialogs';
import { Field } from './Field';
import { Button } from './Button';

export function NotePanel({
  note,
  viewKey,
  onSave,
  onClose,
}: {
  note: FlowNote;
  viewKey?: string;
  onSave: (fields: Pick<FlowNote, 'title' | 'text' | 'kind' | 'summary'>) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState({
    title: note.title,
    text: note.text,
    kind: note.kind,
    summary: note.summary,
    base: note,
  });
  if (
    draft.base.title !== note.title ||
    draft.base.text !== note.text ||
    draft.base.kind !== note.kind ||
    draft.base.summary !== note.summary
  )
    setDraft({
      title: note.title,
      text: note.text,
      kind: note.kind,
      summary: note.summary,
      base: note,
    });
  return (
    <Dialog
      viewKey={viewKey}
      title={t(note.kind && note.kind !== 'note' ? 'flowchart.details' : 'note.details')}
      closeLabel={t('note.close')}
      onClose={onClose}
    >
      <div className="dialog-body note-editor">
        <p className="muted">{t('note.help')}</p>
        <form
          className="inspector-fields"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.title.trim())
              onSave({
                title: draft.title.trim(),
                text: draft.text,
                kind: draft.kind,
                summary: draft.summary,
              });
          }}
        >
          <Field label={t('flowchart.shape')}>
            <select
              value={draft.kind || 'note'}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as FlowNote['kind'] })}
            >
              {(['note', 'process', 'decision', 'start', 'end'] as const).map((kind) => (
                <option key={kind} value={kind}>
                  {t(`flowchart.${kind}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('note.title')}>
            <input
              required
              maxLength={100}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </Field>
          {draft.kind && draft.kind !== 'note' && (
            <Field label={t('flowchart.summary')}>
              <textarea
                rows={2}
                maxLength={200}
                value={draft.summary || ''}
                onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
              />
            </Field>
          )}
          <Field label={t('note.text')}>
            <textarea
              rows={10}
              maxLength={2000}
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            />
          </Field>
          <Button
            type="submit"
            disabled={
              !draft.title.trim() ||
              (draft.title.trim() === note.title &&
                draft.text === note.text &&
                draft.kind === note.kind &&
                draft.summary === note.summary)
            }
          >
            {t('common.save')}
          </Button>
        </form>
      </div>
    </Dialog>
  );
}
