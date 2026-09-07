import { useState } from 'react';
import { today as currentDay } from '../../core/clock';
import type { SportsSessionRecord } from '../../core/model';
import { Button, Card, EmptyState, Row, Section } from '../../components';
import { ChevronRightIcon, PlusIcon, SparkIcon } from '../../components/Icons';
import { SessionSheet } from '../../domains/sports/SessionSheet';
import { formatDayAndMonth, formatTime, formatWeekday } from '../../i18n/format';
import { useI18n, useT } from '../../i18n/I18nProvider';
import { CheckInItem } from './CheckInItem';
import { useDay } from './useDay';
import './today.css';

/**
 * The primary interaction point: what is due today, grouped by domain, and
 * nothing else. Answers save on tap — no confirm buttons — and there are no
 * charts here, because this screen is for acting, not for analysis.
 */
export function TodayScreen({ onGoToAreas }: { onGoToAreas(): void }) {
  const t = useT();
  const { language } = useI18n();
  const date = currentDay();
  const { state, answer, logSession, updateSession, deleteSession, refresh } = useDay(date);
  const [editingSession, setEditingSession] = useState<SportsSessionRecord | null>(null);

  if (state.status === 'error') {
    return (
      <div className="screen">
        <header className="screen__header">
          <h1 className="screen__title">{t('nav.today')}</h1>
        </header>
        <div className="today__scroll">
          <Card>
            {/* No icon: the set has no failure mark, and a sparkle on an
                error reads as celebration. */}
            <EmptyState
              title={t('error.day.title')}
              body={t('error.day.body')}
              action={
                <Button variant="secondary" onClick={() => void refresh()}>
                  {t('error.storage.retry')}
                </Button>
              }
            />
          </Card>
        </div>
      </div>
    );
  }

  if (state.status !== 'ready') {
    return <div className="screen" aria-busy="true" />;
  }

  const { day } = state;
  const mental = day.mental;
  const sports = day.sports;

  return (
    <div className="screen">
      <header className="screen__header">
        <h1 className="screen__title">{t('nav.today')}</h1>
        <p className="today__date">
          {t('today.date', {
            weekday: formatWeekday(language, date),
            date: formatDayAndMonth(language, date),
          })}
        </p>
        {mental && mental.items.length > 0 ? (
          <p className={`today__progress ${mental.complete ? 'today__progress--complete' : ''}`.trim()}>
            <span className="today__progressDot" aria-hidden="true" />
            {mental.complete
              ? t('today.allDone')
              : t('today.progress', { done: mental.answeredCount, total: mental.items.length })}
          </p>
        ) : null}
      </header>

      <div className="today__scroll">
        {day.empty ? (
          <Card>
            <EmptyState
              icon={<SparkIcon size={26} />}
              title={t('today.emptyTitle')}
              body={t('today.emptyBody')}
              action={
                <Button variant="secondary" onClick={onGoToAreas}>
                  {t('today.emptyAction')}
                </Button>
              }
            />
          </Card>
        ) : null}

        {mental ? (
          <Section label={t('domain.mental')}>
            <Card>
              {mental.items.length === 0 ? (
                <EmptyState
                  title={t('today.noQuestionsTitle')}
                  body={t('today.noQuestionsBody')}
                  action={
                    <Button variant="secondary" onClick={onGoToAreas}>
                      {t('today.emptyAction')}
                    </Button>
                  }
                />
              ) : (
                mental.items.map((item) => (
                  <CheckInItem
                    key={item.question.id}
                    item={item}
                    editable={day.editable}
                    onAnswer={(next) => answer(item.question.id, next)}
                  />
                ))
              )}
            </Card>
          </Section>
        ) : null}

        {sports ? (
          <Section label={t('domain.sports')}>
            <Card>
              <div className="week__header">
                <span className="week__label">{t('sports.thisWeek')}</span>
                <span className="week__value">
                  {t('sports.progress', {
                    done: sports.progress.completed,
                    target: sports.progress.target,
                  })}
                </span>
              </div>

              <div
                className="week__segments"
                role="img"
                aria-label={t('sports.progress', {
                  done: sports.progress.completed,
                  target: sports.progress.target,
                })}
              >
                {Array.from({ length: sports.progress.target }, (_, index) => (
                  <span
                    key={index}
                    className={`week__segment ${
                      index < sports.progress.completed ? 'week__segment--filled' : ''
                    }`.trim()}
                  />
                ))}
              </div>

              <p className={`week__status ${sports.progress.met ? 'week__status--met' : ''}`.trim()}>
                {sports.progress.exceeded
                  ? t('sports.exceeded')
                  : sports.progress.met
                    ? t('sports.met')
                    : t('sports.remaining', { count: sports.progress.remaining })}
              </p>

              {sports.sessions.map((session) => (
                <Row
                  key={session.id}
                  title={session.activityType ?? t('sports.session')}
                  subtitle={
                    <span className="session-row__time">
                      {/* Several sessions can share a day, so today's are told
                          apart by time and earlier ones by weekday. */}
                      {session.date === date
                        ? formatTime(language, session.performedAt)
                        : formatWeekday(language, session.date)}
                      {session.durationMinutes ? ` · ${session.durationMinutes} min` : ''}
                      {session.note ? ` · ${session.note}` : ''}
                    </span>
                  }
                  onClick={() => setEditingSession(session)}
                  trailing={<ChevronRightIcon size={18} />}
                />
              ))}

              <button type="button" className="week__log" onClick={logSession}>
                <PlusIcon size={19} />
                {t('sports.log')}
              </button>
            </Card>
          </Section>
        ) : null}
      </div>

      <SessionSheet
        open={editingSession !== null}
        session={editingSession}
        onClose={() => setEditingSession(null)}
        onSave={(input) => {
          if (editingSession) updateSession(editingSession.id, input);
          setEditingSession(null);
        }}
        onDelete={() => {
          if (editingSession) deleteSession(editingSession.id);
          setEditingSession(null);
        }}
      />
    </div>
  );
}
