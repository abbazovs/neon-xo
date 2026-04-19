import { env } from '../config/env.js';
import { cleanupAbandonedMatches } from '../db/matches.js';

/**
 * Runs once every 24 hours. Removes voided/abandoned matches older than N days.
 */
export function startCleanupCron(): void {
  const runCleanup = async () => {
    try {
      const deleted = await cleanupAbandonedMatches(env.ABANDONED_MATCH_CLEANUP_DAYS);
      console.info(`[cleanup] Removed ${deleted} abandoned/voided matches`);
    } catch (err) {
      console.error('[cleanup] failed:', err);
    }
  };
  // First run after 5 minutes (to avoid thrash during deploy rollouts)
  setTimeout(runCleanup, 5 * 60 * 1000);
  // Then every 24h
  setInterval(runCleanup, 24 * 60 * 60 * 1000);
}
