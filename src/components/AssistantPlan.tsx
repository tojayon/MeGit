import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Check, CircleAlert, GitBranch, LoaderCircle, SkipForward } from 'lucide-react';
import type { AssistantPlan as Plan } from '../../shared/assistant';
import { Button } from './Button';
import { GitCommandPreview } from './GitCommandPreview';
import { formatError } from '../lib/messages';

export function AssistantPlan({
  plan,
  busy,
  onExecute,
  onStop,
  onMessage,
  onPrepare,
}: {
  plan: Plan;
  busy?: boolean;
  onExecute?: () => void;
  onStop?: () => void;
  onMessage?: (stepId: string, message: string) => void;
  onPrepare?: () => void;
}) {
  const { t } = useTranslation();
  const repositories = [...new Set(plan.steps.map((step) => step.repositoryId))];
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const expired = now > Date.parse(plan.expiresAt);
  return (
    <section className="assistant-plan" aria-label={t('assistant.plan')}>
      <div className="assistant-plan-heading">
        <strong>{t('assistant.plan')}</strong>
        <span role="status">{t(`assistant.planStatus.${plan.status}`)}</span>
      </div>
      {repositories.map((id) => {
        const steps = plan.steps.filter((step) => step.repositoryId === id);
        return (
          <div key={id} className="assistant-plan-repository">
            <div className="assistant-plan-identity">
              <strong>{steps[0].repositoryName}</strong>
              <span>
                <GitBranch size={12} />
                {steps[0].branch}
              </span>
            </div>
            {steps.map((step) => (
              <div key={step.id}>
                {step.message !== undefined &&
                  (plan.status === 'ready' && onMessage ? (
                    <label className="assistant-message-field">
                      <span>{t('repository.message')}</span>
                      <textarea
                        aria-label={t('repository.message')}
                        value={step.message}
                        maxLength={10000}
                        disabled={busy}
                        onChange={(event) => onMessage(step.id, event.target.value)}
                      />
                    </label>
                  ) : (
                    <p className="assistant-commit-message">{step.message}</p>
                  ))}
                {step.target && <p>{t('assistant.target', { target: step.target })}</p>}
                <details key={step.id} className="assistant-step" data-status={step.status}>
                  <summary>
                    {step.status === 'succeeded' ? (
                      <Check size={14} />
                    ) : step.status === 'running' ? (
                      <LoaderCircle size={14} className="spin" />
                    ) : step.status === 'failed' ? (
                      <CircleAlert size={14} />
                    ) : (
                      <SkipForward size={14} />
                    )}
                    <span>{t(`assistant.operations.${step.type}`)}</span>
                    <small>{t(`assistant.stepStatus.${step.status}`)}</small>
                  </summary>
                  {step.fileCount !== undefined && (
                    <p>{t('assistant.files', { count: step.fileCount })}</p>
                  )}
                  <GitCommandPreview commands={step.commands} when="plan" />
                </details>
              </div>
            ))}
            {steps
              .filter((step) => step.error)
              .map((step) => (
                <p key={step.id} className="error-message" role="alert">
                  {formatError(step.error)}
                </p>
              ))}
          </div>
        );
      })}
      {plan.status === 'ready' && (
        <>
          <p className="assistant-plan-disclosure">
            {t(expired ? 'errors.assistantPlanExpired' : 'assistant.review')}
          </p>
          <div className="assistant-plan-actions">
            {expired && onPrepare && (
              <Button disabled={busy} onClick={onPrepare}>
                {t('assistantGuidance.prepareAgain')}
              </Button>
            )}
            <Button
              variant="primary"
              disabled={
                busy ||
                expired ||
                !onExecute ||
                plan.steps.some((step) => step.type === 'commit' && !step.message?.trim())
              }
              onClick={onExecute}
            >
              {t('assistant.execute')}
            </Button>
            <Button disabled={busy || !onStop} onClick={onStop}>
              {t('assistant.discard')}
            </Button>
          </div>
        </>
      )}
      {plan.status === 'running' && (
        <div className="assistant-plan-actions">
          <Button onClick={onStop} disabled={!onStop}>
            {t('assistant.stopActions')}
          </Button>
        </div>
      )}
      {['stopped', 'failed'].includes(plan.status) && (
        <>
          <p className="assistant-plan-disclosure">{t('assistant.partial')}</p>
          {onPrepare && (
            <Button disabled={busy} onClick={onPrepare}>
              {t('assistantGuidance.prepareAgain')}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
