import { useMemo, useState } from 'react';
import { MUSCLE_GROUPS, type MuscleGroup } from '../../core/model';
import { Card, EmptyState, Section } from '../../components';
import { ChevronRightIcon, ProgressIcon } from '../../components/Icons';
import {
  BodyRenderer,
  MUSCLE_LABEL_KEYS,
  type MuscleState,
  type MuscleView,
} from '../../components/BodyRenderer';
import { percentChange, type MusclePerformance } from '../../core/gym/performance';
import { useT } from '../../i18n/I18nProvider';
import { exerciseHistory, type GymHistory } from '../../storage/services/gymService';
import { ExerciseDetail } from './ExerciseDetail';
import './gym.css';

/**
 * Gym, from the top down.
 *
 * ```
 *   Gym overall → muscle groups → exercises → best set per day
 * ```
 *
 * Four different numbers live on these screens and confusing them would make
 * all four useless, so each is labelled in its own terms: the **Gym rank**
 * belongs to the Rank screen and counts sessions per week; **group progress**
 * and **exercise progress** here are percentages of change against a previous
 * performance; and the raw **reps × kg** is always shown as reps × kg. No
 * number is presented as a score out of a hundred, because none of them is.
 */

/** The five states the body renderer draws, from one group's performance. */
export function muscleStateOf(entry: MusclePerformance): MuscleState {
  if (entry.status === 'noData') return 'noData';
  if (entry.status === 'insufficientBaseline') return 'awaitingBaseline';
  const ratio = entry.ratio ?? 1;
  return ratio > 1 ? 'improved' : ratio < 1 ? 'declined' : 'unchanged';
}

const changeText = (
  ratio: number | null,
  t: (key: 'gym.change.improved' | 'gym.change.declined' | 'gym.change.unchanged', params?: Record<string, string | number>) => string,
): string | null => {
  const change = percentChange(ratio);
  if (change === null) return null;
  const rounded = Math.round(change);
  if (rounded === 0) return t('gym.change.unchanged');
  return rounded > 0
    ? t('gym.change.improved', { percent: rounded })
    : t('gym.change.declined', { percent: rounded });
};

export function GymProgress({ history }: { history: GymHistory }) {
  const t = useT();
  const [selected, setSelected] = useState<MuscleGroup | null>(null);
  const [openExercise, setOpenExercise] = useState<string | null>(null);

  const views: MuscleView[] = useMemo(
    () =>
      history.overall.muscles.map((entry) => ({
        muscle: entry.muscle,
        state: muscleStateOf(entry),
        detail: changeText(entry.ratio, t as never),
      })),
    [history, t],
  );

  /** The exercises that reached the selected group, newest comparison first. */
  const exercises = useMemo(() => {
    const ids = new Set(
      history.days
        .filter((day) => selected === null || day.muscles.includes(selected))
        .map((day) => day.exerciseId),
    );
    return [...ids]
      .map((id) => ({
        id,
        name: history.names.get(id) ?? id,
        comparison: history.comparisons.get(id),
        latest: exerciseHistory(history, id)[0] ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [history, selected]);

  if (openExercise) {
    return (
      <ExerciseDetail
        name={history.names.get(openExercise) ?? openExercise}
        days={exerciseHistory(history, openExercise)}
        comparison={history.comparisons.get(openExercise)}
        onClose={() => setOpenExercise(null)}
      />
    );
  }

  if (history.days.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<ProgressIcon size={26} />}
          title={t('gym.progress.title')}
          body={t('gym.progress.noData')}
        />
      </Card>
    );
  }

  const overall = changeText(history.overall.ratio, t as never);

  return (
    <>
      <Section label={t('gym.progress.overall')}>
        <Card>
          <div className="gym-progress__headline">
            <span className="gym-progress__value">
              {overall ?? t('gym.progress.noBaseline')}
            </span>
            <span className="gym-progress__counted">
              {t('gym.progress.groupsCounted', {
                count: history.overall.measured.length,
                total: MUSCLE_GROUPS.length,
              })}
            </span>
          </div>
          <p className="gym-progress__note">{t('gym.progress.explainGroups')}</p>
          <p className="gym-progress__note">{t('gym.progress.explainMetric')}</p>
          {/* The one place the two numbers could be confused, said plainly. */}
          <p className="gym-progress__note gym-progress__note--strong">
            {t('gym.progress.ratingNote')}
          </p>
        </Card>
      </Section>

      <Section label={t('gym.progress.muscles')}>
        <Card>
          <BodyRenderer
            muscles={views}
            selected={selected}
            onSelect={(muscle) => setSelected((current) => (current === muscle ? null : muscle))}
          />
        </Card>
      </Section>

      <Section
        label={
          selected
            ? `${t('gym.progress.exercises')} · ${t(MUSCLE_LABEL_KEYS[selected])}`
            : t('gym.progress.exercises')
        }
      >
        <Card>
          {exercises.length === 0 ? (
            <EmptyState title={t('gym.progress.exercises')} body={t('gym.progress.noData')} />
          ) : (
            exercises.map((entry) => {
              const change = changeText(entry.comparison?.ratio ?? null, t as never);
              const kind = entry.comparison?.kind ?? 'noBaseline';
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="gym-progress__row"
                  aria-describedby={`${entry.id}-change`}
                  onClick={() => setOpenExercise(entry.id)}
                >
                  <span className="gym-progress__rowBody">
                    <span className="gym-progress__rowName">{entry.name}</span>
                    <span className="gym-progress__rowMuscles">
                      {(entry.latest?.muscles ?? [])
                        .map((muscle) => t(MUSCLE_LABEL_KEYS[muscle]))
                        .join(' · ')}
                    </span>
                  </span>
                  <span
                    id={`${entry.id}-change`}
                    className={`gym-progress__change gym-progress__change--${kind}`}
                  >
                    {change ?? t('gym.progress.noBaseline')}
                  </span>
                  <ChevronRightIcon size={18} />
                </button>
              );
            })
          )}
        </Card>
      </Section>
    </>
  );
}
