import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import { Bot, Cable } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AiPanel } from './AiPanel';
import { Dialog } from './Dialogs';
import { Field } from './Field';

const categories = [
  { id: 'service', icon: Cable, label: 'ai.service' },
  { id: 'assistant', icon: Bot, label: 'settings.assistant' },
] as const;

export function SettingsDialog({
  onClose,
  ai,
  example = false,
}: {
  onClose: () => void;
  ai?: Omit<ComponentProps<typeof AiPanel>, 'section'>;
  example?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [category, setCategory] = useState<(typeof categories)[number]['id']>('service');
  const current = categories.find((item) => item.id === category)!;
  let content: ReactNode = <AiPanel repositories={[]} {...ai} section={category} />;
  if (example)
    content =
      category === 'service' ? (
        <div className="settings-form">
          <Field label={t('ai.endpoint')}>
            <input readOnly value="https://example.invalid/v1" />
          </Field>
          <Field label={t('ai.model')}>
            <input readOnly value="example-model" />
          </Field>
          <Field label={t('ai.key')}>
            <input type="password" readOnly value="" />
          </Field>
        </div>
      ) : (
        <p className="muted">{t('settings.openBoard')}</p>
      );
  return (
    <Dialog title={t('settings.title')} onClose={onClose} className="settings-dialog">
      <div className="settings-layout">
        <nav className="settings-navigation" aria-label={t('settings.categories')}>
          {categories.map(({ id: categoryId, icon: Icon, label }) => (
            <button
              key={categoryId}
              type="button"
              aria-current={category === categoryId ? 'true' : undefined}
              onClick={() => setCategory(categoryId)}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{t(label)}</span>
            </button>
          ))}
        </nav>
        <section className="dialog-body settings-content" aria-labelledby={id}>
          <h3 id={id}>{t(current.label)}</h3>
          {content}
        </section>
      </div>
    </Dialog>
  );
}
