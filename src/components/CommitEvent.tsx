import { useTranslation } from 'react-i18next';
import type { Commit } from '../../shared/types';

export function CommitEvent({ commit }: { commit: Commit }) {
  const { t, i18n } = useTranslation();
  const date = new Date(commit.date);
  const formatted = Number.isNaN(date.getTime())
    ? commit.date
    : new Intl.DateTimeFormat(i18n.resolvedLanguage, {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(date);
  return (
    <span className="commit-event">
      <strong>{commit.subject}</strong>
      <span>
        {t(
          commit.rootUnconfirmed
            ? 'branchTree.boundaryEvent'
            : commit.parents.length === 0
              ? 'branchTree.rootEvent'
              : commit.parents.length > 1
                ? 'branchTree.mergeEvent'
                : 'branchTree.commitEvent',
          { total: commit.parents.length },
        )}
      </span>
      <span>
        {commit.author} · <time dateTime={commit.date}>{formatted}</time>
      </span>
      <code>{commit.hash}</code>
      {!!commit.parents.length && (
        <span>
          {t('branchTree.eventParents', {
            parents: commit.parents.map((hash) => hash.slice(0, 7)).join(' · '),
          })}
        </span>
      )}
      {!!commit.refs && <span>{commit.refs}</span>}
    </span>
  );
}
