import { useEffect, useState } from 'react';
import type { QuestionRecord, QuestionType } from '../../core/model';
import { Button, Segmented, Sheet } from '../../components';
import { ArchiveIcon, PauseIcon, PlayIcon } from '../../components/Icons';
import { useT } from '../../i18n/I18nProvider';
import './questionSheet.css';

export interface QuestionSheetSubmit {
  text: string;
  type: QuestionType;
}

/**
 * Create and edit a Mental Wellbeing question.
 *
 * There is no rhythm control and there never will be: an active question is
 * asked once a day, every day. The only lifecycle choices are pause, resume
 * and archive — and archiving is spelled out as keeping history, because
 * users assume a bin icon means deletion.
 */
export function QuestionSheet({
  open,
  question,
  onClose,
  onSubmit,
  onPause,
  onResume,
  onArchive,
}: {
  open: boolean;
  /** Absent when creating. */
  question?: QuestionRecord | null;
  onClose(): void;
  onSubmit(draft: QuestionSheetSubmit): void;
  onPause?(): void;
  onResume?(): void;
  onArchive?(): void;
}) {
  const t = useT();
  const [text, setText] = useState('');
  const [type, setType] = useState<QuestionType>('boolean');
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  useEffect(() => {
    if (!open) return;
    setText(question?.text ?? '');
    setType(question?.type ?? 'boolean');
    setConfirmingArchive(false);
  }, [open, question]);

  const trimmed = text.trim();
  const isEdit = Boolean(question);

  return (
    <Sheet
      open={open}
      title={isEdit ? t('question.edit') : t('question.new')}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          block
          disabled={trimmed.length === 0}
          onClick={() => onSubmit({ text: trimmed, type })}
        >
          {isEdit ? t('common.save') : t('common.add')}
        </Button>
      }
    >
      <div>
        <label className="field-label" htmlFor="question-text">
          {t('question.textLabel')}
        </label>
        <input
          id="question-text"
          className="field"
          value={text}
          placeholder={t('question.textPlaceholder')}
          onChange={(event) => setText(event.target.value)}
          autoComplete="off"
          enterKeyHint="done"
        />
        <p className="question-sheet__hint">{t('question.textHint')}</p>
      </div>

      <div>
        <span className="field-label">{t('question.typeLabel')}</span>
        <Segmented<QuestionType>
          label={t('question.typeLabel')}
          value={type}
          onChange={setType}
          options={[
            { value: 'boolean', label: t('question.typeBoolean') },
            { value: 'scale', label: t('question.typeScale') },
          ]}
        />
        <p className="question-sheet__hint">
          {type === 'scale' ? t('question.typeScaleHint') : t('question.typeBooleanHint')}
        </p>
      </div>

      {isEdit && question ? (
        <div className="question-sheet__actions">
          {question.status === 'paused' ? (
            <button type="button" className="question-sheet__action" onClick={onResume}>
              <PlayIcon size={18} />
              {t('question.resume')}
            </button>
          ) : (
            <button type="button" className="question-sheet__action" onClick={onPause}>
              <PauseIcon size={18} />
              {t('question.pause')}
            </button>
          )}

          {confirmingArchive ? (
            <div className="question-sheet__confirm">
              <p className="question-sheet__confirmTitle">{t('question.archiveConfirm')}</p>
              <p className="question-sheet__hint">{t('question.archiveExplain')}</p>
              <div className="question-sheet__confirmActions">
                <Button variant="quiet" onClick={() => setConfirmingArchive(false)}>
                  {t('common.cancel')}
                </Button>
                <Button variant="destructive" onClick={onArchive}>
                  {t('question.archive')}
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="question-sheet__action question-sheet__action--destructive"
              onClick={() => setConfirmingArchive(true)}
            >
              <ArchiveIcon size={18} />
              {t('question.archive')}
            </button>
          )}
        </div>
      ) : null}
    </Sheet>
  );
}
