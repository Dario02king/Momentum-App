import { useMemo, useState } from 'react';
import { MetricBoard } from '../../../components/metrics';
import { useT } from '../../../i18n/I18nProvider';
import type { HeatmapRow } from '../Heatmap';
import { QuestionDetail } from '../QuestionDetail';
import type { HistoryWindow } from '../useHistoryWindow';
import { DailyHistory } from './DailyHistory';
import { DomainStandingTile } from './DomainStandingTile';

/**
 * Wellbeing's terminal.
 *
 * The daily questions stay on Today; this is where their record is looked
 * at. Stage A composes what already existed for the domain — its standing,
 * the daily grid with one row per question, and the per-question drill-down
 * — and nothing else. Category-level development and the domain's own trend
 * are Stage D, and only if the replay already carries them.
 */
export function MentalTerminal({
  window,
  onGoToToday,
}: {
  window: HistoryWindow;
  onGoToToday?: () => void;
}) {
  const t = useT();
  const [openQuestionId, setOpenQuestionId] = useState<string | null>(null);

  const rows: HeatmapRow[] = useMemo(() => {
    const { history, start } = window;
    const mental = history.mental.slice(start);
    if (!mental.some((value) => value !== null) && history.questions.length === 0) return [];
    return [
      {
        key: 'mental',
        label: t('domain.wellbeing'),
        values: mental,
        children: history.questions.map((question) => ({
          key: question.id,
          label: question.text,
          values: question.scores.slice(start),
          // Tapping a question opens that question, not Today. Today is
          // where you act; this is where you look.
          onOpen: () => setOpenQuestionId(question.id),
        })),
      },
    ];
  }, [window, t]);

  const openQuestion = useMemo(() => {
    if (openQuestionId === null) return null;
    const row = window.history.questions.find((question) => question.id === openQuestionId);
    if (!row) return null;
    return { ...row, scores: row.scores.slice(window.start) };
  }, [window, openQuestionId]);

  if (openQuestion) {
    return (
      <QuestionDetail
        question={openQuestion}
        days={window.days.map((day) => day.date)}
        onClose={() => setOpenQuestionId(null)}
        // Offered only while the question is actually being asked; sending
        // someone to a check-in for a question nobody is asking is a dead end.
        onAnswerToday={
          openQuestion.status === 'active' && onGoToToday
            ? () => {
                setOpenQuestionId(null);
                onGoToToday();
              }
            : undefined
        }
      />
    );
  }

  return (
    <>
      <MetricBoard>
        <DomainStandingTile domain="mental" id="mental-standing" />
      </MetricBoard>
      <DailyHistory rows={rows} days={window.days.map((day) => day.date)} />
    </>
  );
}
