import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  CircleAlert,
  FolderGit2,
  Info,
  Magnet,
  MoreHorizontal,
  Play,
  Plus,
  Settings2,
  Palette,
  Trash2,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { Field, focusFirstError } from './Field';
import { PanelHeader } from './PanelHeader';
import { PreferencesDialog } from './PreferencesDialog';
import { SettingsDialog } from './SettingsDialog';
import { InspectorDock } from './InspectorDock';
import { emptyDock, openInspector, closeInspector } from '../lib/inspector-dock';
import { RepositoryInfo } from './RepositoryInfo';
import { HelpTip } from './GitHelp';
import { GitLearningDialog } from './GitLearningDialog';
import { GitLearningPreview } from './GitLearningPreview';
import { gitLearningDemoIds, type GitLearningDemoId } from '../lib/git-learning-media';
import { RepositoryAvatar } from './RepositoryAvatar';
import { BranchTree } from './BranchTree';
import { BranchComparisonPopover } from './BranchComparisonPopover';
import { treeAncestors, treeRefHash } from '../lib/branch-tree';
import { comparisonArguments } from '../../shared/git-commands';
import { BranchTrunkDialog } from './BranchTrunkDialog';
import { BranchDialog, type BranchSelection } from './BranchesPanel';
import { Dialog } from './Dialogs';
import { PopupMenu } from './PopupMenu';
import { NavigationExample } from './NavigationExample';
import { WorkflowHeader, workflowPanelId, workflowTabId } from './WorkflowHeader';
import { DesktopWindowControls } from './DesktopWindow';
import { FlowchartExample } from './FlowchartExample';
import { CanvasToolStrip } from './CanvasTools';
import { RepositoryPortsExample } from './RepositoryPortsExample';
import { RelationBridgeExample } from './RelationBridgeExample';
import { RelationPanelExample } from './RelationPanelExample';
import { CommitComposer } from './CommitComposer';
import { RepositorySyncButtons } from './RepositorySyncButtons';
import { RepositoryCardExample } from './RepositoryCardExample';
import { AssistantExample } from './AssistantExample';
import { AssistantProjectExample } from './AssistantProject';
import { AssistantGuidanceExample } from './AssistantGuidanceExample';
import { LocalServiceExample } from './LocalServiceDialog';
import { WorkspaceStatusbar } from './WorkspaceStatusbar';
import { RemoteManagement, RemoteManagementCard } from './RemoteManagement';
import type {
  BranchComparison,
  BranchTreeData,
  Commit,
  RepoState,
  TreeBranch,
} from '../../shared/types';

const sampleRepository = 'MeGit / repository-with-a-long-name-and-a-feature-branch';
const sampleCommitIds: Record<string, string> = {
  merge: '1'.repeat(40),
  'main-v2': '2'.repeat(40),
  design: '3'.repeat(40),
  search: '4'.repeat(40),
  root: '5'.repeat(40),
  'main-v1': '6'.repeat(40),
};
const sampleCommitId = (name: string) => sampleCommitIds[name] || name;

function WorkspaceStatusExample() {
  const { t } = useTranslation();
  const [openName, setOpenName] = useState<string | null>(null);
  const repositories = [
    { id: 'megit-example', name: 'MeGit', path: '' },
    { id: 'long-example', name: sampleRepository, path: '' },
  ];

  return (
    <section className="design-card" aria-label={t('board.windowStatus')}>
      <WorkspaceStatusbar
        board={{ id: 'status-example', name: 'MeGit', description: '', nodes: [], edges: [] }}
        repositories={repositories}
        saveStatus="saved"
        refreshing={false}
        preview={{
          services: repositories.map(({ id }) => ({ repoId: id, status: 'running' })),
          open: ({ name }) => setOpenName(name),
        }}
      />
      {openName && <LocalServiceExample name={openName} onClose={() => setOpenName(null)} />}
    </section>
  );
}

