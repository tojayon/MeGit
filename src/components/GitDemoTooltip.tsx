import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { GitLearningDemoId, GitLearningPlayback } from '../lib/git-learning-media';
import { GitLearningPreview } from './GitLearningPreview';
import { Tooltip } from './Tooltip';

export function GitDemoTooltip({
  demo,
  playback = 'animated',
  placement = 'bottom',
  children,
}: {
  demo: GitLearningDemoId;
  playback?: GitLearningPlayback;
  placement?: 'top' | 'bottom' | 'right';
  children: ReactElement<{ 'aria-describedby'?: string }>;
}) {
  const { t } = useTranslation();
  return (
    <Tooltip
      detailed
      openDelay={500}
      placement={placement}
      className="git-demo-tooltip"
      content={
        <span className="git-demo-tooltip-content">
          <span className="git-demo-tooltip-heading">
            <strong>{t(`learning.preview.titles.${demo}`)}</strong>
            <small>{t('learning.preview.simulation')}</small>
          </span>
          <GitLearningPreview demo={demo} playback={playback} />
        </span>
      }
    >
      {children}
    </Tooltip>
  );
}
