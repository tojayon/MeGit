import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FlowNote } from '../../shared/types';
import { FlowStep } from './FlowStep';
import { NotePanel } from './NotePanel';

export function FlowchartExample() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<FlowNote | null>(null);
  const notes: FlowNote[] = (['start', 'process', 'decision', 'end'] as const).map((kind) => ({
    id: kind,
    kind,
    title: t(`flowchart.${kind}`),
    summary: '',
    text: t('flowchart.manual'),
    position: { x: 0, y: 0 },
  }));
  return (
    <section className="design-card">
      <h2>{t('flowchart.example')}</h2>
      <p className="design-caption">{t('flowchart.exampleSummary')}</p>
      <div className="design-flow-step-examples">
        {notes.map((note) => (
          <div
            key={note.id}
            role="button"
            tabIndex={0}
            aria-label={t('flowchart.details') + ': ' + note.title}
            onClick={() => setSelected(note)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setSelected(note);
              }
            }}
          >
            <FlowStep note={note} selected={selected?.id === note.id} />
          </div>
        ))}
      </div>
      {selected && (
        <NotePanel
          note={selected}
          onClose={() => setSelected(null)}
          onSave={(fields) => setSelected({ ...selected, ...fields })}
        />
      )}
    </section>
  );
}
