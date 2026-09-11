import { useState } from 'react';
import type { DomainType } from '../../core/model';
import { displayedRankProgress } from '../../core/ranks/progress';
import { MetricDetailSheet, MetricTile } from '../../components/metrics';
import { useT } from '../../i18n/I18nProvider';
import { RankBadge } from '../ranking/RankBadge';
import { useDomainStanding } from './useDomainStanding';

/**
 * A domain's standing, as the hero of its terminal.
 *
 * The same rank and rating the Rank screen lists for the domain, in the tile
 * shape the training terminals already open with — so Wellbeing and Food
 * answer "where do I stand here" the way Gym and Running do. Nothing here is
 * computed: the ledger arrives from the Boss replay and is printed.
 */
export function DomainStandingTile({ domain, id }: { domain: DomainType; id: string }) {
  const t = useT();
  const standing = useDomainStanding(domain);
  const [open, setOpen] = useState(false);
  if (!standing) return null;

  const progress = displayedRankProgress(standing.momentum, standing.rank);
  const label = t('areas.standing.value', { value: progress.value });
  const bar = { percent: progress.percent, label, tone: 'accent' as const };

  if (!standing.started) {
    return (
      <MetricTile
        id={id}
        title={t('areas.standing')}
        leading={<RankBadge rankId={standing.rank.id} size={60} mystery />}
        kicker={standing.rank.name}
        value={<span className="metric-tile__state">{t('rank.domain.notStarted')}</span>}
      />
    );
  }

  return (
    <>
      <MetricTile
        id={id}
        title={t('areas.standing')}
        leading={<RankBadge rankId={standing.rank.id} size={60} />}
        kicker={standing.rank.name}
        value={label}
        bar={bar}
        line={t('areas.standing.summary')}
        onOpen={() => setOpen(true)}
      />
      <MetricDetailSheet
        open={open}
        title={t('areas.standing')}
        value={label}
        scale={standing.rank.name}
        bar={bar}
        onClose={() => setOpen(false)}
      >
        <p>{t('rank.domains.explain')}</p>
        <p>{t('rank.explainCurrent')}</p>
        <p className="metric-sheet__note">{t('rank.explainPeak')}</p>
      </MetricDetailSheet>
    </>
  );
}
