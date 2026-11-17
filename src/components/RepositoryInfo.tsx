import { useTranslation } from 'react-i18next';
import type { Repository, RepoState } from '../../shared/types';
import { InfoPopover } from './InfoPopover';
import { GitHelp, HelpTip, type GitHelpTopic } from './GitHelp';

export function RepositoryInfo({ repo, state }: { repo: Repository; state?: RepoState }) {
  const { t, i18n } = useTranslation();
  const date = (value?: string | null) =>
    value && Number.isFinite(new Date(value).getTime())
      ? new Intl.DateTimeFormat(i18n.resolvedLanguage, {
          dateStyle: 'medium',
          timeStyle: 'medium',
        }).format(new Date(value))
      : t('time.never');
  const unknown = state?.error ? t('repository.unavailable') : t('common.loading');
  const fields: [string, string, GitHelpTopic?][] = [
    [t('repository.name'), repo.name],
    [t('repository.path'), repo.path],
    [
      t('repository.currentBranch'),
      state && !state.error
        ? state.detached
          ? t('repository.detached')
          : state.branch || t('repository.unknownBranch')
        : unknown,
      'branch',
    ],
    [
      t('repository.fullCommit'),
      state && !state.error ? state.head || t('repository.noCommits') : unknown,
      'head',
    ],
    [
      t('repository.upstream'),
      state && !state.error ? state.upstream || t('repository.noUpstream') : unknown,
      'upstream',
    ],
    [
      t('repository.remotes'),
      state && !state.error
        ? state.remotes.length
          ? state.remotes.join(', ')
          : t('repository.noRemotes')
        : unknown,
      'remotes',
    ],
    [t('repository.fetched'), state && !state.error ? date(state.fetchedAt) : unknown, 'fetched'],
    [t('repository.checked'), state ? date(state.checkedAt) : unknown, 'checked'],
  ];
  return (
    <InfoPopover label={t('repository.information')} help={<GitHelp topic="repository" />}>
      <dl className="repository-information">
        {fields.map(([label, value, topic]) => (
          <div key={label}>
            <dt>
              {label}
              {topic && <HelpTip topic={topic} />}
            </dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </InfoPopover>
  );
}
