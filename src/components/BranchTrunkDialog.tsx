import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from './Dialogs';
import { Field } from './Field';
import { Button } from './Button';
import { Tooltip } from './Tooltip';
import { GitHelp } from './GitHelp';
import type { GitCommandPreviewData } from './GitCommandPreview';

export function BranchTrunkDialog({
  value,
  options,
  previewForRef,
  onApply,
  onClose,
}: {
  value: string;
  options: { ref: string; name: string }[];
  previewForRef?: (ref: string) => GitCommandPreviewData;
  onApply: (ref: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(value);
  return (
    <Dialog title={t('branchTree.changeTrunk')} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (options.some((option) => option.ref === selected)) onApply(selected);
        }}
      >
        <div className="dialog-body">
          <Field label={t('branchTree.trunk')} hint={t('branchTree.trunkHelp')}>
            <select
              data-dialog-initial-focus="true"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              {options.map((option) => (
                <option key={option.ref} value={option.ref}>
                  {option.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <footer className="dialog-footer">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Tooltip
            detailed
            content={
              <GitHelp
                topic="treeComparison"
                preview={previewForRef?.(selected) ?? { empty: 'view' }}
              />
            }
          >
            <Button
              type="submit"
              variant="primary"
              disabled={!options.some((option) => option.ref === selected)}
            >
              {t('branchTree.applyTrunk')}
            </Button>
          </Tooltip>
        </footer>
      </form>
    </Dialog>
  );
}
