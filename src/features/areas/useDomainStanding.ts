import { useCallback } from 'react';
import { useLoadable } from '../../app/useLoadable';
import type { DomainType } from '../../core/model';
import type { Rank } from '../../core/ranks';
import { loadBossProgression } from '../../storage/services/bossService';

export interface DomainStanding {
  rank: Rank;
  peakRank: Rank;
  /** The domain's rating on the shared 0–1000 scale. */
  momentum: number;
  /** False until the domain has a scored day behind it. */
  started: boolean;
}

/**
 * One domain's standing — rank and rating — read from the Boss replay.
 *
 * The same ledger the Rank screen lists, read here so a terminal can open
 * with the domain's current standing above its detail. Not a second replay
 * of its own and not a second definition of the rating: the ledger the Boss
 * builds *is* the domain rating, so the two screens cannot disagree.
 */
export function useDomainStanding(domain: DomainType): DomainStanding | null {
  const load = useCallback(async (): Promise<DomainStanding> => {
    const boss = await loadBossProgression();
    const ledger = boss.domains.find((entry) => entry.domain === domain)!;
    return {
      rank: ledger.rank,
      peakRank: ledger.peakRank,
      momentum: ledger.momentum,
      started: ledger.started,
    };
  }, [domain]);
  const { state } = useLoadable(load);
  return state.status === 'ready' ? state.value : null;
}
