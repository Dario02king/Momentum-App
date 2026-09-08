import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDayAndMonth } from '../../i18n/format';
import type { DateKey } from '../../core/dates';
import type { ExerciseLoadType, ExerciseRecord, GymSetRecord } from '../../core/model';
import { Button, Card, EmptyState, LoadFailure, Section } from '../../components';
import { ChevronLeftIcon, MinusIcon, PlusIcon } from '../../components/Icons';
import { MUSCLE_LABEL_KEYS } from '../../components/BodyRenderer';
import { useI18n, useT } from '../../i18n/I18nProvider';
import { useLoadable } from '../../app/useLoadable';
import {
  addSet,
  bodyweightFor,
  createExercise,
  ensureExerciseCatalogue,
  loadSession,
  recordBodyweight,
  removeExerciseFromSession,
  removeSet,
  updateSet,
  type GymSessionView,
  type NewExerciseInput,
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

/**
 * What the weight box on a set actually means, which is not always "weight".
 *
 * A pull-up logged as 0 kg is not a lift of nothing and an assisted pull-up
 * logged as 25 kg is not a 25 kg lift, so the field says which number it is
 * asking for rather than leaving the user to infer it from the exercise.
 */
const LOAD_LABEL_KEYS = {
  external: 'gym.load.external',
  bodyweight: 'gym.load.bodyweight',
  assisted: 'gym.load.assisted',
} as const satisfies Record<ExerciseLoadType, string>;

const LOAD_HINT_KEYS = {
  external: 'gym.load.externalHint',
  bodyweight: 'gym.load.bodyweightHint',
  assisted: 'gym.load.assistedHint',
} as const satisfies Record<ExerciseLoadType, string>;

function SetRow({
  set,
  index,
  exerciseName,
  loadType,
  editable,
  onChange,
  onRemove,
}: {
  set: GymSetRecord;
  index: number;
  exerciseName: string;
  loadType: ExerciseLoadType;
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
          {`${t(LOAD_LABEL_KEYS[loadType])} — ${t('gym.weightFor', {
            exercise: exerciseName,
            number: index + 1,
          })}`}
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

/**
 * Recording what the user weighs, where they need it.
 *
 * It sits in the session rather than in a profile screen because that is
 * where it is missed: a pull-up cannot be scored without it, and being told
 * so on the screen that will not score it is more use than a setting
 * somewhere else. Entering it is optional and nothing nags — the card only
 * insists when a bodyweight exercise is actually in the session.
 */
function BodyweightCard({
  date,
  current,
  editable,
  needed,
  onSave,
}: {
  date: DateKey;
  current: number | null;
  editable: boolean;
  needed: boolean;
  onSave(kg: number): void;
}) {
  const t = useT();
  const { language } = useI18n();
  const [value, setValue] = useState(current === null ? '' : String(current));

  useEffect(() => {
    setValue(current === null ? '' : String(current));
  }, [current]);

  const parsed = Number.parseFloat(value.replace(',', '.'));
  const valid = Number.isFinite(parsed) && parsed > 0;

  return (
    <Section label={t('gym.bodyweight.title')}>
      <Card>
        <label className="gym-bodyweight">
          <span className="visually-hidden">{t('gym.bodyweight.label')}</span>
          <input
            className="field gym-bodyweight__input"
            value={value}
            inputMode="decimal"
            disabled={!editable}
            onChange={(event) => setValue(event.target.value.replace(/[^0-9.,]/g, ''))}
          />
          <span className="gym-set__unit" aria-hidden="true">
            {t('gym.weightUnit')}
          </span>
          <Button
            variant="secondary"
            disabled={!editable || !valid}
            onClick={() => valid && onSave(parsed)}
          >
            {t('gym.bodyweight.save')}
          </Button>
        </label>
        <p className="gym-exercise__best">
          {current === null
            ? t('gym.bodyweight.none')
            : t('gym.bodyweight.asOf', { date: formatDayAndMonth(language, date) })}
        </p>
        {needed && current === null ? (
          <p className="gym-session__closed" role="status">
            {t('gym.bodyweight.needed')}
          </p>
        ) : null}
      </Card>
    </Section>
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
  const [bodyweight, setBodyweight] = useState<number | null>(null);
  const busy = useRef(false);

  const load = useCallback(async () => {
    const [view] = await Promise.all([loadSession(sessionId)]);
    return view;
  }, [sessionId]);
  const { state, reload } = useLoadable(load);

  useEffect(() => {
    void ensureExerciseCatalogue().then(setExercises);
  }, []);

  // The weight in force on the session's own day, not today's: a session
  // opened inside the edit window still reads the body that performed it.
  useEffect(() => {
    void bodyweightFor(date).then(setBodyweight);
  }, [date]);

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
  /* Only asked for when a set in this session actually depends on it. */
  const needsBodyweight = view.exercises.some(
    (entry) => entry.exercise.loadType === 'bodyweight' || entry.exercise.loadType === 'assisted',
  );

  const addExercise = (exercise: ExerciseRecord) => {
    setPicking(false);
    // A picked exercise arrives with one empty set ready to type into, so
    // choosing an exercise and logging its first set is one gesture.
    run(() =>
      addSet({ sessionId, exerciseId: exercise.id, reps: 0, weightGrams: 0 }),
    );
  };

  const createAndAdd = (input: NewExerciseInput) => {
    setPicking(false);
    run(async () => {
      const exercise = await createExercise(input);
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

        {needsBodyweight ? (
          <BodyweightCard
            date={date}
            current={bodyweight}
            editable={editable}
            needed
            onSave={(kg) =>
              run(async () => {
                await recordBodyweight(kg, date);
                setBodyweight(kg);
              })
            }
          />
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
                      {entry.exercise.loadType && entry.exercise.loadType !== 'external' ? (
                        <span className="gym-exercise__muscles">
                          {t(LOAD_HINT_KEYS[entry.exercise.loadType])}
                        </span>
                      ) : null}
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
                      loadType={entry.exercise.loadType ?? 'external'}
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
