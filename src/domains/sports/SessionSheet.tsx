import { useEffect, useState } from 'react';
import { today } from '../../core/clock';
import { daysOfWeek, type DateKey } from '../../core/dates';

import { Button, Sheet } from '../../components';
import { formatWeekdayShort } from '../../i18n/format';
import { useI18n, useT } from '../../i18n/I18nProvider';
import type { SessionInput, TrainingSession } from '../../storage/services/checkInService';
import './sessionSheet.css';

/**
 * Detail for a logged training session, whichever log it belongs to.
 *
 * Logging happens in one tap on the Today screen; everything in here is
 * optional and added afterwards, so a session never waits on a form.
 *
 * The fields follow the domain rather than the other way round. A run has a
 * duration; a gym session's substance is its sets, which belong on the gym
 * screen and not in a sheet reached from Today. Showing an empty duration
 * box for a gym session would be asking for a number nothing reads.
 */
export function SessionSheet({
  open,
  session,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  session: TrainingSession | null;
  onClose(): void;
  onSave(input: SessionInput): void;
  onDelete(): void;
}) {
  const t = useT();
  const { language } = useI18n();
  const [note, setNote] = useState('');
  const [duration, setDuration] = useState('');
  const [date, setDate] = useState<DateKey>(today());

  useEffect(() => {
    if (!open) return;
    setNote(session?.note ?? '');
    setDuration(session?.durationMinutes ? String(session.durationMinutes) : '');
    setDate(session?.date ?? today());
  }, [open, session]);

  const parsedDuration = Number.parseInt(duration, 10);

  return (
    <Sheet
      open={open}
      title={t('sports.session')}
      onClose={onClose}
      footer={
        <>
          <Button
            variant="primary"
            block
            onClick={() =>
              onSave({
                date,
                note: note.trim() || null,
                durationMinutes:
                  Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : null,
              })
            }
          >
            {t('common.save')}
          </Button>
          <Button variant="quiet" block onClick={onDelete}>
            {t('sports.delete')}
          </Button>
        </>
      }
    >
      {/*
        A session can be moved to the day it actually happened, within its own
        week. Without this, forgetting to log Monday's run until Wednesday
        left no way to record it truthfully.
      */}
      <div>
        <span className="field-label">{t('sports.day')}</span>
        <div className="session-days" role="radiogroup" aria-label={t('sports.day')}>
          {daysOfWeek(session?.date ?? today()).map((option) => {
            const future = option > today();
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={option === date}
                className="session-days__day"
                disabled={future}
                onClick={() => setDate(option)}
              >
                {formatWeekdayShort(language, option)}
              </button>
            );
          })}
        </div>
      </div>

      {session?.domain === 'gym' ? null : (
        <div>
          <label className="field-label" htmlFor="session-duration">
            {t('sports.duration')}
          </label>
          <input
            id="session-duration"
            className="field"
            value={duration}
            inputMode="numeric"
            placeholder={t('sports.durationUnit')}
            onChange={(event) => setDuration(event.target.value.replace(/[^0-9]/g, ''))}
          />
        </div>
      )}

      <div>
        <label className="field-label" htmlFor="session-note">
          {t('sports.note')}
        </label>
        <input
          id="session-note"
          className="field"
          value={note}
          placeholder={t('sports.notePlaceholder')}
          onChange={(event) => setNote(event.target.value)}
          autoComplete="off"
        />
      </div>
    </Sheet>
  );
}
