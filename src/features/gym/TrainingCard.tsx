import { useCallback } from 'react';
import { today as currentDay } from '../../core/clock';
import { Button, Card, Section } from '../../components';
import { PlusIcon } from '../../components/Icons';
import { formatDayAndMonth, formatWeekday } from '../../i18n/format';
import { useI18n, useT } from '../../i18n/I18nProvider';
import { useLoadable } from '../../app/useLoadable';
import { existingSessionForDay, latestGymSession } from '../../storage/services/gymService';
import { listTrainingPlans } from '../../storage/services/trainingPlanService';
import type { GymRatingView } from './useGymRating';
import './gymHub.css';

/**
 * The top of the Gym hub: where training stands, and the one button.
 *
 * Three lines of existing facts — this week's attendance from the rating
 * state, the last session from the session log, and how many plans are
 * saved — and the primary action. Nothing is computed here that the app
 * does not already compute; nothing is shown that is not stored.
 */
export function weekSentence(t: ReturnType<typeof useT>, done: number, target: number): string {
  if (done < target) return t('gymHub.training.thisWeek', { done, target });
  if (done === target) return done === 1 ? t('gymHub.training.atTargetOne') : t('gymHub.training.atTarget', { done });
  return t('gymHub.training.aboveTarget', { done, target });
}

export function TrainingCard({
  rating,
  onStart,
  onManagePlans,
  reloadKey,
}: {
  rating: GymRatingView | null;
  onStart(): void;
  onManagePlans(): void;
  /** Changes when a workout closes, so the facts here are read again. */
  reloadKey: number;
}) {
  const t = useT();
  const { language } = useI18n();
  const date = currentDay();
  const load = useCallback(
    async () => ({
      latest: await latestGymSession(),
      today: await existingSessionForDay(date),
      plans: (await listTrainingPlans()).length,
      // Read on every reload: the key is the trigger, not a value.
      key: reloadKey,
    }),
    [date, reloadKey],
  );
  const { state } = useLoadable(load);
  const facts = state.status === 'ready' ? state.value : null;

  // The same two stored values, read three ways: a fraction only while the
  // target is ahead, because "7 von 3" reads as a bounded progress figure
  // that it is not. No number here changes; only the sentence does.
  const weekLine = rating && rating.started ? weekSentence(t, rating.state.sessionsThisWeek, rating.state.weeklyTarget) : t('gymHub.training.none');
  const lastLine = facts?.latest
    ? facts.today
      ? t('gymHub.training.today')
      : t('gymHub.training.last', {
          date: `${formatWeekday(language, facts.latest.date)}, ${formatDayAndMonth(language, facts.latest.date)}`,
        })
    : null;
  const plansLine =
    facts === null
      ? null
      : facts.plans === 0
        ? t('gymHub.plans.none')
        : facts.plans === 1
          ? t('gymHub.plans.countOne')
          : t('gymHub.plans.count', { count: facts.plans });

  return (
    <Section label={t('gymHub.training.title')}>
      <Card className="gym-hub__training">
        <p className="gym-hub__week">{weekLine}</p>
        {lastLine ? <p className="gym-hub__last">{lastLine}</p> : null}
        <div className="gym-hub__action">
          <Button variant="primary" block onClick={onStart}>
            <PlusIcon size={18} />
            {facts?.today ? t('gymHub.training.continue') : t('gymHub.training.log')}
          </Button>
        </div>
        {plansLine ? (
          <p className="gym-hub__plans">
            <span>{plansLine}</span>
            <button type="button" className="gym-hub__plansLink" onClick={onManagePlans}>
              {t('gymHub.plans.manage')}
            </button>
          </p>
        ) : null}
      </Card>
    </Section>
  );
}
