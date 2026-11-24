import { useContext, useId, useState, type ComponentProps, type ReactNode } from 'react';
import { Bot, Cable, Monitor, Network, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DesktopWindowContext } from '../lib/desktop-window';
import { AiPanel } from './AiPanel';
import { DesktopWindowSettingsPanel } from './DesktopWindowSettingsPanel';
import { Dialog } from './Dialogs';
import { NetworkSettingsPanel } from './NetworkSettingsPanel';

const categories = [
  { id: 'service', icon: Cable, label: 'ai.service' },
  { id: 'assistant', icon: Bot, label: 'settings.assistant' },
  { id: 'network', icon: Network, label: 'settings.network' },
  { id: 'interface', icon: Monitor, label: 'settings.interface' },
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
  const desktop = useContext(DesktopWindowContext);
  const [category, setCategory] = useState<(typeof categories)[number]['id']>('service');
  const current = categories.find((item) => item.id === category)!;
  let content: ReactNode;
  if (category === 'network') content = <NetworkSettingsPanel example={example} />;
  else if (category === 'interface') content = <DesktopWindowSettingsPanel example={example} />;
  else content = <AiPanel repositories={[]} {...ai} section={category} example={example} />;
  return (
    <Dialog
      title={t('settings.title')}
      titleIcon={<Settings2 className="settings-title-icon" size={18} aria-hidden="true" />}
      onClose={onClose}
      className="settings-dialog"
    >
      <div className="settings-layout">
        <nav
          className="settings-navigation settings-category-nav"
          aria-label={t('settings.categories')}
        >
          {categories
            .filter(({ id: categoryId }) => categoryId !== 'interface' || desktop || example)
            .map(({ id: categoryId, icon: Icon, label }) => (
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
