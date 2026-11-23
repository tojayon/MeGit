import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Square } from 'lucide-react';
import type { LocalServiceAction, LocalServiceCardState } from '../../shared/local-service';
import { formatError } from '../lib/messages';
import { focusWithoutTooltip } from '../lib/overlays';
import { IconButton } from './IconButton';

function ServiceUptime({ runningSince }: { runningSince: number }) {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(Date.now);
  const format = useMemo(
    () =>
      new Intl.NumberFormat(i18n.resolvedLanguage, {
        minimumIntegerDigits: 2,
        useGrouping: false,
      }).format,
    [i18n.resolvedLanguage],
  );
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - runningSince) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds / 3600) % 24;
  const minutes = Math.floor(seconds / 60) % 60;
  const clock = [hours, minutes, seconds % 60].map(format).join(':');
  return (
    <span className="local-service-card-uptime" role="timer" aria-label={t('localService.uptime')}>
      {days > 0 ? t('localService.uptimeFormat', { days: format(days), clock }) : clock}
    </span>
  );
}

export function LocalServiceCardControls({
  service,
  pending,
  readProblem,
  onAction,
}: {
  service: LocalServiceCardState;
  pending?: LocalServiceAction;
  readProblem?: unknown;
  onAction: (action: LocalServiceAction, revision: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const statusId = useId();
  const controls = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  const [issue, setIssue] = useState<{ revision: string; error: unknown }>();
  const { revision, status } = service;
  const shownStatus = pending === 'stop' ? 'stopping' : pending ? 'starting' : status;
  const running = shownStatus === 'running';
  const busy = shownStatus === 'starting' || shownStatus === 'stopping';
  const statusLabel = t(`localService.status.${shownStatus}`);
  const error = readProblem ?? (issue?.revision === revision ? issue.error : null) ?? service.error;

  useLayoutEffect(() => {
    if (!restoreFocus.current || pending) return;
    const button = controls.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
    if (!button && busy) return;
    restoreFocus.current = false;
    if (button && document.activeElement === document.body) focusWithoutTooltip(button);
  }, [pending, busy, shownStatus]);

  async function perform(action: LocalServiceAction, keyboard: boolean) {
    if (!revision || busy || readProblem) return;
    restoreFocus.current = keyboard;
    setIssue(undefined);
    try {
      await onAction(action, revision);
    } catch (error) {
      setIssue({ revision, error });
    }
  }

  return (
    <>
      {revision && (
        <div
          ref={controls}
          className="local-service-card-controls nodrag nopan"
          role="group"
          aria-label={t('localService.title')}
          data-status={shownStatus}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <span id={statusId} className="local-service-card-status" role="status">
            {statusLabel}
          </span>
          {running && service.runningSince !== undefined && (
            <ServiceUptime key={service.runningSince} runningSince={service.runningSince} />
          )}
          <IconButton
            size="small"
            placement="right"
            variant={running ? 'danger' : 'default'}
            label={busy ? statusLabel : t(running ? 'localService.stop' : 'localService.cardStart')}
            aria-describedby={busy ? undefined : statusId}
            busy={busy}
            disabled={!!readProblem}
            onClick={(event) => void perform(running ? 'stop' : 'start', event.detail === 0)}
          >
            {running ? (
              <Square size={13} aria-hidden="true" />
            ) : (
              <Play size={14} aria-hidden="true" />
            )}
          </IconButton>
        </div>
      )}
      {error != null && (
        <p role="alert" className="local-service-card-error nodrag nopan">
          {formatError(error)}
        </p>
      )}
    </>
  );
}
