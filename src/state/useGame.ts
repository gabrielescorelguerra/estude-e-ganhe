import { useMemo } from 'react';
import type { Campaign, Election } from '../core/types';
import { addTallies, officialTally, studyTally, sum } from '../core/tally';
import { goalFor, marginVotes, dayKey, diffDays } from '../core/plan';
import { earnedVotes, selectCampaign, useStore } from './store';

export function useCampaign(): Campaign | null {
  return useStore((s) => selectCampaign(s));
}

export function useGame(election: Election | null) {
  const campaign = useCampaign();
  const sessions = useStore((s) => s.sessions);
  return useMemo(() => {
    if (!election || !campaign) return null;
    const official = officialTally(election, campaign.round);
    const study = studyTally(campaign);
    const simulated = addTallies(official, study);
    const goal = goalFor(campaign.round, campaign.focusNr, simulated, marginVotes(campaign.marginPct, sum(official)));
    const earned = earnedVotes(sessions, campaign.id);
    const allocated = Object.values(campaign.allocations).reduce((a, b) => a + b, 0);
    const today = dayKey(Date.now());
    const daysLeft = diffDays(today, campaign.deadline);
    return {
      campaign, official, study, simulated, goal, earned, allocated,
      wallet: earned - allocated,
      daysLeft,
      expired: daysLeft < 0 && !goal.reached,
    };
  }, [election, campaign, sessions]);
}

export type Game = NonNullable<ReturnType<typeof useGame>>;
