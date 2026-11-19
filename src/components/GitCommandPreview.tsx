import { useTranslation } from 'react-i18next';
import { formatGitCommand } from '../../shared/git-commands';

export type GitCommandPreviewData = {
  commands?: (string[] | null)[];
  when?: 'now' | 'confirm' | 'name' | 'read';
  empty?: 'pending' | 'clipboard' | 'view' | 'untracked';
  scope?: 'repository' | 'workspace';
};

export function GitCommandPreview({
  commands,
  when = 'now',
  empty = 'pending',
  scope = 'repository',
}: GitCommandPreviewData) {
  const { t } = useTranslation();
  const actual = commands?.filter((command): command is string[] => !!command);
  return (
    <span className="git-command-preview">
      {actual?.length ? (
        <>
          <strong>{t('gitCommands.title')}</strong>
          <span>{t(`gitCommands.${when}`)}</span>
          <code className="git-command-code">{actual.map(formatGitCommand).join('\n\n')}</code>
          <small>
            {t(scope === 'workspace' ? 'gitCommands.workspaceScope' : 'gitCommands.scope')}
          </small>
        </>
      ) : (
        <span>{t(`gitCommands.${empty}`)}</span>
      )}
    </span>
  );
}
