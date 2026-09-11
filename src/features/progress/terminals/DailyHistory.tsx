import { Card, EmptyState, Section } from '../../../components';
import { ProgressIcon } from '../../../components/Icons';
import { useT } from '../../../i18n/I18nProvider';
import { Heatmap, type HeatmapRow } from '../Heatmap';

/**
 * A domain's daily history: the same grid Verlauf always drew, holding only
 * the rows that belong to the domain on screen. The grid itself is unchanged
 * — one column per day, the bar's height is the value, colour reinforces the
 * band, and the screen-reader table beneath it carries the same numbers.
 *
 * No rows is a state, not a blank: the domain has recorded nothing in the
 * range yet, and the card says so once.
 */
export function DailyHistory({ rows, days }: { rows: HeatmapRow[]; days: string[] }) {
  const t = useT();
  return (
    <Section label={t('progress.historyTitle')} labelHidden>
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<ProgressIcon size={26} />}
            title={t('progress.emptyTitle')}
            body={t('progress.emptyBody')}
          />
        ) : (
          <Heatmap rows={rows} days={days} />
        )}
      </Card>
    </Section>
  );
}
