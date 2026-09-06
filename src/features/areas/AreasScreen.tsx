import { useMemo, useState } from 'react';
import type { Language, QuestionRecord } from '../../core/model';
import { Button, Card, EmptyState, Row, Section, Segmented, Switch } from '../../components';
import {
  ActivityIcon,
  ArchiveIcon,
  ChevronRightIcon,
  PlusIcon,
  SparkIcon,
} from '../../components/Icons';
import { QuestionSheet, type QuestionSheetSubmit } from '../../domains/mental/QuestionSheet';
import {
  questionStatusBadgeKey,
  questionTypeBadgeKey,
} from '../../domains/mental/questionLabels';
import { TargetPicker } from '../../domains/sports/TargetPicker';
import { useI18n, useT } from '../../i18n/I18nProvider';
import { LANGUAGES } from '../../i18n';
import {
  sportsTargetOfDomain,
  type AppConfiguration,
} from '../../storage/services/configurationService';
import './areas.css';

export interface AreasActions {
  enableMental(): void;
  disableMental(): void;
  enableSports(): void;
  disableSports(): void;
  setSportsTarget(target: number): void;
  addQuestion(draft: QuestionSheetSubmit): void;
  updateQuestion(id: string, draft: QuestionSheetSubmit): void;
  pauseQuestion(id: string): void;
  resumeQuestion(id: string): void;
  archiveQuestion(id: string): void;
  setLanguage(language: Language): void;
}

/**
 * The configuration surface for everything the app tracks.
 *
 * It reads as a list of life areas rather than a settings panel: each domain
 * is one card carrying its own switch and its own configuration, so enabling
 * Sports and choosing its target are the same gesture in the same place.
 */
