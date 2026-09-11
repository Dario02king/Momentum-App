import type { DomainType } from '../../core/model';
import { useRadioKeys } from '../../domains/mental/AnswerControls';
import { useT } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n';
import './domainTerminal.css';

/**
 * The domain selector at the top of the terminal.
 *
 * A segmented control in the iOS shape the app already uses, exposed as a
 * radio group: the assistive-technology reading is "which of these areas is
 * selected", which is exactly what the control is. One tab stop, arrow keys
 * move the selection, and the selected segment is announced as checked
 * rather than merely styled.
 *
 * It is a domain selector, not a navigation bar — compact, one line, and it
 * shows only the areas the user has switched on, in the product's order.
 */

const LABELS: Record<DomainType, TranslationKey> = {
  mental: 'domain.wellbeing',
  gym: 'domain.gym',
  running: 'domain.running',
  food: 'domain.food',
};

export function DomainSwitch({
  domains,
  active,
  onSelect,
}: {
  /** The areas on offer, in order. */
  domains: readonly DomainType[];
  active: DomainType;
  onSelect(domain: DomainType): void;
}) {
  const t = useT();
  const onKeyDown = useRadioKeys(domains.length, (index) => onSelect(domains[index]!));
  const activeIndex = domains.indexOf(active);

  return (
    <div className="segmented domain-switch" role="radiogroup" aria-label={t('progress.domainSwitch')}>
      {domains.map((domain, index) => (
        <button
          key={domain}
          type="button"
          role="radio"
          className="segmented__option domain-switch__option"
          aria-checked={domain === active}
          tabIndex={index === activeIndex || (activeIndex === -1 && index === 0) ? 0 : -1}
          onClick={() => onSelect(domain)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {t(LABELS[domain])}
        </button>
      ))}
    </div>
  );
}
