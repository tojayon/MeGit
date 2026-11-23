import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, FilePenLine, Shield, ShieldCheck } from 'lucide-react';
import type { AiSettings } from '../../shared/ai';
import type { Repository } from '../../shared/types';
import { formatError } from '../lib/messages';
import { dismissPopups } from '../lib/overlays';
import { Button } from './Button';
import { Dialog } from './Dialogs';
import { InfoPopover } from './InfoPopover';

export function AssistantCapability({
  settings,
  repository,
  referenceCount,
  writable,
  busy,
  onGrant,
  onRevoke,
}: {
  settings?: AiSettings;
  repository?: Repository;
  referenceCount: number;
  writable: boolean;
  busy: boolean;
  onGrant: (repo: Repository) => Promise<void>;
  onRevoke: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const descriptionId = useId();
  const [details, setDetails] = useState(false);
  const [error, setError] = useState<unknown>();
  const label =
    writable && repository
      ? t('projectDelivery.writeScopeFor', { name: repository.name })
      : t('projectDelivery.defaultScope');
  const restriction = !settings?.model
    ? t('assistant.noModel')
    : !settings.projectDelivery
      ? t('errors.projectDisabled')
      : !repository
        ? t(referenceCount > 1 ? 'projectDelivery.oneReference' : 'projectDelivery.noReference')
        : undefined;

  async function update(write: boolean) {
    setError(undefined);
    try {
      if (writable !== write) {
        if (write && repository) await onGrant(repository);
        else if (!write) await onRevoke();
      }
      dismissPopups();
    } catch (failure) {
      setError(failure);
    }
  }

  return (
    <>
      <InfoPopover
        label={t('projectDelivery.capability')}
        triggerLabel={label}
        triggerClassName="button compact assistant-capability"
        panelClassName="assistant-capability-menu"
        placement="top"
        headerAction={
          <Button
            className="assistant-capability-more"
            size="compact"
            onClick={() => {
              dismissPopups();
              setDetails(true);
            }}
          >
            {t('projectDelivery.learnMore')}
          </Button>
        }
        help={
          writable
            ? `${label} · ${t('projectDelivery.writeDetails')}`
            : t('projectDelivery.defaultDetails')
        }
        triggerContent={
          <>
            <Shield size={14} aria-hidden="true" />
            <span>{label}</span>
            <ChevronDown size={12} aria-hidden="true" />
          </>
        }
        onOpen={() => setError(undefined)}
      >
        <Button
          className="assistant-capability-choice"
          aria-label={t('projectDelivery.defaultScope')}
          aria-describedby={`${descriptionId}-default`}
          aria-pressed={!writable}
          disabled={busy}
          onClick={() => void update(false)}
        >
          <ShieldCheck size={17} aria-hidden="true" />
          <span>
            <strong>{t('projectDelivery.defaultScope')}</strong>
            <small id={`${descriptionId}-default`}>{t('projectDelivery.defaultDetails')}</small>
          </span>
          {!writable && <Check size={16} aria-hidden="true" />}
        </Button>
        <Button
          className="assistant-capability-choice"
          aria-label={t('projectDelivery.writeScope')}
          aria-describedby={`${descriptionId}-write`}
          aria-pressed={writable}
          disabled={busy || !!restriction}
          onClick={() => void update(true)}
        >
          <FilePenLine size={17} aria-hidden="true" />
          <span>
            <strong>{t('projectDelivery.writeScope')}</strong>
            <small id={`${descriptionId}-write`}>
              {restriction ??
                (repository && t('projectDelivery.writeBrief', { name: repository.name }))}
            </small>
          </span>
          {writable && <Check size={16} aria-hidden="true" />}
        </Button>
        {!!error && (
          <p role="alert" className="error-message">
            {formatError(error)}
          </p>
        )}
      </InfoPopover>
      {details && (
        <Dialog title={t('projectDelivery.detailsTitle')} onClose={() => setDetails(false)}>
          <div className="dialog-body assistant-capability-details">
            <section>
              <h3>{t('projectDelivery.defaultScope')}</h3>
              <p>{t('projectDelivery.defaultDetails')}</p>
            </section>
            <section>
              <h3>{t('projectDelivery.writeScope')}</h3>
              <p>{t('projectDelivery.writeDetails')}</p>
              <p>{t('projectDelivery.referenceDetails')}</p>
              {repository && (
                <p>
                  <strong>{repository.name}</strong> · <code>{repository.path}</code>
                </p>
              )}
              {settings?.model && (
                <p>
                  {t('projectDelivery.recipient', {
                    endpoint: settings.endpoint,
                    model: settings.model,
                  })}
                </p>
              )}
              <p>{t('projectDelivery.disclosure')}</p>
              <p>{t('projectDelivery.reviewDetails')}</p>
            </section>
          </div>
        </Dialog>
      )}
    </>
  );
}
