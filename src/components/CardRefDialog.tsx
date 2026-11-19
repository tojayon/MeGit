import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { branchRef, cardRefLabel } from '../../shared/card-refs';
import type { RepoState } from '../../shared/types';
import { Button } from './Button';
import { Dialog } from './Dialogs';
import { Field } from './Field';

export function CardRefDialog({
  state,
  initial,
  initialName,
  used,
  onSave,
  onClose,
}: {
  state?: RepoState;
  initial?: string;
  initialName?: string;
  used: Set<string>;
  onSave: (ref?: string, displayName?: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial ?? '');
  const [name, setName] = useState(initialName ?? '');
  const branches = state?.error ? [] : (state?.branches ?? []);
  const missing = !!initial && !branches.some((branch) => branchRef(branch) === initial);
  return (
    <Dialog title={t('repositoryCard.bindBranch')} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (
            !used.has(value) &&
            (!value || value === initial || branches.some((branch) => branchRef(branch) === value))
          )
            onSave(value || undefined, name.trim() || undefined);
        }}
      >
        <div className="dialog-body">
          <Field label={t('repositoryCard.displayName')}>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120}
              placeholder={t('repositoryCard.namePlaceholder')} />
          </Field>
          <Field
            label={t('repositoryCard.bindBranch')}
            error={missing && value === initial ? t('repositoryCard.refMissing') : undefined}
          >
            <select value={value} onChange={(event) => setValue(event.target.value)}>
              <option value="" disabled={used.has('')}>
                {t('repositoryCard.followHead')}
              </option>
              {missing && (
                <option value={initial} disabled>
                  {cardRefLabel(initial!)}
                </option>
              )}
              {branches.map((branch) => {
                const ref = branchRef(branch);
                return (
                  <option key={ref} value={ref} disabled={used.has(ref)}>
                    {t(branch.remote ? 'repositoryCard.remoteRef' : 'repositoryCard.localRef', {
                      name: branch.name,
                    })}
                  </option>
                );
              })}
            </select>
          </Field>
        </div>
        <footer className="dialog-footer">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            type="submit"
            variant="primary"
            disabled={used.has(value)}
          >
            {t('common.save')}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
