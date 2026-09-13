import { useMemo } from 'react';
import { MUSCLE_GROUPS } from '../../core/model';
import { percentChange } from '../../core/gym/performance';
import { Section } from '../../components';
import { ChevronRightIcon } from '../../components/Icons';
import { BodyRenderer, type MuscleView } from '../../components/BodyRenderer';
import { useT } from '../../i18n/I18nProvider';
import type { GymHistory } from '../../storage/services/gymService';
import { muscleStateOf } from './muscleState';
import './gymHub.css';

/**
 * The door to muscle-group progress, on the Gym hub (WP2-2).
 *
 * A whole card that is one button, so the destination is obvious and the
 * tap target is the card. The figure inside it is the SVG body the app
 * already ships in the main bundle, drawn in the states the range shows —
 * or in the neutral, untrained state before the first workout. It is a
 * picture and is hidden from assistive technology; the button's name and
 * the two lines of text carry the facts. The 3D body is **not** here: it
 * loads only in the destination this card opens.
 *
 * Nothing is computed: the states and the overall figure are the ones
 * `GymProgress` shows, from the same loaded history.
 */
export function MuscleEntryCard({
  history,
  rangeDays,
  onOpen,
}: {
  /** `null` while loading; a history with no days before the first workout. */
  history: GymHistory | null;
  rangeDays: number;
  onOpen(): void;
}) {
  const t = useT();
  const views: MuscleView[] = useMemo(
    () =>
      (history?.overall.muscles ?? MUSCLE_GROUPS.map((muscle) => ({ muscle, status: 'noData' as const, ratio: null, exercises: 0, compared: 0, latestScore: null }))).map(
        (entry) => ({ muscle: entry.muscle, state: muscleStateOf(entry) }),
      ),
    [history],
  );

  const trained = views.filter((view) => view.state !== 'noData').length;
  const measured = history?.overall.measured.length ?? 0;
  const change = percentChange(history?.overall.ratio ?? null);
  const hasData = (history?.days.length ?? 0) > 0;

  const summary = !hasData
    ? t('gymHub.muscles.none')
    : measured > 0
      ? t('gymHub.muscles.summary', { count: measured, total: MUSCLE_GROUPS.length })
      : t('gymHub.muscles.trained', { count: trained, total: MUSCLE_GROUPS.length });
  const overall =
    hasData && measured > 0 && change !== null
      ? t('gymHub.muscles.overall', {
          change:
            Math.round(change) === 0
              ? t('gym.change.unchanged')
              : Math.round(change) > 0
                ? t('gym.change.improved', { percent: Math.round(change) })
                : t('gym.change.declined', { percent: Math.round(change) }),
        })
      : null;

  return (
    <Section label={t('gymHub.muscles.title')}>
      <button
        type="button"
        className="card gym-hub__muscles"
        data-card
        aria-label={t('gymHub.muscles.open')}
        onClick={onOpen}
      >
        <span className="gym-hub__figure" aria-hidden="true">
          <BodyRenderer muscles={views} parts="figure" size={64} />
        </span>
        <span className="gym-hub__musclesBody">
          <span className="gym-hub__musclesTitle">{t('gymHub.muscles.title')}</span>
          <span className="gym-hub__musclesSummary">{summary}</span>
          {overall ? <span className="gym-hub__musclesOverall">{overall}</span> : null}
          <span className="gym-hub__musclesRange">
            {hasData ? t('gymHub.muscles.range', { days: rangeDays }) : t('gymHub.muscles.noneHint')}
          </span>
        </span>
        <span className="gym-hub__chevron" aria-hidden="true">
          <ChevronRightIcon size={20} />
        </span>
      </button>
    </Section>
  );
}
