import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDayAndMonth } from '../../i18n/format';
import type { DateKey } from '../../core/dates';
import type { ExerciseRecord, GymSetRecord, MuscleGroup } from '../../core/model';
import { Button, Card, EmptyState, LoadFailure, Section } from '../../components';
import { ChevronLeftIcon, MinusIcon, PlusIcon } from '../../components/Icons';
import { MUSCLE_LABEL_KEYS } from '../../components/BodyRenderer';
import { useI18n, useT } from '../../i18n/I18nProvider';
import { useLoadable } from '../../app/useLoadable';
import {
  addSet,
  createExercise,
  ensureExerciseCatalogue,
  loadSession,
  removeExerciseFromSession,
  removeSet,
  updateSet,
  type GymSessionView,
} from '../../storage/services/gymService';
import { ExercisePicker } from './ExercisePicker';
import './gym.css';

/**
 * Logging a workout.
 *
 * Everything here is shaped by one fact: this screen is used standing between
 * sets, one-handed, sometimes sweating. So —
 *
 * - **Sets save as they are typed.** No confirm, no save button per set, and
 *   no modal between one set and the next.
 * - **The next set is one tap.** It arrives pre-filled with the previous
 *   set's reps and weight, because the second set of an exercise is almost
 *   always the first set again. Typing over a suggestion is faster than
 *   typing into an empty box.
 * - **Numeric keypads, not text fields.** `inputMode="decimal"` for weight,
 *   because 62.5 is a real weight; `numeric` for reps, because 8.5 is not a
 *   real rep count.
 * - **One sheet in the whole flow**, for picking an exercise. Everything else
 *   is on the page.
 */

const grams = (text: string): number => {
  const value = Number.parseFloat(text.replace(',', '.'));
  return Number.isFinite(value) ? Math.round(value * 1000) : 0;
};

const kgText = (weightGrams: number): string => {
  const kg = weightGrams / 1000;
  // Whole numbers read as whole numbers; 62.5 keeps its half.
  return Number.isInteger(kg) ? String(kg) : String(Number(kg.toFixed(3)));
};

function SetRow({
  set,
  index,
  exerciseName,
  editable,
  onChange,
  onRemove,
}: {
  set: GymSetRecord;
  index: number;
  exerciseName: string;
  editable: boolean;
  onChange(patch: { reps?: number; weightGrams?: number }): void;
  onRemove(): void;
}) {
  const t = useT();
  const [reps, setReps] = useState(String(set.reps));
  const [weight, setWeight] = useState(kgText(set.weightGrams));

  // A reload after a write brings the stored values back; the fields follow
  // them rather than holding whatever was half-typed before.
  useEffect(() => {
    setReps(String(set.reps));
    setWeight(kgText(set.weightGrams));
  }, [set.id, set.reps, set.weightGrams]);

  return (
    <div className="gym-set">
      <span className="gym-set__number" aria-hidden="true">
        {index + 1}
      </span>

      <label className="gym-set__field">
        <span className="visually-hidden">
          {t('gym.repsFor', { exercise: exerciseName, number: index + 1 })}
        </span>
        <input
          className="field gym-set__input"
          value={reps}
          inputMode="numeric"
          disabled={!editable}
          onChange={(event) => setReps(event.target.value.replace(/[^0-9]/g, ''))}
          onBlur={() => onChange({ reps: Number(reps || 0) })}
        />
        <span className="gym-set__unit" aria-hidden="true">
          {t('gym.reps')}
        </span>
      </label>

      <label className="gym-set__field">
        <span className="visually-hidden">
          {t('gym.weightFor', { exercise: exerciseName, number: index + 1 })}
        </span>
        <input
          className="field gym-set__input"
          value={weight}
          inputMode="decimal"
          disabled={!editable}
          onChange={(event) => setWeight(event.target.value.replace(/[^0-9.,]/g, ''))}
          onBlur={() => onChange({ weightGrams: grams(weight) })}
        />
        <span className="gym-set__unit" aria-hidden="true">
          {t('gym.weightUnit')}
        </span>
      </label>

      <button
        type="button"
        className="gym-set__remove"
        aria-label={t('gym.removeSet', { number: index + 1, exercise: exerciseName })}
        disabled={!editable}
        onClick={onRemove}
      >
        <MinusIcon size={18} />
      </button>
    </div>
  );
}

