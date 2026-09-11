import { useEffect, useMemo, useState } from 'react';
import { TREND_RANGES } from '../../core/config/constants';
import type { DomainType } from '../../core/model';
import { Button, Card, EmptyState, LoadFailure, Segmented, StaleNotice } from '../../components';
import { useT } from '../../i18n/I18nProvider';
import type { AppConfiguration } from '../../storage/services/configurationService';
import { GymOverview } from '../gym/GymOverview';
import { GymProgress } from '../gym/GymProgress';
import { useGymHistory } from '../gym/useGymHistory';
import { useGymRating } from '../gym/useGymRating';
import { RunningOverview } from '../running/RunningOverview';
import { useRunningRating } from '../running/useRunningRating';
import { DomainSwitch } from './DomainSwitch';
import type { HeatmapRow } from './Heatmap';
import { DailyHistory } from './terminals/DailyHistory';
import { FoodTerminal } from './terminals/FoodTerminal';
import { MentalTerminal } from './terminals/MentalTerminal';
import { useHistoryWindow, type HistoryWindow } from './useHistoryWindow';
import { useProgression } from './useProgression';
import './progress.css';
import './domainTerminal.css';

/**
 * Verlauf: the domain terminal.
 *
 * One switch, one domain at a time. Today answers "how am I doing today and
 * overall"; this screen answers "show me the detailed state and development
 * of *this* area". The four domains are separate experiences, never four
 * dashboards stacked down one page — when Gym is selected nothing of
 * Wellbeing, Laufen or Ernährung is rendered beneath it.
 *
 * The active domain is not state of this screen. It is part of the route,
 * mirrored to the URL, so a link can name it and Back walks the domains the
 * user actually visited. The switch derives from it and writes to it; there
 * is no second copy.
 *
 * The range picker is the host's, shared across domains, so switching areas
 * keeps the window the user chose.
 */

/** The product's order, which is also the order on the switch. */
const DOMAIN_ORDER: readonly DomainType[] = ['mental', 'gym', 'running', 'food'];

export function ProgressScreen({
  configuration,
  domain,
  onSelectDomain,
  onGoToToday,
  onGoToAreas,
}: {
  configuration: AppConfiguration;
  domain: DomainType;
  /** `replace` marks a correction the user did not make, so Back skips it. */
  onSelectDomain(domain: DomainType, replace?: boolean): void;
  onGoToToday?: () => void;
  onGoToAreas?: () => void;
}) {
  const t = useT();
  const [range, setRange] = useState<number>(TREND_RANGES[TREND_RANGES.length - 1]!);
  const { state, reload } = useProgression();
  const window = useHistoryWindow(state.status === 'ready' ? state.value : null, range);

  const enabled = useMemo(
    () => DOMAIN_ORDER.filter((entry) => configuration.domains[entry]?.enabled),
    [configuration],
  );

  // A domain that is switched off cannot be the one on screen. Corrected in
  // place rather than pushed, so Back does not lead straight back into it.
  useEffect(() => {
    if (enabled.length > 0 && !enabled.includes(domain)) {
      onSelectDomain(enabled[0]!, true);
    }
  }, [enabled, domain, onSelectDomain]);

  const rangeSelector = (
    <div className="progress__ranges">
      <Segmented<string>
        label={t('nav.progress')}
        value={String(range)}
        onChange={(next) => setRange(Number(next))}
        options={TREND_RANGES.map((days) => ({
          value: String(days),
          label: t('progress.rangeDays', { count: days }),
        }))}
      />
    </div>
  );

  return (
    <div className="screen">
      <header className="screen__header screen__header--terminal">
        <h1 className="screen__title">{t('nav.progress')}</h1>
        {enabled.length > 0 ? (
          <DomainSwitch domains={enabled} active={domain} onSelect={onSelectDomain} />
        ) : null}
      </header>

      <div className="progress__scroll" aria-busy={state.status === 'loading'}>
        {state.status === 'failed' ? (
          <LoadFailure title={t('error.progress.title')} onRetry={reload} />
        ) : null}
        {state.status === 'ready' && state.refreshFailed ? <StaleNotice onRetry={reload} /> : null}

        {state.status === 'ready' && window ? (
          !enabled.includes(domain) ? (
            <Card>
              <EmptyState
                title={t('progress.domainOff')}
                action={
                  onGoToAreas ? (
                    <Button variant="secondary" onClick={onGoToAreas}>
                      {t('nav.areas')}
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <>
              {rangeSelector}
              {domain === 'mental' ? (
                <MentalTerminal window={window} onGoToToday={onGoToToday} />
              ) : null}
              {domain === 'gym' ? <GymTerminal window={window} range={range} /> : null}
              {domain === 'running' ? <RunningTerminal window={window} /> : null}
              {domain === 'food' ? <FoodTerminal window={window} /> : null}
            </>
          )
        ) : null}
      </div>
    </div>
  );
}

/**
 * Gym's terminal, Stage A: the rating board, the progress hierarchy and the
 * daily row — exactly what Verlauf showed for Gym, and nothing from any
 * other domain. The 3D body and the charts arrive in Stages B and C.
 */
function GymTerminal({ window, range }: { window: HistoryWindow; range: number }) {
  const t = useT();
  const gym = useGymHistory(range);
  const gymRating = useGymRating();
  const rows: HeatmapRow[] = useMemo(() => {
    const values = window.history.gym.slice(window.start);
    return values.some((value) => value !== null)
      ? [{ key: 'gym', label: t('domain.gym'), values }]
      : [];
  }, [window, t]);

  return (
    <>
      {gymRating ? (
        <GymOverview state={gymRating.state} rank={gymRating.rank} started={gymRating.started} />
      ) : null}
      {gym && gym.days.length > 0 ? <GymProgress history={gym} /> : null}
      <DailyHistory rows={rows} days={window.days.map((day) => day.date)} />
    </>
  );
}

/** Running's terminal, Stage A: the rating board, the ranges, the daily row. */
function RunningTerminal({ window }: { window: HistoryWindow }) {
  const t = useT();
  const runningRating = useRunningRating();
  const rows: HeatmapRow[] = useMemo(() => {
    const values = window.history.running.slice(window.start);
    return values.some((value) => value !== null)
      ? [{ key: 'running', label: t('domain.running'), values }]
      : [];
  }, [window, t]);

  return (
    <>
      {runningRating ? (
        <RunningOverview
          state={runningRating.state}
          rank={runningRating.rank}
          started={runningRating.started}
        />
      ) : null}
      <DailyHistory rows={rows} days={window.days.map((day) => day.date)} />
    </>
  );
}