function CommitComposerExample() {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<RepoState['files']>([
    {
      path: 'feature.ts',
      indexStatus: '.',
      worktreeStatus: 'M',
      untracked: false,
      conflicted: false,
    },
    { path: 'spec.ts', indexStatus: 'M', worktreeStatus: '.', untracked: false, conflicted: false },
  ]);
  const state: RepoState = {
    branch: 'main',
    head: sampleCommitId('root'),
    detached: false,
    upstream: null,
    ahead: null,
    behind: null,
    changed: files.length,
    staged: files.filter((file) => file.indexStatus !== '.').length,
    files,
    branches: [],
    remotes: [],
    fetchedAt: null,
    checkedAt: '',
  };
  return (
    <section className="design-card">
      <h2>{t('repository.commitSection')}</h2>
      <CommitComposer
        state={state}
        message={message}
        onMessage={setMessage}
        busy=""
        showFileCount={false}
        onGenerate={async () => {
          setMessage(t('repositoryCard.aiExample'));
          return true;
        }}
        onAction={async (action) => {
          if (action.type === 'commit') {
            setFiles((current) => current.filter((file) => file.indexStatus === '.'));
            setMessage('');
          } else if (action.type === 'stage' || action.type === 'unstage') {
            setFiles((current) =>
              current.map((file) =>
                action.paths.includes(file.path)
                  ? {
                      ...file,
                      indexStatus: action.type === 'stage' ? 'M' : '.',
                      worktreeStatus: action.type === 'stage' ? '.' : 'M',
                    }
                  : file,
              ),
            );
          }
          return true;
        }}
      />
    </section>
  );
}

function RemoteManagementExample() {
  const { t } = useTranslation();
  const [checked, setChecked] = useState(false);
  const [ahead, setAhead] = useState(1);
  return (
    <section className="design-card design-remote-management-example">
      <h2>{t('repository.manageRemotes')}</h2>
      <RemoteManagement count={4} onFetch={() => setChecked(false)} addDisabled onAdd={() => {}}>
        <RemoteManagementCard
          name="origin"
          status={checked ? 'readable' : 'unchecked'}
          onCheck={() => setChecked(true)}
        />
        <RemoteManagementCard
          name="community"
          status="readable"
          onCheck={() => {}}
          onLogin={() => {}}
        />
        <RemoteManagementCard name="mirror" status="checking" onCheck={() => {}} />
        <RemoteManagementCard
          name="archive"
          status="failed"
          error={t('errors.remoteReadAuth')}
          onCheck={() => {}}
        />
      </RemoteManagement>
      <div className="repo-actions" role="group" aria-label={t('repository.remoteSection')}>
        <RepositorySyncButtons
          repositoryName="MeGit"
          state={{
            branch: 'main',
            head: sampleCommitId('main-v2'),
            detached: false,
            upstream: 'origin/main',
            upstreamHead: sampleCommitId(ahead ? 'main-v1' : 'main-v2'),
            pushTarget: { remote: 'origin', ref: 'refs/heads/main' },
            ahead,
            behind: 0,
            changed: 0,
            staged: 0,
            files: [],
            branches: [],
            remotes: ['origin'],
            fetchedAt: null,
            checkedAt: '',
          }}
          compact
          onAction={async ({ type }) => {
            if (type === 'push') setAhead(0);
            return true;
          }}
        />
      </div>
    </section>
  );
}

