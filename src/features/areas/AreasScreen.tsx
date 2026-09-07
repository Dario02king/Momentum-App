import { useMemo, useState } from 'react';
import { DOMAIN_TYPES } from '../../core/domains';
import type {
  DomainRecord,
  DomainType,
  Language,
  QuestionCategory,
  QuestionRecord,
} from '../../core/model';
import { QUESTION_CATEGORIES } from '../../core/model';
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
import { CATEGORY_LABEL_KEYS } from '../../domains/mental/questionLibrary';
import { TargetPicker } from '../../domains/sports/TargetPicker';
import { BackupSection } from '../backup/BackupSection';
import { useI18n, useT } from '../../i18n/I18nProvider';
import { LANGUAGES, type TranslationKey } from '../../i18n';
import {
  weeklyTargetOfDomain,
  type AppConfiguration,
} from '../../storage/services/configurationService';
import './areas.css';

export interface AreasActions {
  /** Reloads everything after a restore replaced the profile. */
  reload(): void;
  enableDomain(type: DomainType): void;
  disableDomain(type: DomainType): void;
  setWeeklyTarget(type: DomainType, target: number): void;
  /** Only ever switches the retired domain off — never on. */
  disableLegacySport(): void;
  addQuestion(draft: QuestionSheetSubmit): void;
  updateQuestion(id: string, draft: QuestionSheetSubmit): void;
  pauseQuestion(id: string): void;
  resumeQuestion(id: string): void;
  archiveQuestion(id: string): void;
  setLanguage(language: Language): void;
}

const DOMAIN_COPY: Record<DomainType, { name: TranslationKey; description: TranslationKey; off: TranslationKey }> = {
  mental: {
    name: 'domain.wellbeing',
    description: 'domain.wellbeing.description',
    off: 'areas.wellbeing.offTitle',
  },
  gym: { name: 'domain.gym', description: 'domain.gym.description', off: 'areas.gym.offTitle' },
  running: {
    name: 'domain.running',
    description: 'domain.running.description',
    off: 'areas.running.offTitle',
  },
  food: { name: 'domain.food', description: 'domain.food.description', off: 'areas.food.offTitle' },
};

const TARGET_VALUE_KEYS: Partial<Record<DomainType, TranslationKey>> = {
  gym: 'areas.gym.targetValue',
  running: 'areas.running.targetValue',
};

