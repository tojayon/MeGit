import { GitBranch } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Repository } from '../../shared/types';
import { RepositoryAvatar } from './RepositoryAvatar';
import { Tooltip } from './Tooltip';

export function RelationRepositoryCard({
  role,
  repo,
  reference,
}: {
  role: 'source' | 'target';
  repo?: Repository;
  reference?: string;
}) {
  const { t } = useTranslation();
  const short = reference
    ?.replace(/^refs\/heads\//, '')
    .replace(/^refs\/remotes\//, '')
    .replace(/^refs\/tags\//, '');
  return (
    <div className="relation-repository-endpoint">
      <span className="comparison-caption">{t(`relation.${role}`)}</span>
      <article
        className="repository-node repository-card relation-repository-card"
        aria-label={t(`relation.${role}Repo`)}
      >
        <div className="repository-card-heading">
          {repo && <RepositoryAvatar repo={repo} size="large" />}
          <div className="repository-card-identity">
            <div className="repository-card-title-row">
              <h3>{repo?.name}</h3>
            </div>
            {reference && (
              <Tooltip
                detailed
                content={
                  <>
                    <strong>{reference}</strong>
                    <span>{t('relation.fullRefHelp')}</span>
                  </>
                }
              >
                <button type="button" className="relation-ref">
                  <GitBranch size={13} />
                  <span>{short}</span>
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}
