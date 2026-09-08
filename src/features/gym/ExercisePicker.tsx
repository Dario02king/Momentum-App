import { useMemo, useState } from 'react';
import { MUSCLE_GROUPS, type ExerciseRecord, type MuscleGroup } from '../../core/model';
import { Button, Sheet } from '../../components';
import { MUSCLE_LABEL_KEYS } from '../../components/BodyRenderer';
import { useT } from '../../i18n/I18nProvider';
import './gym.css';

/**
 * Choosing what to do next.
 *
 * A search box and a flat list, because during a workout the user already
 * knows the name and is holding a phone in one hand. The muscle groups are
 * shown on every row rather than used as a filter: they are what the exercise
 * *counts for*, and seeing them is how a user notices their session is all
 * chest.
 *
 * A custom exercise names its own muscle groups. Nothing is inferred from the
 * name — a wrong guess would quietly send a user's work to the wrong part of
 * the body, and that is the one thing this screen must never do.
 */
export function ExercisePicker({
  open,
  exercises,
  onClose,
  onPick,
  onCreate,
}: {
  open: boolean;
  exercises: ExerciseRecord[];
  onClose(): void;
  onPick(exercise: ExerciseRecord): void;
  onCreate(name: string, muscles: MuscleGroup[]): void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [muscles, setMuscles] = useState<MuscleGroup[]>([]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return exercises;
    return exercises.filter((exercise) => exercise.name.toLowerCase().includes(needle));
  }, [exercises, query]);

  const reset = () => {
    setQuery('');
    setCreating(false);
    setName('');
    setMuscles([]);
  };

  const toggleMuscle = (muscle: MuscleGroup) =>
    setMuscles((current) =>
      current.includes(muscle)
        ? current.filter((entry) => entry !== muscle)
        : [...current, muscle],
    );

  return (
    <Sheet
      open={open}
      title={t('gym.picker.title')}
      onClose={() => {
        reset();
        onClose();
      }}
      footer={
        creating ? (
          <Button
            variant="primary"
            block
            disabled={name.trim().length === 0 || muscles.length === 0}
            onClick={() => {
              onCreate(name.trim(), muscles);
              reset();
            }}
          >
            {t('common.add')}
          </Button>
        ) : (
          <Button variant="secondary" block onClick={() => setCreating(true)}>
            {t('gym.picker.custom')}
          </Button>
        )
      }
    >
      {creating ? (
        <>
          <div>
            <label className="field-label" htmlFor="exercise-name">
              {t('gym.picker.customName')}
            </label>
            <input
              id="exercise-name"
              className="field"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <span className="field-label">{t('gym.picker.customMuscles')}</span>
            <div
              className="gym-picker__muscles"
              role="group"
              aria-label={t('gym.picker.customMuscles')}
            >
              {MUSCLE_GROUPS.map((muscle) => (
                <button
                  key={muscle}
                  type="button"
                  className="gym-picker__muscle"
                  aria-pressed={muscles.includes(muscle)}
                  onClick={() => toggleMuscle(muscle)}
                >
                  {t(MUSCLE_LABEL_KEYS[muscle])}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="field-label" htmlFor="exercise-search">
              {t('gym.picker.search')}
            </label>
            <input
              id="exercise-search"
              className="field"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
              enterKeyHint="search"
            />
          </div>

          <div className="gym-picker__list">
            {matches.length === 0 ? (
              <p className="gym-picker__empty">{t('gym.picker.empty')}</p>
            ) : (
              matches.map((exercise) => (
                <button
                  key={exercise.id}
                  type="button"
                  className="gym-picker__row"
                  onClick={() => {
                    onPick(exercise);
                    reset();
                  }}
                >
                  <span className="gym-picker__name">{exercise.name}</span>
                  <span className="gym-picker__groups">
                    {exercise.muscles.map((muscle) => t(MUSCLE_LABEL_KEYS[muscle])).join(' · ')}
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}
