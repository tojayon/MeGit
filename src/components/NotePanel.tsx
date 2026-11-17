import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FlowNote } from '../../shared/types';
import { Dialog } from './Dialogs';
import { Field } from './Field';
import { Button } from './Button';

export function NotePanel({
  note,
  onSave,
  onClose,
}: {
  note: FlowNote;
  onSave: (fields: Pick<FlowNote, 'title' | 'text'>) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState({ title: note.title, text: note.text, base: note });
  if (draft.base.title !== note.title || draft.base.text !== note.text)
    setDraft({ title: note.title, text: note.text, base: note });
  return (
    <Dialog title={t('note.details')} closeLabel={t('note.close')} onClose={onClose}>
      <div className="dialog-body note-editor">
        <p className="muted">{t('note.help')}</p>
        <form
          className="inspector-fields"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.title.trim()) onSave({ title: draft.title.trim(), text: draft.text });
          }}
        >
          <Field label={t('note.title')}>
            <input
              required
              maxLength={100}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </Field>
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
              !draft.title.trim() || (draft.title.trim() === note.title && draft.text === note.text)
            }
          >
            {t('common.save')}
          </Button>
        </form>
      </div>
    </Dialog>
  );
}
