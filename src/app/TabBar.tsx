import { AreasIcon, ProgressIcon, RankIcon, TodayIcon } from '../components/Icons';
import { useT } from '../i18n/I18nProvider';
import type { TranslationKey } from '../i18n';

export type TabId = 'today' | 'progress' | 'rank' | 'areas';

const TABS: { id: TabId; labelKey: TranslationKey; Icon: typeof TodayIcon }[] = [
  { id: 'today', labelKey: 'nav.today', Icon: TodayIcon },
  { id: 'progress', labelKey: 'nav.progress', Icon: ProgressIcon },
  { id: 'rank', labelKey: 'nav.rank', Icon: RankIcon },
  { id: 'areas', labelKey: 'nav.areas', Icon: AreasIcon },
];

/**
 * Four destinations, translucent over the content that scrolls beneath it,
 * and clear of the home indicator. One tab per part of the product, never one
 * per feature.
 */
export function TabBar({ active, onSelect }: { active: TabId; onSelect(tab: TabId): void }) {
  const t = useT();
  return (
    <nav className="tab-bar" aria-label={t('app.name')}>
      {TABS.map(({ id, labelKey, Icon }) => (
        <button
          key={id}
          type="button"
          className="tab-bar__tab"
          aria-current={active === id ? 'page' : undefined}
          onClick={() => onSelect(id)}
        >
          <Icon size={25} />
          <span className="tab-bar__label">{t(labelKey)}</span>
        </button>
      ))}
    </nav>
  );
}
