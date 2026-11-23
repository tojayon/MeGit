import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssistantPlan as Plan } from '../../shared/assistant';
import { AssistantPlan } from './AssistantPlan';
import { AssistantLauncher } from './AssistantLauncher';
import { AssistantPanel } from './AssistantPanel';
import { AssistantBoardPlan } from './AssistantBoardPlan';
import {
  applyBoardOperations,
  boardSignature,
  type AssistantBoardPlan as BoardPlan,
} from '../../shared/assistant-board';
import type { Board } from '../../shared/types';

export function AssistantExample() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [board, setBoard] = useState<Board>({
    id: 'flow-example',
    name: 'Demo',
    description: '',
    nodes: [],
    edges: [],
    notes: [{ id: 'start', title: 'Start', kind: 'start', text: '', position: { x: 80, y: 60 } }],
  });
  const [boardStatus, setBoardStatus] = useState<'applied' | 'discarded'>();
  const [boardPlan] = useState<BoardPlan>(() => ({
    id: 'flow-plan-example',
    boardId: board.id,
    boardName: board.name,
    baseline: boardSignature(board),
    createdAt: '2026-11-20T00:00:00Z',
    expiresAt: '2099-01-01T00:00:00Z',
    operations: [
      {
        type: 'addStep',
        id: 'test',
        title: 'Test',
        text: 'npm test',
        summary: '',
        kind: 'process',
        position: { x: 80, y: 200 },
      },
      { type: 'connect', id: 'run', source: 'start', target: 'test', label: '' },
    ],
  }));
  const [plan, setPlan] = useState<Plan>({
    id: 'example',
    createdAt: '2026-11-19T00:00:00Z',
    expiresAt: '2099-01-01T00:00:00Z',
    status: 'ready',
    steps: [
      {
        id: 'commit',
        repositoryId: 'one',
        repositoryName: 'MeGit',
        branch: 'feature/assistant',
        type: 'commit',
        message: 'feat: add repository assistant',
        fileCount: 3,
        commands: [['commit', '-m', 'feat: add repository assistant']],
        status: 'pending',
      },
      {
        id: 'push',
        repositoryId: 'one',
        repositoryName: 'MeGit',
        branch: 'feature/assistant',
        type: 'push',
        target: 'origin/feature/assistant',
        commands: [['push', '--', 'origin', 'HEAD:refs/heads/feature/assistant']],
        status: 'pending',
      },
      {
        id: 'fetch',
        repositoryId: 'two',
        repositoryName: 'MeWiki',
        branch: 'main',
        type: 'fetch',
        commands: [['fetch', '--all', '--prune', '--no-recurse-submodules']],
        status: 'pending',
      },
    ],
  });
  return (
    <section className="design-card">
      <h2>{t('assistant.example')}</h2>
      <AssistantLauncher open={open} onToggle={() => setOpen((saved) => !saved)} />
      {open && (
        <AssistantPanel
          preview
          board={board}
          repositories={[]}
          initialRepositoryIds={[]}
          open={open}
          onClose={() => setOpen(false)}
          onRefresh={async () => {}}
        />
      )}
      <AssistantPlan
        plan={plan}
        onExecute={() =>
          setPlan((saved) => ({
            ...saved,
            status: 'completed',
            steps: saved.steps.map((step) => ({ ...step, status: 'succeeded' })),
          }))
        }
        onStop={() =>
          setPlan((saved) => ({
            ...saved,
            status: 'stopped',
            steps: saved.steps.map((step) => ({ ...step, status: 'skipped' })),
          }))
        }
        onMessage={(id, message) =>
          setPlan((saved) => ({
            ...saved,
            steps: saved.steps.map((step) =>
              step.id === id ? { ...step, message, commands: [['commit', '-m', message]] } : step,
            ),
          }))
        }
      />
      <AssistantBoardPlan
        plan={boardPlan}
        board={board}
        repositories={[]}
        ready
        busy={false}
        status={boardStatus}
        onApply={() => {
          setBoard(applyBoardOperations(board, boardPlan.operations));
          setBoardStatus('applied');
        }}
        onDiscard={() => setBoardStatus('discarded')}
      />
    </section>
  );
}
