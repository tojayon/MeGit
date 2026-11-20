import { Plus, Upload, Link2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RemoteAction, RepoState } from '../../shared/types';
import { actionArguments } from '../../shared/git-commands';
import { Button } from './Button';
import { Tooltip } from './Tooltip';
import { GitCommandPreview } from './GitCommandPreview';

export function RemoteActionButton({
  type,
  disabled,
  onClick,
  state,
}: {
  type: RemoteAction['type'];
  disabled?: boolean;
  onClick: () => void;
  state?: RepoState;
}) {
  const { t } = useTranslation();
  const Icon = type === 'addRemote' ? Plus : type === 'publishBranch' ? Upload : Link2;
  const expected = {
    head: state?.head || '<commit>',
    branch: state?.branch || '<local-branch>',
    detached: false,
  };
  const action: RemoteAction =
    type === 'addRemote'
      ? { type, name: '<name>', destination: '<destination>' }
      : type === 'setTracking'
        ? { type, targetRef: 'refs/remotes/<remote/branch>', targetHash: '<commit>', expected }
        : {
            type,
            remote: state?.remotes.length === 1 ? state.remotes[0] : '<remote>',
            name: state?.branch || '<new-branch>',
            expected,
          };
  const commands = [
    actionArguments(action, {
      head: expected.head,
      files: [],
      pushTarget: null,
      upstreamHead: null,
    }),
  ];
  return (
    <Tooltip
      detailed
      content={
        <>
          <span>{t(`remoteActions.${type}Help`)}</span>
          <GitCommandPreview commands={commands} when="confirm" />
        </>
      }
    >
      <Button
        size="compact"
        variant={type === 'addRemote' ? 'primary' : 'default'}
        icon={<Icon size={16} />}
        disabled={disabled}
        onClick={onClick}
      >
        {t(`remoteActions.${type}Open`)}
      </Button>
    </Tooltip>
  );
}
