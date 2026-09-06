import { useEffect, useState } from 'react';
import type { SportsSessionRecord } from '../../core/model';
import { Button, Sheet } from '../../components';
import { useT } from '../../i18n/I18nProvider';
import type { SessionInput } from '../../storage/services/checkInService';

/**
 * Detail for a logged session.
 *
 * Logging happens in one tap on the Today screen; everything in here is
 * optional and added afterwards, so a session never waits on a form.
 */
export function SessionSheet({
  open,
  session,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  session: SportsSessionRecord | null;
  onClose(): void;
  onSave(input: SessionInput): void;
  onDelete(): void;
}) {
  const t = useT();
  const [activityType, setActivityType] = useState('');
  const [note, setNote] = useState('');
  const [duration, setDuration] = useState('');

  useEffect(() => {
    if (!open) return;
    setActivityType(session?.activityType ?? '');
    setNote(session?.note ?? '');
    setDuration(session?.durationMinutes ? String(session.durationMinutes) : '');
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
                activityType: activityType.trim() || null,
                note: note.trim() || null,
                durationMinutes: Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : null,
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
      <div>
        <label className="field-label" htmlFor="session-type">
          {t('sports.type')}
        </label>
        <input
          id="session-type"
          className="field"
          value={activityType}
          placeholder={t('sports.typePlaceholder')}
          onChange={(event) => setActivityType(event.target.value)}
          autoComplete="off"
        />
      </div>

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
