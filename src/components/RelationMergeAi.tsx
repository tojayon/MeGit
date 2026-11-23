import { useEffect, useId, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RelationMergeAdvice } from '../../shared/types';
import { formatError } from '../lib/messages';
import { Button } from './Button';

export function RelationMergeAi({ review, applyMessage, draft, disabled, example = false }: {
  review: (signal: AbortSignal) => Promise<RelationMergeAdvice>;
  applyMessage?: (message: string) => void;
  draft?: string;
  disabled?: boolean;
  example?: boolean;
}) {
  const { t } = useTranslation();
  const heading = useId();
  const consentFocus = useRef<HTMLParagraphElement>(null);
  const section = useRef<HTMLElement>(null);
  const active = useRef<AbortController>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [advice, setAdvice] = useState<RelationMergeAdvice>();
  const [error, setError] = useState<unknown>(null);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => { if (confirm) consentFocus.current?.focus(); }, [confirm]);

  function restoreTrigger() {
    requestAnimationFrame(() => section.current?.querySelector<HTMLButtonElement>('[data-merge-ai-control]')?.focus());
  }

  async function requestReview() {
    const controller = new AbortController();
    active.current = controller;
    setConfirm(false);
    setBusy(true);
    setError(null);
    setAdvice(undefined);
    restoreTrigger();
    try {
      const result = await review(controller.signal);
      if (!controller.signal.aborted) setAdvice(result);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure);
    } finally {
      if (active.current === controller && !controller.signal.aborted) {
        active.current = null;
        const restore = section.current?.contains(document.activeElement);
        setBusy(false);
        if (restore) restoreTrigger();
      }
    }
  }

  const suggestedMessage = advice?.message;
  return (
    <section className="relation-merge-ai" ref={section} aria-labelledby={heading}>
      <div className="relation-merge-section-heading">
        <h3 id={heading}><Sparkles size={16} aria-hidden="true" />{t('relation.merge.ai.title')}</h3>
        {!confirm && (busy ? (
          <Button data-merge-ai-control size="compact" onClick={() => {
            active.current?.abort();
            active.current = null;
            setBusy(false);
            restoreTrigger();
          }}>{t('relation.merge.ai.stop')}</Button>
        ) : (
          <Button data-merge-ai-control size="compact" disabled={disabled} onClick={() => setConfirm(true)}>
            {t(advice ? 'relation.merge.ai.again' : 'relation.merge.ai.start')}
          </Button>
        ))}
      </div>
      {confirm ? (
        <>
          <p ref={consentFocus} tabIndex={-1}>{t(example ? 'relation.merge.ai.exampleConsent' : 'relation.merge.ai.consent')}</p>
          <div className="relation-merge-ai-actions">
            <Button size="compact" onClick={() => { setConfirm(false); restoreTrigger(); }}>{t('common.cancel')}</Button>
            <Button size="compact" variant="primary" disabled={disabled} onClick={() => void requestReview()}>{t('relation.merge.ai.send')}</Button>
          </div>
        </>
      ) : (
        <>
          {busy && <p role="status">{t('relation.merge.ai.working')}</p>}
          {error != null && <p className="error-message" role="alert">{formatError(error)}</p>}
          {advice ? <div className="relation-merge-ai-result" role="status">{advice.text}</div> :
            !busy && error == null && <p className="muted">{t('relation.merge.ai.help')}</p>}
          {advice && (suggestedMessage ? (
            <div className="relation-merge-ai-message">
              <h4>{t('relation.merge.ai.message')}</h4>
              <p>{suggestedMessage}</p>
              {applyMessage && <Button size="compact" disabled={disabled || draft === suggestedMessage}
                onClick={() => applyMessage(suggestedMessage)}>
                {t(draft === suggestedMessage ? 'relation.merge.ai.applied' : draft?.trim() ? 'relation.merge.ai.replace' : 'relation.merge.ai.use')}
              </Button>}
            </div>
          ) : <p className="muted">{t('relation.merge.ai.noMessage')}</p>)}
        </>
      )}
    </section>
  );
}