export function AreasScreen({
  configuration,
  actions,
}: {
  configuration: AppConfiguration;
  actions: AreasActions;
}) {
  const t = useT();
  const { language } = useI18n();
  const [editing, setEditing] = useState<QuestionRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  const { mental, sports, questions } = configuration;
  const mentalOn = Boolean(mental?.enabled);
  const sportsOn = Boolean(sports?.enabled);
  const target = sportsTargetOfDomain(sports);

  const { live, archived } = useMemo(
    () => ({
      live: questions.filter((question) => question.status !== 'archived'),
      archived: questions.filter((question) => question.status === 'archived'),
    }),
    [questions],
  );

  return (
    <div className="screen">
      <header className="screen__header">
        <h1 className="screen__title">{t('nav.areas')}</h1>
        <p className="screen__subtitle">{t('areas.subtitle')}</p>
      </header>

      <div className="areas__scroll">
        {/* Mental Wellbeing -------------------------------------------- */}
        <Section>
          <Card>
            <div className="areas__domainHeader">
              <span className="areas__domainMark areas__domainMark--mental" aria-hidden="true">
                <SparkIcon size={22} />
              </span>
              <span className="row__body">
                <span className="areas__domainName">{t('domain.mental')}</span>
                <span className="areas__domainDescription">{t('domain.mental.description')}</span>
              </span>
              <Switch
                checked={mentalOn}
                label={t('domain.mental')}
                accent="var(--domain-mental-mid)"
                onChange={(next) => (next ? actions.enableMental() : actions.disableMental())}
              />
            </div>

            {mentalOn ? (
              <div className="areas__domainBody">
                {live.length === 0 ? (
                  <EmptyState
                    title={t('areas.mental.emptyTitle')}
                    body={t('areas.mental.emptyBody')}
                    action={
                      <Button variant="secondary" onClick={() => setCreating(true)}>
                        <PlusIcon size={18} />
                        {t('areas.mental.add')}
                      </Button>
                    }
                  />
                ) : (
                  <>
                    <div className="areas__subhead">
                      <span>{t('areas.mental.questions')}</span>
                      <span className="areas__subheadCount">{live.length}</span>
                    </div>
                    {live.map((question) => {
                      const statusKey = questionStatusBadgeKey(question.status);
                      return (
                        <Row
                          key={question.id}
                          title={question.text}
                          muted={question.status === 'paused'}
                          onClick={() => setEditing(question)}
                          trailing={
                            <>
                              {statusKey ? (
                                <span className="badge badge--paused">{t(statusKey)}</span>
                              ) : null}
                              <span className={`badge badge--${question.type}`}>
                                {t(questionTypeBadgeKey(question.type))}
                              </span>
                              <ChevronRightIcon size={18} />
                            </>
                          }
                        />
                      );
                    })}
                    <div className="areas__addRow">
                      <Row
                        title={t('areas.mental.add')}
                        onClick={() => setCreating(true)}
                        leading={<PlusIcon size={20} />}
                      />
                    </div>
                  </>
                )}

                {archived.length > 0 ? (
                  <>
                    <button
                      type="button"
                      className="areas__archiveToggle"
                      onClick={() => setShowArchive((value) => !value)}
                      aria-expanded={showArchive}
                    >
                      <ArchiveIcon size={16} />
                      {showArchive
                        ? t('areas.archiveHide')
                        : t('areas.archiveShow', { count: archived.length })}
                    </button>
                    {showArchive
                      ? archived.map((question) => (
                          <Row
                            key={question.id}
                            title={question.text}
                            muted
                            onClick={() => setEditing(question)}
                            trailing={
                              <>
                                <span className={`badge badge--${question.type}`}>
                                  {t(questionTypeBadgeKey(question.type))}
                                </span>
                                <ChevronRightIcon size={18} />
                              </>
                            }
                          />
                        ))
                      : null}
                  </>
                ) : null}
              </div>
            ) : (
              <div className="areas__domainBody">
                <EmptyState title={t('areas.mental.offTitle')} body={t('areas.mental.offBody')} />
              </div>
            )}
          </Card>
        </Section>

        {/* Sports ------------------------------------------------------ */}
        <Section>
          <Card>
            <div className="areas__domainHeader">
              <span className="areas__domainMark areas__domainMark--sports" aria-hidden="true">
                <ActivityIcon size={22} />
              </span>
              <span className="row__body">
                <span className="areas__domainName">{t('domain.sports')}</span>
                <span className="areas__domainDescription">{t('domain.sports.description')}</span>
              </span>
              <Switch
                checked={sportsOn}
                label={t('domain.sports')}
                accent="var(--domain-sports-mid)"
                onChange={(next) => (next ? actions.enableSports() : actions.disableSports())}
              />
            </div>

            <div className="areas__domainBody">
              {sportsOn ? (
                <div className="areas__targetBlock">
                  <div className="areas__targetHeader">
                    <span className="areas__targetLabel">{t('areas.sports.target')}</span>
                    <span className="areas__targetValue">
                      {t('areas.sports.targetValue', { count: target ?? 0 })}
                    </span>
                  </div>
                  <TargetPicker value={target} onChange={actions.setSportsTarget} />
                </div>
              ) : (
                <EmptyState title={t('areas.sports.offTitle')} body={t('areas.sports.offBody')} />
              )}
            </div>
          </Card>
        </Section>

        {/* Settings ---------------------------------------------------- */}
        <Section label={t('common.settings')}>
          <Card padded>
            <span className="field-label">{t('common.language')}</span>
            <Segmented<Language>
              label={t('common.language')}
              value={language}
              onChange={actions.setLanguage}
              options={LANGUAGES.map((option) => ({
                value: option,
                label: option === 'de' ? 'Deutsch' : 'English',
              }))}
            />
          </Card>
        </Section>
      </div>

      <QuestionSheet
        open={creating}
        onClose={() => setCreating(false)}
        onSubmit={(draft) => {
          actions.addQuestion(draft);
          setCreating(false);
        }}
      />

      <QuestionSheet
        open={editing !== null}
        question={editing}
        onClose={() => setEditing(null)}
        onSubmit={(draft) => {
          if (editing) actions.updateQuestion(editing.id, draft);
          setEditing(null);
        }}
        onPause={() => {
          if (editing) actions.pauseQuestion(editing.id);
          setEditing(null);
        }}
        onResume={() => {
          if (editing) actions.resumeQuestion(editing.id);
          setEditing(null);
        }}
        onArchive={() => {
          if (editing) actions.archiveQuestion(editing.id);
          setEditing(null);
        }}
      />
    </div>
  );
}
