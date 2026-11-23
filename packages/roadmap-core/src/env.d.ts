declare const __ROADMAP_BUILD_SHA__: string;
declare const __ROADMAP_BUILD_TIME__: string | null;
/** This build's hosting observation (.generated/hosting.json), or null. */
declare const __ROADMAP_HOSTING__: unknown;
/** This build's activity observation (.generated/activity.json), or null. */
declare const __ROADMAP_ACTIVITY__: unknown;
/** Cited commits on main as this build saw them (.generated/evidence.json), or null. */
declare const __ROADMAP_EVIDENCE__: unknown;
/** Open EduFest bugs as this build saw them (.generated/edufest-bugs.json), or null. */
declare const __ROADMAP_EDUFEST_BUGS__: unknown;
/** The newest patch notes (.generated/changelog.json), or null. */

declare const __ROADMAP_TECH_STACK__: readonly import('./tech-stack.ts').AppTechStack[];
