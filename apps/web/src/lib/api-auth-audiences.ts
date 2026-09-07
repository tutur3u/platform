import type { AppSessionTargetApp } from '@tuturuuu/auth/app-session';

const LEARN_TEACH_APP_SESSION_TARGETS = ['learn', 'teach'] as const;
const ALL_SATELLITE_APP_SESSION_TARGETS = [
  'ai',
  'calendar',
  'chat',
  'cms',
  'contacts',
  'drive',
  'finance',
  'forms',
  'hive',
  'infra',
  'inventory',
  'learn',
  'mail',
  'meet',
  'mind',
  'mira',
  'nova',
  'pay',
  'rewise',
  'storefront',
  'tasks',
  'teach',
  'track',
] as const;

const APP_SESSION_ROUTE_AUDIENCE_RULES: readonly {
  pattern: RegExp;
  targetApp: AppSessionTargetApp | readonly AppSessionTargetApp[];
}[] = [
  {
    pattern: /^\/api\/v1\/ai\/whitelist(?:\/|$)/u,
    targetApp: ALL_SATELLITE_APP_SESSION_TARGETS,
  },
  { pattern: /^\/api\/v1\/ai\/chats(?:\/|$)/u, targetApp: 'rewise' },
  { pattern: /^\/api\/v1\/cms(?:\/|$)/u, targetApp: 'cms' },
  { pattern: /^\/api\/v1\/nova(?:\/|$)/u, targetApp: 'nova' },
  {
    pattern: /^\/api\/v1\/(?:course|tulearn)(?:\/|$)/u,
    targetApp: LEARN_TEACH_APP_SESSION_TARGETS,
  },
  {
    pattern:
      /^\/api\/v1\/users\/me\/(?:avatar|configs|default-workspace|email|profile)(?:\/|$)/u,
    targetApp: ALL_SATELLITE_APP_SESSION_TARGETS,
  },
  {
    pattern:
      /^\/api\/v1\/workspaces\/[^/]+\/(?:calendar|calendar-hours|calendar-settings|encryption)(?:\/|$)/u,
    targetApp: 'calendar',
  },
  {
    pattern: /^\/api\/v1\/workspaces\/[^/]+\/chat(?:\/|$)/u,
    targetApp: 'chat',
  },
  {
    pattern: /^\/api\/v1\/workspaces\/[^/]+\/storage(?:\/|$)/u,
    targetApp: 'drive',
  },
  {
    pattern: /^\/api\/v1\/workspaces\/[^/]+\/time-tracking(?:\/|$)/u,
    targetApp: ['calendar', 'tasks', 'track'],
  },
  {
    pattern: /^\/api\/v1\/workspaces\/[^/]+\/inventory(?:\/|$)/u,
    targetApp: 'inventory',
  },
  {
    pattern: /^\/api\/v1\/workspaces\/[^/]+\/mail(?:\/|$)/u,
    targetApp: 'mail',
  },
  {
    pattern: /^\/api\/v1\/workspaces\/[^/]+\/mind(?:\/|$)/u,
    targetApp: 'mind',
  },
  {
    pattern: /^\/api\/v1\/workspaces\/[^/]+\/tulearn(?:\/|$)/u,
    targetApp: LEARN_TEACH_APP_SESSION_TARGETS,
  },
  {
    pattern: /^\/api\/v1\/workspaces\/[^/]+\/teach(?:\/|$)/u,
    targetApp: 'teach',
  },
  {
    pattern:
      /^\/api\/v1\/workspaces\/[^/]+\/(?:courses|course-modules)(?:\/|$)/u,
    targetApp: 'teach',
  },
  {
    pattern: /^\/api\/v1\/workspaces\/[^/]+\/users\/groups(?:\/|$)/u,
    targetApp: ['contacts', 'teach'],
  },
  {
    pattern: /^\/api\/v1\/workspaces\/[^/]+\/users(?:\/|$)/u,
    targetApp: ['contacts', 'teach'],
  },
  {
    pattern:
      /^\/api\/v1\/workspaces\/[^/]+\/user-groups\/[^/]+\/(?:module-groups|module-order|modules)(?:\/|$)/u,
    targetApp: 'teach',
  },
  {
    pattern: /^\/api\/v1\/workspaces\/[^/]+\/user-groups(?:\/|$)/u,
    targetApp: ['contacts', 'teach'],
  },
];

function getPathnameFromRequestUrl(url: string) {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split('?')[0] || '/';
  }
}

export function getDefaultAppSessionVerificationOptions(requestUrl: string): {
  targetApp: AppSessionTargetApp | readonly AppSessionTargetApp[];
} {
  const pathname = getPathnameFromRequestUrl(requestUrl);
  const audienceRule = APP_SESSION_ROUTE_AUDIENCE_RULES.find((rule) =>
    rule.pattern.test(pathname)
  );

  return {
    targetApp: audienceRule?.targetApp ?? 'platform',
  };
}
