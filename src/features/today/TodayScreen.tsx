import { useState } from 'react';
import { today as currentDay } from '../../core/clock';
import type { StoredDomainType } from '../../core/model';
import { Button, Card, EmptyState, LoadFailure, Row, Section, StaleNotice } from '../../components';
import { ChevronRightIcon, PlusIcon, SparkIcon } from '../../components/Icons';
import { SessionSheet } from '../../domains/sports/SessionSheet';
import { formatDayAndMonth, formatTime, formatWeekday } from '../../i18n/format';
import { useI18n, useT } from '../../i18n/I18nProvider';
import type { TrainingSession } from '../../storage/services/checkInService';
import type { TranslationKey } from '../../i18n';
import { CheckInItem } from './CheckInItem';
import { useDay } from './useDay';
import './today.css';

/** Titles and log labels per training domain, including the retired one. */
const TRAINING_COPY: Record<StoredDomainType, { title: TranslationKey; log: TranslationKey }> = {
  mental: { title: 'domain.wellbeing', log: 'sports.log' },
  food: { title: 'domain.food', log: 'sports.log' },
  gym: { title: 'today.gym.title', log: 'today.gym.log' },
  running: { title: 'today.running.title', log: 'today.running.log' },
  sports: { title: 'domain.legacySport', log: 'sports.log' },
};

/**
 * The primary interaction point: what is due today, grouped by domain, and
 * nothing else. Answers save on tap — no confirm buttons — and there are no
 * charts here, because this screen is for acting, not for analysis.
 *
 * Training is a list rather than one card: Gym and Running are separate
 * quotas, so a week that met one and missed the other has to read that way.
 */
export function TodayScreen({ onGoToAreas }: { onGoToAreas(): void }) {
  const t = useT();
  const { language } = useI18n();
  const date = currentDay();
  const { state, answer, logSession, updateSession, deleteSession, reload } = useDay(date);
  const [editingSession, setEditingSession] = useState<TrainingSession | null>(null);

  // Three states, never collapsed into one: still loading, failed outright,
  // or loaded. What is *empty* is decided further down, from the day itself.
  if (state.status !== 'ready') {
    return (
      <div className="screen">
        <header className="screen__header">
          <h1 className="screen__title">{t('nav.today')}</h1>
        </header>
        <div className="today__scroll" aria-busy={state.status === 'loading'}>
          {state.status === 'failed' ? (
            <LoadFailure title={t('error.day.title')} onRetry={reload} />
          ) : null}
        </div>
      </div>
    );
  }

  const day = state.value;
  const mental = day.mental;

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
        {state.refreshFailed ? <StaleNotice onRetry={reload} /> : null}

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

        {day.training.map((training) => {
          const copy = TRAINING_COPY[training.domain];
          return (
            <Section key={training.domain} label={t(copy.title)}>
              <Card>
                <div className="week__header">
                  <span className="week__label">{t('sports.thisWeek')}</span>
                  <span className="week__value">
                    {t('sports.progress', {
                      done: training.progress.completed,
                      target: training.progress.target,
                    })}
                  </span>
                </div>

                <div
                  className="week__segments"
                  role="img"
                  aria-label={t('sports.progress', {
                    done: training.progress.completed,
                    target: training.progress.target,
                  })}
                >
                  {Array.from({ length: training.progress.target }, (_, index) => (
                    <span
                      key={index}
                      className={`week__segment ${
                        index < training.progress.completed ? 'week__segment--filled' : ''
                      }`.trim()}
                    />
                  ))}
                </div>

                <p
                  className={`week__status ${training.progress.met ? 'week__status--met' : ''}`.trim()}
                >
                  {training.progress.exceeded
                    ? t('sports.exceeded')
                    : training.progress.met
                      ? t('sports.met')
                      : t('sports.remaining', { count: training.progress.remaining })}
                </p>

                {training.sessions.map((session) => (
                  <Row
                    key={session.id}
                    title={t(copy.title)}
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

                {/*
                  The retired Sport log is read-only. Those sessions still
                  count for every week they were logged in, and nothing new
                  is ever added to it.
                */}
                {training.domain === 'sports' ? null : (
                  <button
                    type="button"
                    className="week__log"
                    onClick={() => logSession(training.domain)}
                  >
                    <PlusIcon size={19} />
                    {t(copy.log)}
                  </button>
                )}
              </Card>
            </Section>
          );
        })}
      </div>

      <SessionSheet
        open={editingSession !== null}
        session={editingSession}
        onClose={() => setEditingSession(null)}
        onSave={(input) => {
          if (editingSession) updateSession(editingSession.domain, editingSession.id, input);
          setEditingSession(null);
        }}
        onDelete={() => {
          if (editingSession) deleteSession(editingSession.domain, editingSession.id);
          setEditingSession(null);
        }}
      />
    </div>
  );
}
