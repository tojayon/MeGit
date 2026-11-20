import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import type { ErrorInfo } from '../../shared/messages';
import { Button } from './Button';
import { formatError } from '../lib/messages';
import { Tooltip } from './Tooltip';

export function AssistantFailureHelp({
  error,
  disabled,
  onSettings,
  onRefresh,
  onContinue,
}: {
  error: unknown;
  disabled?: boolean;
  onSettings: () => void;
  onRefresh: () => Promise<void>;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const [failure, setFailure] = useState<unknown>();
  const [refreshing, setRefreshing] = useState(false);
  const code = (error as Partial<ErrorInfo> | undefined)?.code;
  const settings =
    !!code &&
    [
      'aiNotConfigured',
      'aiUnavailable',
      'aiInvalid',
      'aiKeyRequired',
      'aiStorage',
      'proxyInvalid',
      'proxyConnection',
      'proxyTimeout',
      'proxyUnsupported',
    ].includes(code);
  const refresh =
    !!code &&
    [
      'assistantStateChanged',
      'assistantPlanMissing',
      'assistantPlanExpired',
      'branchStateChanged',
      'branchTargetChanged',
      'pushNeedsFetch',
      'connection',
      'sessionExpired',
    ].includes(code);
  if (!settings && !refresh) return null;
  return (
    <div className="assistant-guidance-actions">
      {settings && (
        <Button size="compact" disabled={disabled} onClick={onSettings}>
          {t('assistant.configure')}
        </Button>
      )}
      {refresh && (
        <Tooltip content={t('assistantGuidance.refreshHelp')}>
          <Button
            size="compact"
            disabled={disabled || refreshing}
            onClick={async () => {
              setFailure(undefined);
              setRefreshing(true);
              try {
                await onRefresh();
              } catch (reason) {
                setFailure(reason);
              } finally {
                setRefreshing(false);
              }
            }}
          >
            {t('assistantGuidance.refresh')}
          </Button>
        </Tooltip>
      )}
      <Tooltip content={t('assistantGuidance.continueHelp')}>
        <Button size="compact" disabled={disabled} onClick={onContinue}>
          {t('assistantGuidance.prepareAgain')}
        </Button>
      </Tooltip>
      {!!failure && (
        <p role="alert" className="error-message">
          {formatError(failure)}
        </p>
      )}
    </div>
  );
}