/**
 * The configuration surface for everything the app tracks.
 *
 * It reads as a list of life areas rather than a settings panel: each domain
 * is one card carrying its own switch and its own configuration, so enabling
 * Gym and choosing its target are the same gesture in the same place.
 *
 * RC2's generic Sport appears here only when a migrated device still carries
 * it, and only with a switch that turns it **off**. There is no path in this
 * screen — or anywhere else in the product — that turns it back on.
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

  const { domains, legacySport, questions } = configuration;

  const { live, archived } = useMemo(
    () => ({
      live: questions.filter((question) => question.status !== 'archived'),
      archived: questions.filter((question) => question.status === 'archived'),
    }),
    [questions],
  );

  /**
   * Questions grouped the way the score groups them.
   *
   * A user looking at six questions under Alltag and one under Mental can
   * see, without being told, why the day reads the way it does. A flat list
   * hides exactly that.
   */
  const byCategory = useMemo(() => {
    const groups = new Map<QuestionCategory, QuestionRecord[]>();
    for (const question of live) {
      const list = groups.get(question.category) ?? [];
      list.push(question);
      groups.set(question.category, list);
    }
    return QUESTION_CATEGORIES.filter((category) => (groups.get(category)?.length ?? 0) > 0).map(
      (category) => ({ category, questions: groups.get(category)! }),
    );
  }, [live]);

  const questionRow = (question: QuestionRecord) => {
    const statusKey = questionStatusBadgeKey(question.status);
    return (
      <Row
        key={question.id}
        title={question.text}
        muted={question.status === 'paused'}
        onClick={() => setEditing(question)}
        trailing={
          <>
            {statusKey ? <span className="badge badge--paused">{t(statusKey)}</span> : null}
            <span className={`badge badge--${question.type}`}>
              {t(questionTypeBadgeKey(question.type))}
            </span>
            <ChevronRightIcon size={18} />
          </>
        }
      />
    );
  };

  const domainCard = (type: DomainType, domain: DomainRecord | null) => {
    const on = Boolean(domain?.enabled);
    const copy = DOMAIN_COPY[type];
    const target = weeklyTargetOfDomain(domain);
    const targetKey = TARGET_VALUE_KEYS[type];

    return (
      <Section key={type}>
        <Card>
          <div className="areas__domainHeader">
            <span className={`areas__domainMark areas__domainMark--${type}`} aria-hidden="true">
              {type === 'mental' || type === 'food' ? (
                <SparkIcon size={22} />
              ) : (
                <ActivityIcon size={22} />
              )}
            </span>
            <span className="row__body">
              <span className="areas__domainName">{t(copy.name)}</span>
              <span className="areas__domainDescription">{t(copy.description)}</span>
            </span>
            <Switch
              checked={on}
              label={t(copy.name)}
              accent={`var(--domain-${type}-mid)`}
              onChange={(next) =>
                next ? actions.enableDomain(type) : actions.disableDomain(type)
              }
            />
          </div>

          <div className="areas__domainBody">
            {!on ? (
              <EmptyState
                title={t(copy.off)}
                body={type === 'mental' ? t('areas.mental.offBody') : t('areas.training.offBody')}
              />
            ) : type === 'mental' ? (
              live.length === 0 ? (
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
                  {byCategory.map((group) => (
                    <div key={group.category}>
                      <div className="areas__subhead">
                        <span>{t(CATEGORY_LABEL_KEYS[group.category])}</span>
                        <span className="areas__subheadCount">
                          {group.questions.length === 1
                            ? t('areas.category.countOne')
                            : t('areas.category.count', { count: group.questions.length })}
                        </span>
                      </div>
                      {group.questions.map(questionRow)}
                    </div>
                  ))}
                  <div className="areas__addRow">
                    <Row
                      title={t('areas.mental.add')}
                      onClick={() => setCreating(true)}
                      leading={<PlusIcon size={20} />}
                    />
                  </div>
                </>
              )
            ) : targetKey ? (
              <div className="areas__targetBlock">
                <div className="areas__targetHeader">
                  <span className="areas__targetLabel">{t('areas.training.target')}</span>
                  <span className="areas__targetValue">{t(targetKey, { count: target ?? 0 })}</span>
                </div>
                <TargetPicker
                  domain={type === 'gym' ? 'gym' : 'running'}
                  value={target}
                  onChange={(next) => actions.setWeeklyTarget(type, next)}
                />
              </div>
            ) : (
              // Food is switched on but has no setup here: the profile and
              // the targets are asked for when the area is first opened.
              <p className="areas__note">{t('areas.food.on')}</p>
            )}

            {type === 'mental' && on && archived.length > 0 ? (
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
                {showArchive ? archived.map(questionRow) : null}
              </>
            ) : null}
          </div>
        </Card>
      </Section>
    );
  };

  return (
    <div className="screen">
      <header className="screen__header">
        <h1 className="screen__title">{t('nav.areas')}</h1>
        <p className="screen__subtitle">{t('areas.subtitle')}</p>
      </header>

      <div className="areas__scroll">
        {DOMAIN_TYPES.map((type) => domainCard(type, domains[type]))}

        {/*
          The retired domain. It is shown only where it exists, only so a user
          can see where their old sessions went, and its switch is one-way:
          off is possible, on is not offered anywhere in the product.
        */}
        {legacySport ? (
          <Section>
            <Card>
              <div className="areas__domainHeader">
                <span className="areas__domainMark areas__domainMark--sports" aria-hidden="true">
                  <ActivityIcon size={22} />
                </span>
                <span className="row__body">
                  <span className="areas__domainName">{t('domain.legacySport')}</span>
                  <span className="areas__domainDescription">
                    {t('domain.legacySport.description')}
                  </span>
                </span>
                {legacySport.enabled ? (
                  <Switch
                    checked
                    label={t('domain.legacySport')}
                    accent="var(--domain-sports-mid)"
                    onChange={() => actions.disableLegacySport()}
                  />
                ) : null}
              </div>
              <div className="areas__domainBody">
                <p className="areas__note">{t('areas.legacySport.note')}</p>
              </div>
            </Card>
          </Section>
        ) : null}

        <BackupSection onRestored={actions.reload} />

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
