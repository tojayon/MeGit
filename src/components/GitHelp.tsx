import { CircleHelp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from './Tooltip';
import type zhCN from '../i18n/locales/zh-CN';
import { GitCommandPreview, type GitCommandPreviewData } from './GitCommandPreview';

export type GitHelpTopic = keyof typeof zhCN.gitHelp.topics;

export function GitHelp({
  topic,
  preview,
}: {
  topic: GitHelpTopic;
  preview?: GitCommandPreviewData;
}) {
  const { t } = useTranslation();
  return (
    <span className="git-help-content">
      <strong>{t(`gitHelp.topics.${topic}.title`)}</strong>
      <span>{t(`gitHelp.topics.${topic}.meaning`)}</span>
      <span>{t(`gitHelp.topics.${topic}.effect`)}</span>
      {preview && <GitCommandPreview {...preview} />}
    </span>
  );
}

export function HelpTip({
  topic,
  related = [],
}: {
  topic: GitHelpTopic;
  related?: GitHelpTopic[];
}) {
  const { t } = useTranslation();
  return (
    <Tooltip
      detailed
      toggleOnClick
      content={
        <span className="git-help-topics">
          {[topic, ...related].map((item) => (
            <GitHelp key={item} topic={item} />
          ))}
        </span>
      }
    >
      <button
        type="button"
        className="icon-button small help-tip"
        aria-label={t('gitHelp.about', { name: t(`gitHelp.topics.${topic}.title`) })}
      >
        <CircleHelp size={15} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
