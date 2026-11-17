import { createContext, useContext, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  FileText,
  FolderOpen,
  GitCommitHorizontal,
  Layers,
  Link2,
} from 'lucide-react';
import type {
  LearningCommit,
  LearningFrame,
  LearningLesson,
  LearningStep,
} from '../lib/git-learning';

const PreviewPresentation = createContext(false);

function FileCard({
  version,
  name = 'README.md',
  shared = false,
}: {
  version: number;
  name?: string;
  shared?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={`learning-file ${shared ? 'is-shared' : ''}`}
      data-file={name}
      data-version={version}
    >
      <div className="learning-file-heading">
        <FileText size={17} />
        <span>{name}</span>
        <b>{`v${version}`}</b>
      </div>
      <code>
        {name === 'app.ts' ? `export const ready = ${version > 1}` : `title = "v${version}"`}
      </code>
      <div className="learning-code-lines" aria-hidden="true">
        <i />
        <i />
      </div>
      {shared && (
        <span className="learning-shared">
          <Link2 size={14} />
          {t('learning.unchanged')}
        </span>
      )}
    </div>
  );
}

function commitPosition(commit: LearningCommit, index: number, small: boolean) {
  return { x: (small ? 64 : 88) + index * (small ? 74 : 158), y: commit.lane === 1 ? 186 : 84 };
}

