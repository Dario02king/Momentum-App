import { SPORTS } from '../../core/config/constants';
import { BubbleRow } from '../../components';
import { useT } from '../../i18n/I18nProvider';

const VALUES = Array.from(
  { length: SPORTS.MAX_TARGET_PER_WEEK - SPORTS.MIN_TARGET_PER_WEEK + 1 },
  (_, index) => SPORTS.MIN_TARGET_PER_WEEK + index,
);

/**
 * Sessions per week, as bubbles.
 *
 * A quota, not a schedule: the number says how often, never on which days.
 * Seven bubbles fit one thumb-width row, and seven is also the point where a
 * weekly quota stops saying anything a daily question would not.
 */
export function TargetPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange(next: number): void;
}) {
  const t = useT();
  return (
    <BubbleRow
      values={VALUES}
      selected={value}
      onSelect={onChange}
      label={t('onboarding.sports.title')}
      accent="var(--domain-sports-mid)"
      describe={(count) => t('onboarding.sports.perWeek', { count })}
    />
  );
}
