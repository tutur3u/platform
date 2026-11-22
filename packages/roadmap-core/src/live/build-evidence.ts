import { type CommitEvidence, parseEvidence } from './evidence.ts';

/**
 * The cited commits this build found on main, embedded by Vite from
 * .generated/evidence.json (scripts/generate-roadmap-data.mjs). Outside a
 * build there is none, and every commit-cited deliverable keeps its fallback.
 */
export const BUILD_EVIDENCE: readonly CommitEvidence[] =
  parseEvidence(
    typeof __ROADMAP_EVIDENCE__ === 'undefined' ? null : __ROADMAP_EVIDENCE__
  )?.commits ?? [];
