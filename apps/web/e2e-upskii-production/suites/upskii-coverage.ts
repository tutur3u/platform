/** Coverage census for the Upskii production suites; re-exported by upskii-helpers. */

/**
 * API families in Upskii's route census (inventory.json `apis`, grouped by
 * the first segment under /api/upskii, plus the non-upskii roots) and how
 * these suites treat each one. The runbook prints this; the admin suite
 * checks that every census family is classified exactly once.
 */
export const INVENTORY_FAMILIES = [
  'api/account',
  'api/auth',
  'api/internal',
  'api/v1',
  'objects',
  'upskii/account-workspaces',
  'upskii/admin',
  'upskii/ai-chat',
  'upskii/ai-connections',
  'upskii/ai-model-catalog',
  'upskii/announcements',
  'upskii/assessment-attempts',
  'upskii/assessments',
  'upskii/assistant',
  'upskii/class-grades',
  'upskii/classes',
  'upskii/course-prompts',
  'upskii/course-quiz-attempts',
  'upskii/course-quizzes',
  'upskii/course-save-challenge',
  'upskii/dashboard-summary',
  'upskii/editor',
  'upskii/english',
  'upskii/feedback',
  'upskii/files',
  'upskii/flashcards',
  'upskii/futureka',
  'upskii/gradebook',
  'upskii/grades',
  'upskii/home-feed',
  'upskii/invitations',
  'upskii/lessons',
  'upskii/live-game',
  'upskii/live-history',
  'upskii/materials',
  'upskii/memberships',
  'upskii/mobile-course-save-challenge',
  'upskii/notifications',
  'upskii/onboarding',
  'upskii/product-tour',
  'upskii/profile',
  'upskii/prompt-library',
  'upskii/quiz-games',
  'upskii/reports',
  'upskii/schools',
  'upskii/search',
  'upskii/settings',
  'upskii/slide-presentation-settings',
  'upskii/slide-walkthroughs',
  'upskii/students',
  'upskii/support-plans',
  'upskii/tasks',
  'upskii/tutor',
  'upskii/usage',
  'upskii/workspace-experience',
  'upskii/workspaces',
  'upskii/writing',
] as const;

export const API_COVERAGE = {
  source:
    'Upskii origin/main apps/workspace/src/server/app-unification/inventory.json',
  covered: {
    'api/auth': 'every suite: password sign-in through the auth authority',
    'upskii/admin':
      'admin: app-side admin APIs refuse teacher (403) and student (404)',
    'upskii/ai-chat':
      'educator: one class conversation, ONE platform-paid prompt, delete',
    'upskii/announcements':
      'educator, learner: post to class; student refused (404)',
    'upskii/assessment-attempts':
      'educator: learner start/answer/submit, teacher review',
    'upskii/assessments':
      'educator: create, publish, assign, delete; learner lists',
    'upskii/classes':
      'educator, learner: detail, join code, roster; outsider refused',
    'upskii/course-quiz-attempts': 'educator: learner start/answer/submit',
    'upskii/course-quizzes': 'educator: create, publish, delete; learner lists',
    'upskii/dashboard-summary': 'educator: teacher read; student refused (404)',
    'upskii/feedback': 'admin: teacher submits (no DELETE; owner purge)',
    'upskii/files': 'educator: folder create/delete; material delete',
    'upskii/flashcards':
      'educator: class deck; learner: personal deck; review both',
    'upskii/gradebook': 'educator: column sync, override score, release',
    'upskii/grades': 'educator, learner: released grade; teacher refused (404)',
    'upskii/home-feed': 'learner: hub feed',
    'upskii/invitations': 'educator, learner: invite, list, accept',
    'upskii/lessons':
      'educator, learner: draft, module, publish, view, progress, archive',
    'upskii/materials':
      'educator, learner: text material upload, learner read, outsider refused',
    'upskii/memberships': 'educator, learner: roster and removal',
    'upskii/notifications':
      'educator, learner: announcement delivery, mark read',
    'upskii/settings':
      'educator: voice preference round trip (skips when flag off)',
    'upskii/tutor': 'educator: tutor session on a material, completed',
    'upskii/workspace-experience':
      'educator: teacher admitted, student refused',
  },
  skipped: {
    'api/account': 'password change mutates the shared QA credential',
    'api/internal':
      'capacity bootstrap is staging/loadtest only and needs the load-test secret',
    'api/v1': 'Microsoft OAuth callback needs an external identity provider',
    objects: 'object bytes are served by page renders; no QA upload fixture',
    'upskii/account-workspaces':
      'shared account workspaces change seed-class eligibility',
    'upskii/ai-connections':
      'stores personal provider API keys (needs a provider secret)',
    'upskii/ai-model-catalog':
      'static catalog with no production-specific state',
    'upskii/assistant': 'assistant compose is a paid AI call',
    'upskii/class-grades': 'same handler as gradebook (covered there)',
    'upskii/course-prompts': 'course AI prompts only matter on paid generation',
    'upskii/course-save-challenge':
      'Turnstile challenge needs a human/browser solve',
    'upskii/editor': 'editor assist is a paid AI call',
    'upskii/english':
      'coach, grammar, practice and audio are paid AI/TTS calls',
    'upskii/futureka': 'third-party authorize redirect',
    'upskii/live-game': 'realtime game sessions need concurrent sockets',
    'upskii/live-history': 'reads live-game history (no game created)',
    'upskii/mobile-course-save-challenge': 'mobile Turnstile challenge',
    'upskii/onboarding':
      'identities are onboarded by the provisioner; rerun mutates capabilities',
    'upskii/product-tour': 'UI tour state only',
    'upskii/profile':
      'profile edits show on the public profile; settings round trip used instead',
    'upskii/prompt-library': 'static prompt catalog',
    'upskii/quiz-games': 'realtime quiz games need concurrent sockets',
    'upskii/reports': 'abuse reports land in the human moderation queue',
    'upskii/schools': 'school creation is an organization-level side effect',
    'upskii/search': 'search index read without a stable QA fixture',
    'upskii/slide-presentation-settings': 'Slide Studio is access-gated',
    'upskii/slide-walkthroughs':
      'Slide Studio is access-gated and renders paid audio/previews',
    'upskii/students':
      'teacher drill-down read; covered by review and gradebook',
    'upskii/support-plans': 'support plans are AI generated',
    'upskii/tasks': 'rendered by the /to-do page smoke; no direct mutation',
    'upskii/usage': 'billing and credit counters, plan dependent',
    'upskii/workspaces': 'account-workspace scoped reads (no shared workspace)',
    'upskii/writing': 'writing assistant is a paid AI call',
  },
  admin: {
    covered: [
      'users',
      'users/[userId]',
      'classes/[classId]/marketplace-approval',
      'class-reviews',
      'content',
      'content/[contentType]/[contentId] (moderation PATCH)',
      'feedback',
      'feedback/[id]',
      'experimental-features',
      'access-policy',
      'bots',
      'qa/users (session, no bearer)',
      'demo-data',
      'demo-data/seed',
      'audit',
      'reports',
      'snapshot',
      'admin UI shell',
    ],
    skipped: {
      'capacity viewer reads':
        'capacity-viewer sessions come only from the staging/loadtest bootstrap with the load-test secret',
      'service-sessions, users/[userId]/password, admin-role':
        'owner-only credential routes; refusal is the same requireApiAdmin gate already covered',
    },
  },
} as const;