function TreeExample() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const [compared, setCompared] = useState<string | null>(null);
  const [base, setBase] = useState('refs/heads/main');
  const [choosingTrunk, setChoosingTrunk] = useState(false);
  const [selection, setSelection] = useState<BranchSelection | null>(null);
  const [diff, setDiff] = useState<Commit | null>(null);
  const [created, setCreated] = useState<TreeBranch[]>([]);
  const [current, setCurrent] = useState('feature/search');
  const commit = (hash: string, parents: string[] = []): Commit => ({
    hash: sampleCommitId(hash),
    parents: parents.map(sampleCommitId),
    shortHash: sampleCommitId(hash).slice(0, 7),
    subject: hash,
    author: 'MeGit',
    date: '',
    refs: '',
  });
  const branch = (name: string, hash: string): TreeBranch => ({
    ref: `refs/heads/${name}`,
    name,
    hash: sampleCommitId(hash),
    current: name === current,
    remote: false,
    parents: [],
    subject: hash,
    author: 'MeGit',
    date: '',
    upstream: null,
    upstreamGone: false,
    ahead: null,
    behind: null,
  });
  const history = Array.from({ length: 36 }, (_, index) => {
    const hash = (index + 16).toString(16).padStart(40, '0');
    return {
      ...commit(hash, [index ? (index + 15).toString(16).padStart(40, '0') : 'main-v1']),
      subject: `v1.${index + 1}`,
    };
  });
  const data: BranchTreeData = {
    baseRef: base,
    head: created.find((item) => item.name === current)?.hash || sampleCommitId('search'),
    currentRef: `refs/heads/${current}`,
    detached: false,
    limit: 120,
    hasMore: false,
    shallow: false,
    checkedAt: '',
    branches: [
      branch('main', 'merge'),
      branch('feature/search', 'search'),
      branch('feature/design', 'design'),
      ...created,
    ].map((item) => ({ ...item, current: item.name === current })),
    commits: [
      commit('merge', ['main-v2', 'design']),
      commit('main-v2', [history.at(-1)!.hash]),
      ...history,
      commit('main-v1', ['root']),
      commit('design', ['root']),
      commit('search', ['main-v2']),
      commit('root'),
    ],
  };
  const state: RepoState = {
    branch: current,
    head: data.head,
    detached: false,
    upstream: null,
    ahead: null,
    behind: null,
    changed: 0,
    staged: 0,
    files: [],
    branches: data.branches,
    remotes: [],
    fetchedAt: null,
    checkedAt: '',
  };
  const trunk = data.branches.find((item) => item.ref === base);
  const trunkHash = treeRefHash(data, base);
  const comparedBranch = data.branches.find((item) => item.ref === compared);
  const source = treeAncestors(data, comparedBranch?.hash ?? null);
  const target = treeAncestors(data, trunkHash);
  const sourceCommits = [...source].filter((hash) => !target.has(hash));
  const targetCommits = [...target].filter((hash) => !source.has(hash));
  const comparison: BranchComparison | null =
    comparedBranch && trunkHash
      ? {
          sourceRef: comparedBranch.ref,
          targetRef: base,
          sourceHash: comparedBranch.hash,
          targetHash: trunkHash,
          sourceOnly: sourceCommits.length,
          targetOnly: targetCommits.length,
          sourceCommits,
          targetCommits,
          mergeBases: [],
          relation: sourceCommits.length
            ? targetCommits.length
              ? 'diverged'
              : 'ahead'
            : targetCommits.length
              ? 'included'
              : 'same',
          checkedAt: '',
        }
      : null;
  return (
    <section className="design-card">
      <h2>{t('branchTree.demo')}</h2>
      <div className="design-tree-stage">
        <BranchTree
          data={data}
          selectedRef={selected}
          comparison={comparison}
          comparisonControl={
            trunkHash
              ? (tip) => (
                  <BranchComparisonPopover
                    branchName={tip.name}
                    trunkName={trunk?.name ?? 'HEAD'}
                    commands={comparisonArguments(tip.hash, trunkHash)}
                    result={tip.ref === compared ? comparison : null}
                    active={tip.ref === compared}
                    onStart={() => setCompared(tip.ref)}
                    onClose={() => setCompared((current) => (current === tip.ref ? null : current))}
                  />
                )
              : undefined
          }
          onSelect={setSelected}
          onCommit={setDiff}
          onCreateBranch={(commit) =>
            setSelection({ type: 'createBranch', state, startPoint: 'COMMIT', commit })
          }
          tools={
            <>
              <HelpTip
                topic="branchTree"
                related={[
                  'treeComparison',
                  'head',
                  'branchLabel',
                  'collapsedCommits',
                  'commitActions',
                ]}
              />
              <PopupMenu
                label={t('branchTree.tools')}
                icon={<MoreHorizontal size={18} />}
                className="branch-tree-menu"
                triggerClassName="icon-button small"
                menuClassName="branch-tree-menu-items"
              >
                <button onClick={() => setChoosingTrunk(true)}>
                  {t('branchTree.changeTrunk')}
                </button>
              </PopupMenu>
            </>
          }
        />
      </div>
      {selection && (
        <BranchDialog
          repo={{ id: 'tree-demo', name: 'MeGit', path: '' }}
          selection={selection}
          busy={false}
          onAction={async (action) => {
            if (action.type === 'createBranch') {
              setCreated((items) => [...items, branch(action.name, action.startHash)]);
              if (action.checkout) setCurrent(action.name);
            }
            return true;
          }}
          onRefresh={async () => {}}
          onClose={() => setSelection(null)}
        />
      )}
      {diff && (
        <Dialog title={t('branchTree.commitDiff')} onClose={() => setDiff(null)}>
          <div className="dialog-body">
            <strong>{diff.subject}</strong>
            <code>{diff.hash}</code>
            <HelpTip topic="commitDiff" />
          </div>
        </Dialog>
      )}
      {!!created.length && (
        <p className="design-caption" role="status">
          {t('branchTree.demoCreated', { name: created.at(-1)!.name })}
        </p>
      )}
      {choosingTrunk && (
        <BranchTrunkDialog
          value={base}
          options={data.branches}
          onApply={(ref) => {
            setBase(ref);
            setChoosingTrunk(false);
          }}
          onClose={() => setChoosingTrunk(false)}
        />
      )}
      {selected && (
        <p className="design-caption" role="status">
          {data.branches.find((item) => item.ref === selected)?.name}
        </p>
      )}
    </section>
  );
}

