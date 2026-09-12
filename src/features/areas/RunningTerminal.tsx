import { Section } from '../../components';
import { useT } from '../../i18n/I18nProvider';
import { RunningOverview } from '../running/RunningOverview';
import { useRunningRating } from '../running/useRunningRating';

/**
 * Laufen, inside the Gym workspace.
 *
 * The same board Verlauf used to carry, in the same order — rating,
 * year-to-date pace, attendance — moved rather than rebuilt. Running replays
 * from its runs, so it loads on its own and an empty Gym says nothing about
 * it. Before the first run there is nothing to show a rating of, and the
 * card below is where the weekly target is set.
 */
export function RunningTerminal() {
  const t = useT();
  const rating = useRunningRating();
  if (!rating?.started) return null;
  return (
    <Section label={t('running.progress.title')}>
      <RunningOverview state={rating.state} started={rating.started} />
    </Section>
  );
}
