import { useEffect, useRef, useState } from 'react';
import { CircleAlert, Info, LoaderCircle, Terminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ActiveLocalService } from '../../shared/local-service';
import type { Board, Repository, Snapshot } from '../../shared/types';
import { request, timeAgo } from '../lib/api';
import { formatError } from '../lib/messages';
import { focusWithoutTooltip } from '../lib/overlays';
import { Button } from './Button';
import { InfoPopover } from './InfoPopover';
import { LocalServiceDialog } from './LocalServiceDialog';
import { Tooltip } from './Tooltip';

export function WorkspaceStatusbar({
  board,
  repositories,
  saveStatus,
  refreshing,
  checkedAt,
  preview,
}: {
  board: Board;
  repositories: Repository[];
  saveStatus: 'saved' | 'saving' | 'failed';
  refreshing: boolean;
  checkedAt?: Snapshot['checkedAt'];
  preview?: { services: ActiveLocalService[]; open: (repo: Repository) => void };
}) {
  const { t } = useTranslation();
  const [active, setActive] = useState<ActiveLocalService[]>([]);
  const [serviceError, setServiceError] = useState<unknown>(null);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const footer = useRef<HTMLElement>(null);
  const queryServices = !preview && repositories.length > 0;

  useEffect(() => {
    if (!queryServices) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        if (document.hidden) return;
        const services = await request<ActiveLocalService[]>('/local-services', {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setActive(services);
          setServiceError(null);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setActive([]);
          setServiceError(error);
        }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void refresh(), 2000);
      }
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [queryServices]);

  const byId = new Map(repositories.map((repo) => [repo.id, repo]));
  const services = (preview?.services ?? active).flatMap(({ repoId, status }) => {
    const repo = byId.get(repoId);
    return repo ? [{ repo, status }] : [];
  });
  const opened = openedId ? byId.get(openedId) : undefined;
  const saveLabel = t(`board.${saveStatus}`);
  const StatusIcon =
    saveStatus === 'failed' ? CircleAlert : saveStatus === 'saving' ? LoaderCircle : Info;

  return (
    <>
      <span className={`save-state ${saveStatus} workspace-save-announcement`} role="status">
        {saveLabel}
      </span>
      <footer ref={footer} className="workspace-statusbar">
        {!!services.length && (
          <div
            className="workspace-service-tabs"
            role="group"
            aria-label={t('localService.activeTitle')}
          >
            {services.map(({ repo, status }) => (
              <Tooltip
                key={repo.id}
                placement="top"
                content={
                  <>
                    {repo.name} · {t(`localService.status.${status}`)}
                  </>
                }
              >
                <Button
                  className="workspace-service-tab"
                  icon={<Terminal size={14} />}
                  data-status={status}
                  aria-label={t('localService.activeNamed', { name: repo.name })}
                  aria-haspopup="dialog"
                  onClick={() => (preview ? preview.open(repo) : setOpenedId(repo.id))}
                >
                  {repo.name}
                </Button>
              </Tooltip>
            ))}
          </div>
        )}
        <InfoPopover
          label={t('board.windowStatus')}
          placement="top"
          triggerClassName={`workspace-status-trigger ${saveStatus === 'failed' ? 'danger-text' : ''}`}
          triggerContent={
            <>
              <StatusIcon
                size={14}
                className={saveStatus === 'saving' ? 'spin' : undefined}
                aria-hidden="true"
              />
              <span>{t('board.windowStatus')}</span>
            </>
          }
        >
          <ul className="workspace-status-details">
            <li className={saveStatus === 'failed' ? 'danger-text' : undefined}>{saveLabel}</li>
            <li>{t('board.repositories', { count: board.nodes.length })}</li>
            <li>{t('board.relations', { count: board.edges.length })}</li>
            {!!board.connections?.length && (
              <li>{t('flowchart.connections', { count: board.connections.length })}</li>
            )}
            <li>
              {refreshing
                ? t('board.reading')
                : checkedAt != null
                  ? t('board.checked', { time: timeAgo(checkedAt) })
                  : t('board.waiting')}
            </li>
            <li>{t('board.autoCheck')}</li>
          </ul>
          {queryServices && serviceError != null && (
            <p className="error-message" role="alert">
              {formatError(serviceError)}
            </p>
          )}
        </InfoPopover>
        {opened && (
          <LocalServiceDialog
            repo={opened}
            key={opened.id}
            onClose={() => {
              setOpenedId(null);
              requestAnimationFrame(() => {
                if (document.activeElement === document.body)
                  focusWithoutTooltip(footer.current?.querySelector('.workspace-status-trigger'));
              });
            }}
          />
        )}
      </footer>
    </>
  );
}