function AvatarExample() {
  const { t } = useTranslation();
  const [custom, setCustom] = useState(true);
  const example = { id: 'avatar-demo', name: 'MeGit', path: '' };
  return (
    <section className="design-card" aria-label={t('repositoryAvatar.example')}>
      <PanelHeader
        title={t('repositoryAvatar.example')}
        icon={
          <RepositoryAvatar
            repo={example}
            image={custom ? '/brand/megit-icon.svg' : undefined}
            size="large"
          />
        }
        iconAction={{
          label: t('repositoryAvatar.configure'),
          help: t('repositoryAvatar.configureHelp'),
          onClick: () => setCustom((value) => !value),
        }}
        closeLabel={t('designSystem.closeExample')}
        onClose={() => setCustom(false)}
      />
      <div className="design-demo-row">
        <RepositoryAvatar repo={example} size="small" />
        <RepositoryAvatar repo={example} image="/brand/megit-icon.svg" />
        <RepositoryAvatar repo={example} image="data:image/png;base64,AA==" />
      </div>
      <p className="design-caption">{t('repositoryAvatar.exampleHelp')}</p>
    </section>
  );
}

function DockPanelExample({ title, onClose }: { title: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  return (
    <aside className="inspector" aria-label={title}>
      <PanelHeader
        title={title}
        icon={<FolderGit2 size={20} />}
        closeLabel={t('designSystem.closeExample')}
        onClose={onClose}
      />
      <div className="context-panel-body">
        <Field label={t('repository.message')}>
          <textarea rows={8} value={draft} onChange={(event) => setDraft(event.target.value)} />
        </Field>
      </div>
    </aside>
  );
}

function DockExample() {
  const { t } = useTranslation();
  const samples = () =>
    openInspector(openInspector(emptyDock, 'demo', { kind: 'repository', id: 'first' }), 'demo', {
      kind: 'repository',
      id: 'second',
    });
  const [state, setState] = useState(samples);
  const [width, setWidth] = useState(760);
  const title = (id: string) =>
    t(id === 'first' ? 'designSystem.dockFirst' : 'designSystem.dockSecond');
  return (
    <section className="design-card design-dock-example">
      <h2>{t('designSystem.dock')}</h2>
      <p className="design-caption">{t('designSystem.dockRule')}</p>
      <div className="design-demo-row">
        <Button data-details-trigger onClick={() => setState(samples())}>
          {t('designSystem.restoreExample')}
        </Button>
      </div>
      <div className="design-dock-stage">
        {!!state.items.length && (
          <InspectorDock
            state={state}
            width={width}
            onWidth={setWidth}
            onActive={(active) =>
              setState((previous) =>
                previous.active === active ? previous : { ...previous, active },
              )
            }
            onClose={(key) => setState((previous) => closeInspector(previous, key))}
          >
            {(item, close) => <DockPanelExample title={title(item.id)} onClose={close} />}
          </InspectorDock>
        )}
      </div>
    </section>
  );
}

function LearningPreviewExample() {
  const { t, i18n } = useTranslation();
  const [demo, setDemo] = useState<GitLearningDemoId>('stage');
  const [activations, setActivations] = useState(0);
  return (
    <section
      className="design-card design-learning-preview-example"
      role="region"
      aria-label={t('learning.preview.title')}
    >
      <h2>{t('learning.preview.title')}</h2>
      <Field label={t('learning.preview.operation')}>
        <select value={demo} onChange={(event) => setDemo(event.target.value as GitLearningDemoId)}>
          {gitLearningDemoIds.map((id) => (
            <option key={id} value={id}>
              {t(`learning.preview.titles.${id}`)}
            </option>
          ))}
        </select>
      </Field>
      <div className="design-demo-row">
        <Button learningDemo={demo} onClick={() => setActivations((value) => value + 1)}>
          {t(`learning.preview.titles.${demo}`)}
        </Button>
        <IconButton
          label={t('learning.preview.iconAction')}
          learningDemo={demo}
          onClick={() => setActivations((value) => value + 1)}
        >
          <Play size={16} />
        </IconButton>
      </div>
      <p className="design-caption" data-demo-activations role="status">
        {t('learning.preview.activations', {
          value: new Intl.NumberFormat(i18n.resolvedLanguage).format(activations),
        })}
      </p>
      <h3>{t('learning.preview.poster')}</h3>
      <div data-demo-poster>
        <GitLearningPreview demo={demo} playback="still" />
      </div>
    </section>
  );
}

function CanvasToolsExample() {
  const { t } = useTranslation();
  const [tool, setTool] = useState<'select' | 'pan'>('select');
  const [snapping, setSnapping] = useState(true);
  return (
    <div className="design-canvas-tools">
      <CanvasToolStrip tool={tool} onTool={setTool}>
        <IconButton
          className="canvas-tool"
          label={t('tools.snapping')}
          help={t(snapping ? 'tools.snappingOn' : 'tools.snappingOff')}
          aria-pressed={snapping}
          onClick={() => setSnapping(!snapping)}
        >
          <Magnet size={17} />
        </IconButton>
      </CanvasToolStrip>
    </div>
  );
}

const exampleWorkflows = [
  {
    id: 'design',
    name: 'MeGit / workflow-with-a-long-name-for-parallel-development',
    description: '',
    nodes: [],
    edges: [],
  },
  { id: 'release', name: 'MeGit / release', description: '', nodes: [], edges: [] },
];

function WorkflowTabsExample() {
  const { t } = useTranslation();
  const id = useId();
  const [boards, setBoards] = useState(exampleWorkflows);
  const [activeId, setActiveId] = useState(exampleWorkflows[0].id);
  return (
    <section className="design-card design-panel-example design-workflow-example">
      <WorkflowHeader
        boards={boards}
        activeId={activeId}
        id={id}
        onSelect={setActiveId}
        onClose={(closedId) => {
          const next = boards.filter((board) => board.id !== closedId);
          setBoards(next);
          if (closedId === activeId) setActiveId(next[0]?.id ?? '');
        }}
      />
      {boards.map((board) => (
        <div
          key={board.id}
          className="design-panel-body"
          id={workflowPanelId(id, board.id)}
          role="tabpanel"
          aria-labelledby={workflowTabId(id, board.id)}
          hidden={board.id !== activeId}
        >
          {board.name}
        </div>
      ))}
      {!boards.length && (
        <div className="design-panel-body">
          <Button
            onClick={() => {
              setBoards(exampleWorkflows);
              setActiveId(exampleWorkflows[0].id);
            }}
          >
            {t('board.reopen')}
          </Button>
        </div>
      )}
    </section>
  );
}

export function DesignSystemPage() {
  const { t } = useTranslation();
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [learningOpen, setLearningOpen] = useState(false);
  const [name, setName] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [verified, setVerified] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  return (
    <main className="design-system-page">
      <div className="design-system-content">
        <header className="design-system-header">
          <BrandLogo variant="full" className="design-system-logo" />
          <div className="design-system-links">
            <a href="/brand/color-palette.html">{t('designSystem.palette')}</a>
            <a href="/">{t('designSystem.openApp')}</a>
            <IconButton label={t('preferences.title')} onClick={() => setPreferencesOpen(true)}>
              <Palette size={18} />
            </IconButton>
            <IconButton label={t('settings.title')} onClick={() => setSettingsOpen(true)}>
              <Settings2 size={18} />
            </IconButton>
          </div>
          <DesktopWindowControls />
        </header>
        <div className="design-system-intro">
          <h1>{t('designSystem.title')}</h1>
          <p>{t('designSystem.intro')}</p>
        </div>
        <div className="design-system-grid">
          <TreeExample />
          <CommitComposerExample />
          <RemoteManagementExample />
          <RepositoryCardExample />
          <LocalServiceExample />
          <WorkspaceStatusExample />
          <DockExample />
          <NavigationExample />
          <FlowchartExample />
          <RepositoryPortsExample />
          <RelationBridgeExample />
          <RelationPanelExample />
          <WorkflowTabsExample />
          <section className="design-card">
            <h2>{t('learning.title')}</h2>
            <p className="design-caption">{t('learning.demoRule')}</p>
            <Button onClick={() => setLearningOpen(true)}>{t('learning.demo')}</Button>
          </section>
          <LearningPreviewExample />
          <section className="design-card">
            <h2>{t('designSystem.foundations')}</h2>
            <dl className="design-system-rules">
              <div>
                <dt>{t('designSystem.spacing')}</dt>
                <dd>{t('designSystem.spacingValue')}</dd>
              </div>
              <div>
                <dt>{t('designSystem.typography')}</dt>
                <dd>{t('designSystem.typographyValue')}</dd>
              </div>
              <div>
                <dt>{t('designSystem.controls')}</dt>
                <dd>{t('designSystem.controlsValue')}</dd>
              </div>
              <div>
                <dt>{t('designSystem.radius')}</dt>
                <dd>{t('designSystem.radiusValue')}</dd>
              </div>
            </dl>
            <p className="design-caption">{t('designSystem.colorRule')}</p>
          </section>
          <section className="design-card">
            <h2>{t('designSystem.buttons')}</h2>
            <div className="design-demo-row">
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setVerified(true)}>
                {t('board.add')}
              </Button>
              <Button onClick={() => setVerified(true)}>{t('common.save')}</Button>
              <Button
                variant="danger"
                icon={<Trash2 size={16} />}
                onClick={() => setVerified(false)}
              >
                {t('designSystem.removeExample')}
              </Button>
            </div>
            <div className="design-demo-row">
              <Button size="compact" onClick={() => setVerified(true)}>
                {t('designSystem.compact')}
              </Button>
              <Button disabled>{t('designSystem.disabled')}</Button>
              <Button variant="primary" busy>
                {t('board.saving')}
              </Button>
              <IconButton label={t('designSystem.viewDetails')} onClick={() => setPanelOpen(true)}>
                <Info size={17} />
              </IconButton>
              <IconButton
                variant="danger"
                label={t('designSystem.removeExample')}
                onClick={() => setVerified(false)}
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
            <p className="design-caption">{t('designSystem.buttonRule')}</p>
            <div className="design-tooltip-clip">
              <IconButton label={t('designSystem.clippedTooltip')}>
                <Info size={17} />
              </IconButton>
              <span>{t('designSystem.tooltipBoundary')}</span>
            </div>
          </section>
          <section className="design-card">
            <h2>{t('designSystem.forms')}</h2>
            <form
              className="inspector-fields"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                setInvalid(!name.trim());
                setVerified(!!name.trim());
                if (!name.trim()) focusFirstError(event.currentTarget);
              }}
            >
              <Field
                label={t('designSystem.exampleName')}
                hint={t('designSystem.fieldHint')}
                error={invalid ? t('designSystem.nameRequired') : undefined}
              >
                <input
                  required
                  maxLength={100}
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setInvalid(false);
                    setVerified(false);
                  }}
                />
              </Field>
              <div>
                <Button type="submit" variant="primary">
                  {t('designSystem.validate')}
                </Button>
              </div>
            </form>
            {verified && (
              <p className="design-feedback success-text" role="status">
                <Check size={16} />
                {t('designSystem.verified')}
              </p>
            )}
          </section>
          <AvatarExample />
          <section className="design-card design-panel-example">
            {panelOpen ? (
              <>
                <PanelHeader
                  title={sampleRepository}
                  icon={<FolderGit2 size={20} />}
                  closeLabel={t('designSystem.closeExample')}
                  onClose={() => setPanelOpen(false)}
                  actions={
                    <RepositoryInfo
                      repo={{
                        id: 'design-example',
                        name: sampleRepository,
                        path: 'D:\\Projects\\MeGit\\example-repository',
                      }}
                    />
                  }
                />
                <div className="design-panel-body">
                  <h3>{t('designSystem.states')}</h3>
                  <div className="design-demo-row">
                    <HelpTip topic="staged" />
                    <span className="design-state success-text">
                      <Check size={14} />
                      {t('relation.included')}
                    </span>
                    <span className="design-state warning-text">
                      <CircleAlert size={14} />
                      {t('relation.pending', { count: 3 })}
                    </span>
                    <span className="design-state danger-text">
                      <CircleAlert size={14} />
                      {t('board.failed')}
                    </span>
                  </div>
                  <p className="design-caption">{t('designSystem.stateRule')}</p>
                </div>
              </>
            ) : (
              <div className="design-panel-body">
                <Button onClick={() => setPanelOpen(true)}>
                  {t('designSystem.restoreExample')}
                </Button>
              </div>
            )}
          </section>
          <AssistantExample />
          <AssistantProjectExample />
          <AssistantGuidanceExample />
          <section className="design-card design-empty-example">
            <FolderGit2 size={28} aria-hidden="true" />
            <h2>{t('designSystem.empty')}</h2>
            <p>{t('designSystem.emptyHelp')}</p>
            <Button icon={<Plus size={16} />} onClick={() => setPanelOpen(true)}>
              {t('designSystem.restoreExample')}
            </Button>
          </section>
          <section className="design-card">
            <h2>{t('designSystem.whiteboard')}</h2>
            <CanvasToolsExample />
            <p className="design-caption">{t('designSystem.whiteboardRule')}</p>
            <p className="design-caption">{t('designSystem.acceptance')}</p>
          </section>
        </div>
      </div>
      {preferencesOpen && <PreferencesDialog onClose={() => setPreferencesOpen(false)} />}
      {settingsOpen && <SettingsDialog example onClose={() => setSettingsOpen(false)} />}
      {learningOpen && <GitLearningDialog onClose={() => setLearningOpen(false)} />}
    </main>
  );
}
