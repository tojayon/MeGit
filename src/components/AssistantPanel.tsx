import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  ArrowUp,
  CircleHelp,
  FilePenLine,
  FolderGit2,
  History,
  Plus,
  Settings2,
  Square,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';
import type { Board, Repository } from '../../shared/types';
import type { AssistantBoardPlan as BoardPlan } from '../../shared/assistant-board';
import { AssistantBoardPlan } from './AssistantBoardPlan';
import { AssistantProject } from './AssistantProject';
import type { AiSettings } from '../../shared/ai';
import type { AssistantPlan as Plan, AssistantReply } from '../../shared/assistant';
import { request } from '../lib/api';
import { ApiError, formatError } from '../lib/messages';
import {
  isAssistantSession,
  initialAssistantSession,
  newConversation,
  type AssistantMessage,
  type AssistantSession,
} from '../lib/assistant-session';
import { useScrollMemory, useViewState } from '../lib/use-view-state';
import { isFiniteNumber } from '../lib/view-storage';
import { focusWithoutTooltip } from '../lib/overlays';
import { IconButton } from './IconButton';
import { AssistantAvatar } from './AssistantAvatar';
import { Button } from './Button';
import { InfoPopover } from './InfoPopover';
import { AssistantPlan } from './AssistantPlan';
import { AssistantGuidance, guidanceForError } from './AssistantGuidance';
import { AssistantFailureHelp } from './AssistantFailureHelp';
import { RepositoryAvatar } from './RepositoryAvatar';
import {
  assistantEdges,
  boundAssistant,
  resizeAssistant,
  type AssistantEdge,
} from '../lib/assistant-layout';

type Frame = { x: number; y: number; width: number; height: number };
const isFrame = (v: unknown): v is Frame =>
  !!v &&
  typeof v === 'object' &&
  ['x', 'y', 'width', 'height'].every(
    (key) => key in v && isFiniteNumber((v as Record<string, unknown>)[key]),
  );
const bounds = () => ({ width: innerWidth, height: innerHeight });
const bounded = (frame: Frame): Frame => boundAssistant(frame, bounds());

