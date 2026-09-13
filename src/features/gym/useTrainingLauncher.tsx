import { useCallback, useState, type ReactNode } from 'react';
import type { DateKey } from '../../core/dates';
import type { TrainingPlanRecord } from '../../core/model';
import {
  draftFromPlan,
  existingSessionForDay,
  openSessionForDay,
  type SessionDraft,
} from '../../storage/services/gymService';
import { listTrainingPlans } from '../../storage/services/trainingPlanService';
import { GymSessionScreen } from './GymSessionScreen';
import { PlanChooserSheet } from './PlanChooserSheet';

/**
 * Starting a workout, from wherever the button is.
 *
 * Today's quick-log action and the Gym hub's primary action are the same
 * flow, so it lives once: the day's existing session is continued; failing
 * that, saved plans are offered (with the free session second) or, with no
 * plan saved, the free session opens directly as it always has. Choosing a
 * plan opens a draft and writes nothing; the session is persisted inside
 * the logging screen with the first saved set (WP2-1).
 *
 * The host renders `overlay` — the chooser sheet and, while a workout is
 * open, the logging screen — and is told when the screen closes so it can
 * reload whatever it shows.
 */
export function useTrainingLauncher({
  date,
  onClosed,
  onManagePlans,
}: {
  date: DateKey;
  onClosed(): void;
  onManagePlans(): void;
}): {
  /** Opens a session: the given one, the day's existing one, or the chooser. */
  start(sessionId?: string): void;
  overlay: ReactNode;
  /** True while the logging screen is on top of the host. */
  open: boolean;
} {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ draft: SessionDraft; planName: string } | null>(null);
  const [plans, setPlans] = useState<TrainingPlanRecord[] | null>(null);

  /** A free session, created on opening — exactly as before WP2-1. */
  const openFree = useCallback(() => {
    setPlans(null);
    void openSessionForDay(date)
      .then((session) => setSessionId(session.id))
      .catch(() => onClosed());
  }, [date, onClosed]);

  const start = useCallback(
    (id?: string) => {
      if (id) {
        setSessionId(id);
        return;
      }
      void existingSessionForDay(date)
        .then(async (existing) => {
          // One session per calendar day: continued, whichever way it began.
          if (existing) {
            setSessionId(existing.id);
            return;
          }
          const saved = await listTrainingPlans();
          if (saved.length === 0) openFree();
          else setPlans(saved);
        })
        .catch(() => openFree());
    },
    [date, openFree],
  );

  const close = () => {
    setSessionId(null);
    setDraft(null);
    onClosed();
  };

  const open = sessionId !== null || draft !== null;

  const overlay = (
    <>
      {open ? (
        <GymSessionScreen
          sessionId={sessionId}
          draft={draft?.draft ?? null}
          planName={draft?.planName ?? null}
          date={date}
          onClose={close}
        />
      ) : null}
      <PlanChooserSheet
        open={plans !== null}
        plans={plans ?? []}
        onClose={() => setPlans(null)}
        onChoosePlan={(plan) => {
          setPlans(null);
          setDraft({ draft: draftFromPlan(plan), planName: plan.name });
        }}
        onFreeSession={openFree}
        onManagePlans={() => {
          setPlans(null);
          onManagePlans();
        }}
      />
    </>
  );

  return { start, overlay, open };
}