function useCompactDiagram() {
  const preview = useContext(PreviewPresentation);
  const [small, setSmall] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const update = () => setSmall(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return preview || small;
}

export function LearningGraph({
  frame,
  compact = false,
}: {
  frame: LearningFrame;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const marker = useId().replaceAll(':', '');
  const small = useCompactDiagram();
  const tagWidth = small ? 116 : 134;
  const positions = new Map(
    frame.commits.map((commit, index) => [commit.id, commitPosition(commit, index, small)]),
  );
  const references = [
    { name: 'main', target: frame.main },
    { name: 'feature', target: frame.feature },
  ];
  return (
    <div className={`learning-graph ${compact ? 'is-compact' : ''}`}>
      <svg
        className={small ? 'is-small' : ''}
        viewBox={`0 0 ${small ? 420 : 860} ${compact && !frame.feature ? 180 : 260}`}
        aria-hidden="true"
      >
        <defs>
          <marker
            id={marker}
            viewBox="0 0 10 10"
            refX="30"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="learning-arrowhead" />
          </marker>
        </defs>
        {frame.commits.flatMap((commit) =>
          commit.parents.map((parent) => {
            const from = positions.get(commit.id)!;
            const to = positions.get(parent)!;
            return (
              <path
                key={`${commit.id}-${parent}`}
                className={`learning-parent lane-${commit.lane}`}
                d={`M ${from.x} ${from.y} C ${from.x - (small ? 34 : 65)} ${from.y}, ${to.x + (small ? 34 : 65)} ${to.y}, ${to.x} ${to.y}`}
                markerEnd={`url(#${marker})`}
              />
            );
          }),
        )}
        {frame.commits.map((commit, index) => {
          const point = positions.get(commit.id)!;
          const active =
            frame.inspected === commit.id ||
            (!frame.inspected &&
              (frame.head === 'main' ? frame.main : frame.feature) === commit.id);
          return (
            <g
              key={commit.id}
              transform={`translate(${point.x} ${point.y})`}
              data-commit={commit.id}
              data-parents={commit.parents.join(',')}
              className={`learning-commit lane-${commit.lane} ${active ? 'is-current' : ''}`}
            >
              <g className="learning-commit-bubble">
                <circle r="23" />
                <text textAnchor="middle" dy="5">
                  {commit.id}
                </text>
              </g>
              {!commit.files && (
                <text
                  className="learning-commit-version"
                  textAnchor="middle"
                  y="45"
                >{`v${commit.version}`}</text>
              )}
              <text className="learning-commit-order" textAnchor="middle" y="64">
                {index === 0 ? t('learning.root') : ''}
              </text>
            </g>
          );
        })}
        {references
          .filter((reference) => reference.target)
          .map((reference) => {
            const point = positions.get(reference.target!)!;
            const isHead = reference.name === frame.head;
            const below = reference.name === 'feature' && reference.target === frame.main;
            return (
              <g
                key={reference.name}
                className={`learning-reference ${isHead ? 'is-head' : ''}`}
                transform={`translate(${point.x - tagWidth / 2} ${point.y + (below ? 76 : -65)})`}
                data-reference={reference.name}
                data-target={reference.target}
                data-head={isHead}
              >
                <rect width={tagWidth} height="29" rx="6" />
                <text
                  x={tagWidth / 2}
                  y="19"
                  textAnchor="middle"
                >{`${isHead ? 'HEAD → ' : ''}${reference.name}`}</text>
              </g>
            );
          })}
      </svg>
      {!!frame.commits.length && (
        <span className="learning-graph-legend">
          <ArrowLeft size={13} />
          {t('learning.parent')}
        </span>
      )}
    </div>
  );
}

function AreasScene({ frame }: { frame: LearningFrame }) {
  const { t } = useTranslation();
  const tip = frame.commits.find((commit) => commit.id === frame.main);
  return (
    <>
      <span className="learning-mobile-file">
        <FileText size={15} />
        {'README.md'}
      </span>
      <div className="learning-areas">
        <section className="learning-area" data-area="working" data-version={frame.working}>
          <h3>
            <FolderOpen size={18} />
            {t('learning.working')}
          </h3>
          <FileCard version={frame.working} />
          <span
            className={frame.working !== frame.index ? 'learning-state changed' : 'learning-state'}
          >
            {t(frame.working !== frame.index ? 'learning.modified' : 'learning.noUnstaged')}
          </span>
        </section>
        <section className="learning-area" data-area="index" data-version={frame.index ?? ''}>
          <h3>
            <Layers size={18} />
            {t('learning.index')}
          </h3>
          <div
            className="learning-index-copy"
            style={{
              transform: frame.index === null ? 'translateX(-115%)' : 'translateX(0)',
              opacity: frame.index === null ? 0 : 1,
            }}
            aria-hidden={frame.index === null}
          >
            <FileCard version={frame.index ?? frame.working} />
          </div>
          {frame.index === null ? (
            <span className="learning-empty">{t('learning.emptyIndex')}</span>
          ) : (
            <span
              className={frame.index !== tip?.version ? 'learning-state staged' : 'learning-state'}
            >
              {t(frame.index !== tip?.version ? 'learning.staged' : 'learning.clean')}
            </span>
          )}
        </section>
        <section className="learning-area" data-area="commit" data-version={tip?.version ?? ''}>
          <h3>
            <GitCommitHorizontal size={18} />
            {t('learning.history')}
          </h3>
          {tip ? (
            <div className="learning-recorded-copy" key={tip.id}>
              <FileCard version={tip.version} />
              <span className="learning-state">
                <Check size={14} />
                {`${tip.id} · ${t('learning.committed')}`}
              </span>
            </div>
          ) : (
            <span className="learning-empty">{t('learning.emptyHistory')}</span>
          )}
        </section>
      </div>
      <LearningGraph frame={frame} compact />
    </>
  );
}

function SnapshotScene({ frame }: { frame: LearningFrame }) {
  const { t } = useTranslation();
  const selected = frame.commits.find((commit) => commit.id === frame.inspected)!;
  return (
    <>
      <LearningGraph frame={frame} compact />
      <section className="learning-snapshot" data-snapshot={selected.id}>
        <h3>
          <FolderOpen size={18} />
          {t('learning.snapshot', { commit: selected.id })}
        </h3>
        <div className="learning-snapshot-files">
          <FileCard version={selected.version} />
          <FileCard version={1} name="app.ts" shared />
        </div>
      </section>
    </>
  );
}

function GraphScene({ frame }: { frame: LearningFrame }) {
  const { t } = useTranslation();
  const current = frame.commits.find(
    (commit) => commit.id === (frame.head === 'main' ? frame.main : frame.feature),
  );
  return (
    <>
      <div className="learning-checkout">
        <span>{t('learning.currentSnapshot')}</span>
        {current?.files ? (
          Object.entries(current.files).map(([name, version]) => (
            <FileCard key={name} name={name} version={version} />
          ))
        ) : (
          <FileCard version={frame.working} />
        )}
      </div>
      <LearningGraph frame={frame} />
    </>
  );
}

function RemoteScene({
  frame,
  caption,
}: {
  frame: LearningFrame;
  caption: LearningStep['caption'];
}) {
  const { t } = useTranslation();
  const columns = [
    { title: t('learning.localBranch'), ref: 'main', tip: frame.main, field: 'main' },
    { title: t('learning.tracking'), ref: 'origin/main', tip: frame.tracking, field: 'tracking' },
    { title: t('learning.server'), ref: 'main', tip: frame.remote, field: 'remote' },
  ];
  return (
    <>
      <div className="learning-remote-scope">
        <span>{t('learning.local')}</span>
        <span>{t('learning.network')}</span>
      </div>
      <div className="learning-remote-columns">
        {columns.map((column) => {
          const history: LearningCommit[] = [];
          let current = frame.commits.find((commit) => commit.id === column.tip);
          while (current) {
            history.unshift(current);
            current = frame.commits.find((commit) => commit.id === current!.parents[0]);
          }
          return (
            <section
              className={`learning-remote-column ${caption === 'fetchOnly' && column.field === 'tracking' ? 'is-receiving' : ''}`}
              key={column.field}
              data-remote-field={column.field}
              data-tip={column.tip}
            >
              <div className="learning-remote-label">
                <h3>{column.title}</h3>
                <code>{column.ref}</code>
              </div>
              <div className="learning-remote-history">
                {history.map((commit) => (
                  <div
                    key={commit.id}
                    className={`learning-remote-commit ${commit.id === column.tip ? 'is-current' : ''}`}
                  >
                    <span>{commit.id}</span>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <div className="learning-remote-operations">
        <span className={caption === 'fetchOnly' ? 'is-active' : ''}>
          <ArrowLeft size={18} />
          {t('learning.fetch')}
        </span>
        <span className={caption === 'fastForward' ? 'is-active' : ''}>
          <ArrowLeft size={18} />
          {t('learning.integrate')}
        </span>
        <span className={caption === 'push' ? 'is-active' : ''}>
          {t('learning.push')}
          <ArrowRight size={18} />
        </span>
      </div>
    </>
  );
}

function ConflictScene({ frame }: { frame: LearningFrame }) {
  const { t } = useTranslation();
  const status =
    frame.conflict === 'unresolved'
      ? 'unresolved'
      : frame.conflict === 'resolved'
        ? 'resolved'
        : frame.conflict === 'staged'
          ? 'marked'
          : frame.main === 'C5'
            ? 'merged'
            : 'choose';
  return (
    <>
      <div className="learning-conflict-files">
        <section>
          <h3>{t('learning.ours')}</h3>
          <FileCard version={4} />
        </section>
        <section>
          <h3>{t('learning.theirs')}</h3>
          <FileCard version={3} />
        </section>
        <section
          className={`learning-resolution ${frame.conflict === 'unresolved' ? 'has-conflict' : ''}`}
          data-conflict={frame.conflict ?? 'none'}
        >
          <h3>{t('learning.result')}</h3>
          {frame.conflict === 'unresolved' ? (
            <div className="learning-conflict-markers">
              <CircleAlert size={26} />
              <code>{'<<<<<<< HEAD'}</code>
              <code>{'======='}</code>
              <code>{'>>>>>>> feature'}</code>
            </div>
          ) : (
            <FileCard version={frame.working} />
          )}
        </section>
      </div>
      <span className={`learning-conflict-status ${frame.conflict ? 'is-pending' : ''}`}>
        {frame.conflict ? <CircleAlert size={16} /> : <Check size={16} />}
        {t(`learning.${status}`)}
      </span>
      <LearningGraph frame={frame} compact />
    </>
  );
}

export function GitLearningScene({
  lesson,
  step,
  presentation = 'lesson',
}: {
  lesson: LearningLesson;
  step: LearningStep;
  presentation?: 'lesson' | 'preview';
}) {
  const { t } = useTranslation();
  const frame = step.frame;
  const history = t('learning.graphState', {
    head: frame.head,
    branches:
      [frame.main && `main → ${frame.main}`, frame.feature && `feature → ${frame.feature}`]
        .filter(Boolean)
        .join(', ') || t('learning.emptyHistory'),
    parents:
      frame.commits
        .map((commit) => `${commit.id} → ${commit.parents.join(' + ') || t('learning.root')}`)
        .join('; ') || t('learning.emptyHistory'),
  });
  const state =
    lesson.view === 'remote'
      ? t('learning.remoteState', {
          main: frame.main || t('learning.emptyHistory'),
          tracking: frame.tracking || t('learning.emptyHistory'),
          remote: frame.remote || t('learning.emptyHistory'),
        })
      : lesson.view === 'areas'
        ? t('learning.areaState', {
            working: frame.working,
            index: frame.index === null ? t('learning.emptyIndex') : `v${frame.index}`,
            commit: frame.main || t('learning.emptyHistory'),
            history,
          })
        : history;
  return (
    <PreviewPresentation value={presentation === 'preview'}>
      <div
        className={`learning-diagram-scroll ${presentation === 'preview' ? 'git-learning-preview-scene' : ''}`}
        tabIndex={presentation === 'lesson' ? 0 : undefined}
        role={presentation === 'lesson' ? 'region' : undefined}
        aria-label={presentation === 'lesson' ? t('learning.diagramScroll') : undefined}
      >
        <div
          className="learning-diagram"
          data-view={lesson.view}
          role="img"
          aria-label={t('learning.scene', {
            caption: t(`learning.captions.${step.caption}`),
            state,
          })}
        >
          {lesson.view === 'areas' && <AreasScene frame={step.frame} />}
          {lesson.view === 'snapshots' && <SnapshotScene frame={step.frame} />}
          {lesson.view === 'graph' && <GraphScene frame={step.frame} />}
          {lesson.view === 'remote' && <RemoteScene frame={step.frame} caption={step.caption} />}
          {lesson.view === 'conflict' && <ConflictScene frame={step.frame} />}
        </div>
      </div>
    </PreviewPresentation>
  );
}
