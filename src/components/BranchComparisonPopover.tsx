import { GitCompareArrows } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BranchComparison } from '../../shared/types';
import { formatError } from '../lib/messages';
import { Button } from './Button';
import { GitHelp, HelpTip } from './GitHelp';
import { InfoPopover } from './InfoPopover';
import { Tooltip } from './Tooltip';

export function BranchComparisonPopover({
  branchName,
  trunkName,
  commands,
  retryCommands = commands,
  active,
  result,
  error,
  onStart,
  onClose,
  onRetry,
}: {
  branchName: string;
  trunkName: string;
  commands: string[][];
  retryCommands?: string[][];
  active: boolean;
  result: BranchComparison | null;
  error?: unknown;
  onStart: () => void;
  onClose: () => void;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const icon = <GitCompareArrows size={15} aria-hidden="true" />;
  return (
    <div data-comparing={active}>
      <InfoPopover
        label={t('branchTree.compare')}
        triggerLabel={t('branchTree.compareBranch', { name: branchName })}
        triggerClassName="icon-button tree-map-action"
        triggerContent={icon}
        titleIcon={icon}
        panelClassName="branch-tree-comparison-popover"
        placement="right"
        help={<GitHelp topic="treeComparison" preview={{ when: 'read', commands }} />}
        onOpen={onStart}
        onClose={onClose}
      >
        <div className="branch-tree-comparison">
          <div className="branch-tree-comparison-heading">
            <div>
              <strong>{branchName}</strong>
              <span className="muted">{t('branchTree.comparison', { name: trunkName })}</span>
            </div>
            <HelpTip topic="treeComparison" />
          </div>
          {error ? (
            <>
              <p className="error-message" role="alert">
                {formatError(error)}
              </p>
              {onRetry && (
                <Tooltip
                  detailed
                  content={
                    <GitHelp
                      topic="treeComparison"
                      preview={{ when: 'read', commands: retryCommands }}
                    />
                  }
                >
                  <Button size="compact" onClick={onRetry}>
                    {t('branches.refresh')}
                  </Button>
                </Tooltip>
              )}
            </>
          ) : (
            <div role="status">
              {result ? (
                <>
                  <strong>{t(`branchTree.relations.${result.relation}`)}</strong>
                  <div className="tree-comparison-counts">
                    <span className="success-text">
                      {t('branchTree.sourceOnly', { count: result.sourceOnly })}
                    </span>
                    <span>{t('branchTree.targetOnly', { count: result.targetOnly })}</span>
                  </div>
                </>
              ) : (
                t('branchTree.comparing')
              )}
            </div>
          )}
        </div>
      </InfoPopover>
    </div>
  );
}
