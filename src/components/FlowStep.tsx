import type { FlowNote } from '../../shared/types';

export function FlowStep({ note, selected }: { note: FlowNote; selected?: boolean }) {
  return (
    <article
      className={`flow-step flow-step-${note.kind || 'process'} ${selected ? 'is-selected' : ''}`}
      data-testid="flow-step"
    >
      <svg
        className="flow-step-shape"
        viewBox={`0 0 260 ${note.kind === 'decision' ? 138 : note.kind === 'process' ? 106 : 64}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {note.kind === 'decision' ? (
          <polygon points="130,1 259,69 130,137 1,69" />
        ) : (
          <rect
            x="1"
            y="1"
            width="258"
            height={note.kind === 'process' ? 104 : 62}
            rx={note.kind === 'process' ? 8 : 31}
          />
        )}
      </svg>
      <div className="flow-step-content">
        <h3>{note.title}</h3>
        {note.summary && <p>{note.summary}</p>}
      </div>
    </article>
  );
}