export function AssistantPanel({
  repositories,
  initialRepositoryIds,
  open,
  onClose,
  onSettings,
  onRefresh,
  settingsOpen = false,
  preview = false,
  onRepositories,
  actionViewKey,
  board,
  boardReady = true,
  onApplyBoard,
}: {
  repositories: Repository[];
  initialRepositoryIds: string[];
  open: boolean;
  onClose: () => void;
  onSettings: () => void;
  onRefresh: () => Promise<void>;
  settingsOpen?: boolean;
  preview?: boolean;
  onRepositories?: () => void;
  actionViewKey?: (repo: Repository) => string;
  board?: Board;
  boardReady?: boolean;
  onApplyBoard?: (plan: BoardPlan) => boolean;
}) {
  const { t, i18n } = useTranslation();
  const [session, setSession] = useViewState(
    preview ? 'assistant.example.session' : 'assistant.session',
    initialAssistantSession,
    isAssistantSession,
  );
  const [frame, setFrame] = useViewState<Frame>(
    preview ? 'assistant.example.frame' : 'assistant.frame',
    () =>
      bounded({ x: innerWidth - 448, y: 64, width: 424, height: Math.min(660, innerHeight - 100) }),
    isFrame,
  );
  const [plans, setPlans] = useState<Record<string, Plan>>({});
  const [planErrors, setPlanErrors] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<unknown>();
  const [settings, setSettings] = useState<AiSettings>();
  const [projectMode, setProjectMode] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const pending = useRef<AbortController | null>(null);
  const follow = useRef(false);
  const [following, setFollowing] = useState(true);
  const [scopeReady, setScopeReady] = useState(false);
  const gesture = useRef<{
    id: number;
    kind: 'move' | AssistantEdge;
    x: number;
    y: number;
    frame: Frame;
  } | null>(null);
  const sessionRef = useRef(session);
  useLayoutEffect(() => {
    sessionRef.current = session;
  }, [session]);
  const current = session.conversations.find((item) => item.id === session.activeId)!;
  const selectedBoard = current.includeBoard === true ? board : undefined;
  const latestAssistantId = [...current.messages]
    .reverse()
    .find((message) => message.role === 'assistant')?.id;
  const currentIds = current.repositoryIds.filter((id) =>
    repositories.some((repo) => repo.id === id && !repo.archived),
  );
  const planIds = [
    ...new Set(current.messages.flatMap((message) => (message.planId ? [message.planId] : []))),
  ];
  const planKey = planIds.join(',');
  useScrollMemory(history, `assistant.scroll.${current.id}`, open);
  const changeCurrent = useCallback(
    (update: (conversation: AssistantSession['conversations'][number]) => void) => {
      setSession((saved) => {
        const next = structuredClone(saved);
        const conversation = next.conversations.find((item) => item.id === next.activeId)!;
        update(conversation);
        return next;
      });
    },
    [setSession],
  );

  useEffect(() => {
    if (!open || preview) return;
    const controller = new AbortController();
    void request<AiSettings>('/ai/settings', { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setSettings(value);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failure);
      });
    return () => controller.abort();
  }, [open, settingsOpen, preview]);
  useEffect(() => {
    if (!open || scopeReady) return;
    setScopeReady(true);
    if (!current.messages.length && !current.repositoryIds.length)
      changeCurrent((conversation) => {
        conversation.repositoryIds = initialRepositoryIds.slice(0, 20);
      });
  }, [
    open,
    scopeReady,
    current.messages.length,
    current.repositoryIds.length,
    initialRepositoryIds,
    changeCurrent,
  ]);
  useEffect(() => {
    if (!open) {
      pending.current?.abort();
      return;
    }
    const previous = document.activeElement as HTMLElement | null;
    focusWithoutTooltip(input.current);
    return () => {
      pending.current?.abort();
      if (previous?.isConnected) focusWithoutTooltip(previous);
    };
  }, [open]);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (!open || !planKey || preview) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      let running = false;
      for (const id of planKey.split(',')) {
        try {
          const plan = await request<Plan>(`/ai/assistant/plans/${encodeURIComponent(id)}`, {
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          const edits = sessionRef.current.conversations
            .find((item) => item.id === sessionRef.current.activeId)
            ?.messages.find((message) => message.planId === id)?.planMessages;
          if (plan.status === 'ready' && edits)
            plan.steps = plan.steps.map((step) =>
              edits[step.id] === undefined
                ? step
                : {
                    ...step,
                    message: edits[step.id],
                    commands: [['commit', '-m', edits[step.id]]],
                  },
            );
          setPlans((saved) => ({ ...saved, [id]: plan }));
          setPlanErrors((saved) => {
            const next = { ...saved };
            delete next[id];
            return next;
          });
          running ||= plan.status === 'running';
        } catch (failure) {
          if (controller.signal.aborted) return;
          setPlanErrors((saved) => ({ ...saved, [id]: failure }));
        }
      }
      if (!controller.signal.aborted && (running || executing))
        timer = setTimeout(() => void load(), 800);
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, planKey, executing, preview]);
  useEffect(() => {
    const resize = () => {
      gesture.current = null;
      setFrame((saved) => bounded(saved));
    };
    window.addEventListener('resize', resize);
    window.addEventListener('blur', resize);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('blur', resize);
    };
  }, [setFrame]);
  useLayoutEffect(() => {
    if (open && follow.current) history.current?.scrollTo({ top: history.current.scrollHeight });
  }, [current.messages.length, generating, plans, open]);

  function begin(event: PointerEvent<HTMLButtonElement>, kind: 'move' | AssistantEdge) {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      frame: bounded(frame),
      kind,
    };
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x,
      dy = event.clientY - start.y;
    setFrame(
      bounded(
        start.kind === 'move'
          ? { ...start.frame, x: start.frame.x + dx, y: start.frame.y + dy }
          : resizeAssistant(start.frame, start.kind, dx, dy, bounds()),
      ),
    );
  }
  function end(event: PointerEvent<HTMLButtonElement>) {
    if (gesture.current?.id !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, kind: 'move' | AssistantEdge) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    const amount = event.shiftKey ? 40 : 10;
    setFrame((saved) =>
      bounded(
        kind === 'move'
          ? { ...saved, x: saved.x + direction[0] * amount, y: saved.y + direction[1] * amount }
          : resizeAssistant(saved, kind, direction[0] * amount, direction[1] * amount, bounds()),
      ),
    );
  }
  const handlers = {
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
  };

  async function send() {
    if (
      pending.current ||
      executing ||
      !current.draft.trim() ||
      (!currentIds.length && !selectedBoard) ||
      (!!selectedBoard && !boardReady) ||
      current.messages.length >= 78
    )
      return;
    const controller = new AbortController();
    pending.current = controller;
    setGenerating(true);
    setError(undefined);
    const conversationId = current.id;
    const prompt = current.draft.trim();
    const restoreDraft = () => {
      setSession((saved) => ({
        ...saved,
        conversations: saved.conversations.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, draft: conversation.draft || prompt }
            : conversation,
        ),
      }));
    };
    const cancel = () => {
      if (pending.current !== controller) return;
      pending.current = null;
      restoreDraft();
      setGenerating(false);
    };
    controller.signal.addEventListener('abort', cancel, { once: true });
    const user: AssistantMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: prompt,
      repositoryIds: currentIds,
      ...(selectedBoard ? { boardName: selectedBoard.name } : {}),
    };
    follow.current = true;
    setFollowing(true);
    changeCurrent((conversation) => {
      conversation.title ||= prompt.slice(0, 100);
      conversation.messages.push(user);
      conversation.draft = '';
    });
    try {
      const result = await request<AssistantReply>('/ai/assistant/chat', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({
          prompt,
          repositoryIds: currentIds,
          ...(selectedBoard ? { boardId: selectedBoard.id } : {}),
          language: i18n.resolvedLanguage === 'en' ? 'en' : 'zh-CN',
          includeStagedDiff: current.includeStagedDiff,
          planIds: planIds.slice(-16),
          history: current.messages
            .slice(-16)
            .map((message) => ({ role: message.role, content: message.text })),
        }),
      });
      if (controller.signal.aborted || sessionRef.current.activeId !== conversationId) return;
      if (result.plan) setPlans((saved) => ({ ...saved, [result.plan!.id]: result.plan! }));
      changeCurrent((conversation) => {
        conversation.messages.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          text: result.text,
          repositoryIds: currentIds,
          ...(result.guides?.length ? { guides: result.guides } : {}),
          ...(result.plan ? { planId: result.plan.id } : {}),
          ...(result.boardPlan ? { boardPlan: result.boardPlan } : {}),
        });
      });
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure);
        restoreDraft();
      }
    } finally {
      controller.signal.removeEventListener('abort', cancel);
      if (pending.current === controller) {
        pending.current = null;
        setGenerating(false);
      }
    }
  }
  async function execute(id: string) {
    if (executing || pending.current) return;
    setExecuting(id);
    setError(undefined);
    setPlans((saved) => ({ ...saved, [id]: { ...saved[id], status: 'running' } }));
    try {
      const messages = Object.fromEntries(
        plans[id].steps
          .filter((step) => step.type === 'commit')
          .map((step) => [step.id, step.message || '']),
      );
      const plan = await request<Plan>(`/ai/assistant/plans/${encodeURIComponent(id)}/execute`, {
        method: 'POST',
        body: JSON.stringify({ messages }),
      });
      setPlans((saved) => ({ ...saved, [id]: plan }));
      await onRefresh();
    } catch (failure) {
      setError(failure);
      try {
        const plan = await request<Plan>(`/ai/assistant/plans/${encodeURIComponent(id)}`);
        setPlans((saved) => ({ ...saved, [id]: plan }));
      } catch (reason) {
        setPlanErrors((saved) => ({ ...saved, [id]: reason }));
      }
    } finally {
      setExecuting(null);
    }
  }
  async function stop(id: string) {
    try {
      const plan = await request<Plan>(`/ai/assistant/plans/${encodeURIComponent(id)}/stop`, {
        method: 'POST',
      });
      setPlans((saved) => ({ ...saved, [id]: plan }));
    } catch (failure) {
      setError(failure);
    }
  }
  function selectConversation(id: string) {
    pending.current?.abort();
    setError(undefined);
    follow.current = false;
    setSession((saved) => ({ ...saved, activeId: id }));
  }
  const activeRun = !!executing || Object.values(plans).some((plan) => plan.status === 'running');
  const projectView = projectMode && !preview && settings?.projectDelivery;
  function continueConversation() {
    changeCurrent((conversation) => {
      conversation.draft ||= t('assistantGuidance.continuePrompt');
    });
    setError(undefined);
    focusWithoutTooltip(input.current);
  }
  const rect = bounded(frame);
  return (
    <aside
      id="megit-assistant-panel"
      ref={root}
      className="assistant-panel"
      aria-label={t('assistant.title')}
      hidden={!open}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest('dialog')) return;
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="assistant-panel-header">
        <button
          type="button"
          className="assistant-move"
          aria-label={t('assistant.move')}
          onPointerDown={(event) => begin(event, 'move')}
          onKeyDown={(event) => keyboard(event, 'move')}
          {...handlers}
        >
          <AssistantAvatar size={24} />
          <strong>{t('assistant.title')}</strong>
        </button>
        <InfoPopover label={t('assistant.history')} triggerContent={<History size={16} />}>
          <div className="assistant-history-list">
            {session.conversations.map((conversation) => (
              <div className="assistant-history-entry" key={conversation.id}>
                <button
                  type="button"
                  key={conversation.id}
                  disabled={activeRun || projectView}
                  aria-current={conversation.id === current.id ? 'true' : undefined}
                  onClick={() => selectConversation(conversation.id)}
                >
                  {conversation.title || t('assistant.newConversation')}
                </button>
                <IconButton
                  size="small"
                  label={t('assistant.deleteConversation', {
                    name: conversation.title || t('assistant.newConversation'),
                  })}
                  disabled={activeRun || generating || projectView}
                  onClick={() =>
                    setSession((saved) => {
                      const conversations = saved.conversations.filter(
                        (item) => item.id !== conversation.id,
                      );
                      if (!conversations.length) conversations.push(newConversation(currentIds));
                      return {
                        conversations,
                        activeId:
                          saved.activeId === conversation.id ? conversations[0].id : saved.activeId,
                      };
                    })
                  }
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ))}
          </div>
        </InfoPopover>
        <IconButton
          label={t('assistant.newConversation')}
          size="small"
          disabled={activeRun || projectView || session.conversations.length >= 12}
          onClick={() => {
            pending.current?.abort();
            follow.current = true;
            const next = newConversation(currentIds);
            setSession((saved) => ({
              ...saved,
              activeId: next.id,
              conversations: [...saved.conversations, next],
            }));
            setError(undefined);
          }}
        >
          <Plus size={16} />
        </IconButton>
        <IconButton label={t('assistant.close')} size="small" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </header>
      {projectView && settings && (
        <AssistantProject
          key={JSON.stringify([settings.endpoint, settings.model])}
          repositories={repositories.filter((repo) => !repo.archived)}
          initialRepository={currentIds.length === 1 ? currentIds[0] : ''}
          initialPrompt={current.draft}
          settings={settings}
          active={open}
          onBack={() => {
            setProjectMode(false);
            requestAnimationFrame(() => focusWithoutTooltip(input.current));
          }}
        />
      )}
      <div className="assistant-history-shell" hidden={projectView}>
        <div
          className="assistant-messages"
          ref={history}
          role="log"
          aria-label={t('assistant.messages')}
          tabIndex={0}
          onScroll={() => {
            const element = history.current!;
            follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
            setFollowing(follow.current);
          }}
        >
          {!current.messages.length && (
            <div className="assistant-welcome">
              <AssistantAvatar size={40} />
              <h3>{t('assistant.welcome')}</h3>
              <p>{t('assistant.welcomeHelp')}</p>
              <div className="assistant-quick-actions">
                {(board
                  ? ([
                      'explainFlow',
                      'createFlow',
                      'arrangeFlow',
                      'inspect',
                      'commit',
                      'push',
                    ] as const)
                  : (['inspect', 'commit', 'push'] as const)
                ).map((kind) => (
                  <button
                    type="button"
                    key={kind}
                    onClick={() => {
                      changeCurrent((conversation) => {
                        if (['explainFlow', 'createFlow', 'arrangeFlow'].includes(kind))
                          conversation.includeBoard = true;
                        conversation.draft = t(`assistant.prompts.${kind}`);
                      });
                      input.current?.focus();
                    }}
                  >
                    {t(`assistant.quick.${kind}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {current.messages.map((message) => (
            <article className="assistant-message" data-role={message.role} key={message.id}>
              {message.role === 'assistant' && (
                <div className="assistant-message-author">
                  <AssistantAvatar size={24} />
                  <strong>{t('assistant.name')}</strong>
                </div>
              )}
              <div className="assistant-text">{message.text}</div>
              {message.boardPlan && (
                <AssistantBoardPlan
                  plan={message.boardPlan}
                  board={board}
                  repositories={repositories}
                  ready={boardReady}
                  busy={generating || activeRun}
                  status={message.boardStatus}
                  onApply={() => {
                    if (!onApplyBoard?.(message.boardPlan!)) {
                      setError(new ApiError('assistantBoardChanged'));
                      return;
                    }
                    changeCurrent((conversation) => {
                      const saved = conversation.messages.find((item) => item.id === message.id);
                      if (saved) saved.boardStatus = 'applied';
                    });
                  }}
                  onDiscard={() =>
                    changeCurrent((conversation) => {
                      const saved = conversation.messages.find((item) => item.id === message.id);
                      if (saved) saved.boardStatus = 'discarded';
                    })
                  }
                />
              )}
              {open &&
                !preview &&
                message.role === 'assistant' &&
                message.id === latestAssistantId && (
                  <AssistantGuidance
                    guides={[
                      ...(message.guides || []),
                      ...(message.planId
                        ? (plans[message.planId]?.steps || []).flatMap((step) =>
                            guidanceForError([step.repositoryId], step.error?.code),
                          )
                        : []),
                    ]}
                    repositories={repositories}
                    disabled={generating || activeRun}
                    onRefresh={onRefresh}
                    onContinue={continueConversation}
                    onRepositories={onRepositories}
                    actionViewKey={actionViewKey}
                  />
                )}
              {message.role === 'user' && (
                <div className="assistant-message-scope">
                  {message.boardName && <span>{message.boardName} · </span>}
                  {message.repositoryIds
                    .map(
                      (id) =>
                        repositories.find((repo) => repo.id === id)?.name ||
                        t('assistant.missingRepository'),
                    )
                    .join(' · ')}
                </div>
              )}
              {message.planId &&
                (planErrors[message.planId] ? (
                  <div role="alert" className="error-message">
                    {formatError(planErrors[message.planId])}
                    <AssistantFailureHelp
                      error={planErrors[message.planId]}
                      disabled={generating || activeRun}
                      onSettings={onSettings}
                      onRefresh={onRefresh}
                      onContinue={continueConversation}
                    />
                  </div>
                ) : plans[message.planId] ? (
                  <AssistantPlan
                    plan={plans[message.planId]}
                    busy={generating || activeRun}
                    onExecute={() => void execute(message.planId!)}
                    onStop={() => void stop(message.planId!)}
                    onPrepare={continueConversation}
                    onMessage={(stepId, text) => {
                      changeCurrent((conversation) => {
                        const saved = conversation.messages.find((item) => item.id === message.id)!;
                        (saved.planMessages ??= {})[stepId] = text;
                      });
                      setPlans((saved) => ({
                        ...saved,
                        [message.planId!]: {
                          ...saved[message.planId!],
                          steps: saved[message.planId!].steps.map((step) =>
                            step.id === stepId
                              ? { ...step, message: text, commands: [['commit', '-m', text]] }
                              : step,
                          ),
                        },
                      }));
                    }}
                  />
                ) : (
                  <p role="status">{t('assistant.loadingPlan')}</p>
                ))}
            </article>
          ))}
          {generating && (
            <p role="status" className="muted">
              {t('assistant.thinking')}
            </p>
          )}
        </div>
        {!following && current.messages.length > 0 && (
          <Button
            className="assistant-jump"
            size="compact"
            icon={<ArrowDown size={14} />}
            onClick={() => {
              follow.current = true;
              setFollowing(true);
              history.current?.scrollTo({ top: history.current.scrollHeight, behavior: 'smooth' });
            }}
          >
            {t('assistant.latest')}
          </Button>
        )}
      </div>
      <div className="assistant-composer-shell" hidden={projectView}>
        {!!error && (
          <div className="error-message" role="alert">
            {formatError(error)}
            {open && !preview && (
              <>
                <AssistantGuidance
                  guides={guidanceForError(currentIds, (error as { code?: string }).code)}
                  repositories={repositories}
                  disabled={generating || activeRun}
                  onRefresh={onRefresh}
                  onContinue={continueConversation}
                  onRepositories={onRepositories}
                  actionViewKey={actionViewKey}
                />
                <AssistantFailureHelp
                  error={error}
                  disabled={generating || activeRun}
                  onSettings={onSettings}
                  onRefresh={onRefresh}
                  onContinue={continueConversation}
                />
              </>
            )}
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          {!settings?.model && (
            <Button size="compact" onClick={onSettings}>
              {t('assistant.configure')}
            </Button>
          )}
          <div className="assistant-composer">
            <div className="assistant-references">
              {selectedBoard && (
                <span>
                  <Workflow size={14} />
                  <span>{selectedBoard.name}</span>
                  <IconButton
                    size="small"
                    label={t('assistant.board.remove')}
                    disabled={generating || activeRun}
                    onClick={() =>
                      changeCurrent((conversation) => {
                        conversation.includeBoard = false;
                      })
                    }
                  >
                    <X size={12} />
                  </IconButton>
                </span>
              )}
              {currentIds.map((id) => {
                const repo = repositories.find((item) => item.id === id)!;
                return (
                  <span key={id}>
                    <RepositoryAvatar repo={repo} size="small" />
                    <span>{repo.name}</span>
                    <IconButton
                      size="small"
                      label={t('assistant.removeRepository', { name: repo.name })}
                      disabled={generating || activeRun}
                      onClick={() =>
                        changeCurrent((conversation) => {
                          conversation.repositoryIds = conversation.repositoryIds.filter(
                            (item) => item !== id,
                          );
                        })
                      }
                    >
                      <X size={12} />
                    </IconButton>
                  </span>
                );
              })}
            </div>
            <textarea
              ref={input}
              aria-label={t('assistant.prompt')}
              placeholder={t('assistant.placeholder')}
              maxLength={6000}
              value={current.draft}
              disabled={generating || activeRun}
              onChange={(event) =>
                changeCurrent((conversation) => {
                  conversation.draft = event.target.value;
                })
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="assistant-composer-controls">
              <InfoPopover label={t('assistant.scope')} triggerContent={<FolderGit2 size={16} />}>
                <div className="assistant-repository-picker">
                  {board && (
                    <label>
                      <input
                        type="checkbox"
                        checked={!!selectedBoard}
                        disabled={generating || activeRun}
                        onChange={(event) =>
                          changeCurrent((conversation) => {
                            conversation.includeBoard = event.target.checked;
                          })
                        }
                      />
                      <span>{t('assistant.board.scope', { name: board.name })}</span>
                    </label>
                  )}
                  {repositories
                    .filter((repo) => !repo.archived)
                    .map((repo) => (
                      <label key={repo.id}>
                        <input
                          type="checkbox"
                          checked={currentIds.includes(repo.id)}
                          disabled={
                            generating ||
                            activeRun ||
                            (!currentIds.includes(repo.id) && currentIds.length >= 20)
                          }
                          onChange={(event) =>
                            changeCurrent((conversation) => {
                              conversation.repositoryIds = event.target.checked
                                ? [...currentIds, repo.id]
                                : currentIds.filter((id) => id !== repo.id);
                            })
                          }
                        />
                        <RepositoryAvatar repo={repo} size="small" />
                        <span>{repo.name}</span>
                      </label>
                    ))}
                </div>
              </InfoPopover>
              <InfoPopover
                label={t('assistant.dataScope')}
                triggerContent={<CircleHelp size={16} />}
              >
                <p>{t('assistant.disclosure')}</p>
                <label className="assistant-diff-option">
                  <input
                    type="checkbox"
                    checked={current.includeStagedDiff}
                    disabled={generating || activeRun}
                    onChange={(event) =>
                      changeCurrent((conversation) => {
                        conversation.includeStagedDiff = event.target.checked;
                      })
                    }
                  />
                  {t('assistant.includeDiff')}
                </label>
              </InfoPopover>
              <span className="assistant-model" title={settings?.model}>
                {settings?.model || t('assistant.noModel')}
              </span>
              {!preview && settings?.projectDelivery && (
                <IconButton size="small" label={t('projectDelivery.title')} disabled={generating || activeRun} onClick={() => setProjectMode(true)}>
                  <FilePenLine size={16} />
                </IconButton>
              )}
              <IconButton size="small" label={t('settings.title')} onClick={onSettings}>
                <Settings2 size={15} />
              </IconButton>
              {generating ? (
                <IconButton
                  label={t('assistant.stopGeneration')}
                  onClick={(event) => {
                    // Cancellation replaces this button with a submit button in the same click.
                    event.preventDefault();
                    pending.current?.abort();
                  }}
                >
                  <Square size={15} />
                </IconButton>
              ) : (
                <IconButton
                  type="submit"
                  label={t('assistant.send')}
                  className="assistant-send"
                  disabled={
                    !current.draft.trim() ||
                    (!currentIds.length && !selectedBoard) ||
                    (!!selectedBoard && !boardReady) ||
                    activeRun ||
                    !settings?.model ||
                    current.messages.length >= 78
                  }
                >
                  <ArrowUp size={18} />
                </IconButton>
              )}
            </div>
          </div>
          {!!selectedBoard && !boardReady && (
            <p role="status" className="muted">
              {t('assistant.board.waitSave')}
            </p>
          )}
          {!currentIds.length && !selectedBoard && (
            <p role="status" className="muted">
              {t('assistant.selectScope')}
            </p>
          )}
          {current.messages.length >= 78 && (
            <p role="status" className="muted">
              {t('assistant.historyFull')}
            </p>
          )}
        </form>
      </div>
      {assistantEdges.map((edge) => (
        <button
          key={edge}
          type="button"
          className="assistant-resize"
          data-resize-edge={edge}
          aria-label={t(`assistant.resizeEdges.${edge}`)}
          onPointerDown={(event) => begin(event, edge)}
          onKeyDown={(event) => keyboard(event, edge)}
          {...handlers}
        />
      ))}
    </aside>
  );
}