export function GymSessionScreen({
  sessionId,
  date,
  onClose,
}: {
  sessionId: string;
  date: DateKey;
  onClose(): void;
}) {
  const t = useT();
  const { language } = useI18n();
  const [picking, setPicking] = useState(false);
  const [exercises, setExercises] = useState<ExerciseRecord[]>([]);
  const busy = useRef(false);

  const load = useCallback(async () => {
    const [view] = await Promise.all([loadSession(sessionId)]);
    return view;
  }, [sessionId]);
  const { state, reload } = useLoadable(load);

  useEffect(() => {
    void ensureExerciseCatalogue().then(setExercises);
  }, []);

  /** Writes are serialised so a fast tapper cannot interleave two reloads. */
  const run = useCallback(
    (operation: () => Promise<unknown>) => {
      if (busy.current) return;
      busy.current = true;
      operation()
        .catch(() => undefined)
        .then(() => {
          busy.current = false;
          return reload();
        });
    },
    [reload],
  );

  if (state.status !== 'ready' || !state.value) {
    return (
      <div className="screen gym-session">
        <header className="screen__header gym-session__header">
          <button
            type="button"
            className="button button--quiet gym-session__back"
            onClick={onClose}
            aria-label={t('common.back')}
          >
            <ChevronLeftIcon />
          </button>
          <h1 className="screen__title">{t('gym.session')}</h1>
        </header>
        <div className="gym-session__scroll" aria-busy={state.status === 'loading'}>
          {state.status === 'failed' ? (
            <LoadFailure title={t('error.day.title')} onRetry={reload} />
          ) : null}
        </div>
      </div>
    );
  }

  const view: GymSessionView = state.value;
  const editable = view.editable;

  const addExercise = (exercise: ExerciseRecord) => {
    setPicking(false);
    // A picked exercise arrives with one empty set ready to type into, so
    // choosing an exercise and logging its first set is one gesture.
    run(() =>
      addSet({ sessionId, exerciseId: exercise.id, reps: 0, weightGrams: 0 }),
    );
  };

  const createAndAdd = (name: string, muscles: MuscleGroup[]) => {
    setPicking(false);
    run(async () => {
      const exercise = await createExercise({ name, muscles });
      setExercises(await ensureExerciseCatalogue());
      await addSet({ sessionId, exerciseId: exercise.id, reps: 0, weightGrams: 0 });
    });
  };

  return (
    <div className="screen gym-session">
      <header className="screen__header gym-session__header">
        <button
          type="button"
          className="button button--quiet gym-session__back"
          onClick={onClose}
          aria-label={t('common.back')}
        >
          <ChevronLeftIcon />
        </button>
        <div>
          <h1 className="screen__title">{t('gym.session')}</h1>
          <p className="gym-session__date">
            {t('gym.sessionOn', { date: formatDayAndMonth(language, date) })}
          </p>
        </div>
      </header>

      <div className="gym-session__scroll">
        {!editable ? (
          <p className="gym-session__closed" role="status">
            {t('gym.closed')}
          </p>
        ) : null}

        {view.exercises.length === 0 ? (
          <Card>
            <EmptyState
              title={t('gym.emptyTitle')}
              body={t('gym.emptyBody')}
              action={
                <Button variant="secondary" onClick={() => setPicking(true)}>
                  <PlusIcon size={18} />
                  {t('gym.addExercise')}
                </Button>
              }
            />
          </Card>
        ) : (
          view.exercises.map((entry) => {
            const last = entry.sets[entry.sets.length - 1];
            return (
              <Section key={entry.exercise.id}>
                <Card>
                  <div className="gym-exercise__header">
                    <span className="gym-exercise__body">
                      <span className="gym-exercise__name">{entry.exercise.name}</span>
                      <span className="gym-exercise__muscles">
                        {entry.exercise.muscles
                          .map((muscle) => t(MUSCLE_LABEL_KEYS[muscle]))
                          .join(' · ')}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="gym-exercise__remove"
                      aria-label={t('gym.removeExercise', { exercise: entry.exercise.name })}
                      disabled={!editable}
                      onClick={() =>
                        run(() => removeExerciseFromSession(sessionId, entry.exercise.id))
                      }
                    >
                      <MinusIcon size={18} />
                    </button>
                  </div>

                  {entry.sets.map((set, index) => (
                    <SetRow
                      key={set.id}
                      set={set}
                      index={index}
                      exerciseName={entry.exercise.name}
                      editable={editable}
                      onChange={(patch) => run(() => updateSet(set.id, patch))}
                      onRemove={() => run(() => removeSet(set.id))}
                    />
                  ))}

                  {entry.bestScore !== null ? (
                    <p className="gym-exercise__best">
                      {t('gym.bestSet')} ·{' '}
                      {t('gym.bestSetValue', {
                        reps: bestOf(entry.sets).reps,
                        weight: kgText(bestOf(entry.sets).weightGrams),
                      })}
                    </p>
                  ) : (
                    <p className="gym-exercise__best">{t('gym.noSets')}</p>
                  )}

                  <button
                    type="button"
                    className="gym-exercise__add"
                    disabled={!editable}
                    aria-label={t('gym.addSetFor', { exercise: entry.exercise.name })}
                    onClick={() =>
                      run(() =>
                        addSet({
                          sessionId,
                          exerciseId: entry.exercise.id,
                          // The set before it, because the next set is almost
                          // always the same one again.
                          reps: last?.reps ?? 0,
                          weightGrams: last?.weightGrams ?? 0,
                        }),
                      )
                    }
                  >
                    <PlusIcon size={18} />
                    {t('gym.addSet')}
                  </button>
                </Card>
              </Section>
            );
          })
        )}

        {view.exercises.length > 0 ? (
          <Button variant="secondary" block disabled={!editable} onClick={() => setPicking(true)}>
            <PlusIcon size={18} />
            {t('gym.addExercise')}
          </Button>
        ) : null}

        <Button variant="primary" block onClick={onClose}>
          {t('gym.done')}
        </Button>
      </div>

      <ExercisePicker
        open={picking}
        exercises={exercises}
        onClose={() => setPicking(false)}
        onPick={addExercise}
        onCreate={createAndAdd}
      />
    </div>
  );
}

/** The set a screen names when it shows "best set". Never used for scoring. */
function bestOf(sets: GymSetRecord[]): GymSetRecord {
  let best = sets[0]!;
  for (const set of sets) {
    if (set.reps * set.weightGrams > best.reps * best.weightGrams) best = set;
  }
  return best;
}
