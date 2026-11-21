/**
 * The effect registry: every route's class, account scope and step-up act,
 * the closed `GrantAct` table and the closed credential issuer registry.
 * An app's integration builds its registry with `createRouteRegistry`, which
 * throws on any declaration the design does not allow, so a bad registry
 * fails the build rather than a request.
 */

export type RouteId = string;
export type RouteClass = 'read' | 'write' | 'credential' | 'security';

/** How a parameter must appear in the step-up parameters. */
export type ParamType = 'string' | 'integer' | 'strings' | 'sorted_strings';

type ActSpec = {
  params: Readonly<Record<string, ParamType>>;
  credentialChange: 'no' | 'yes' | 'revoke_all';
};

/** The parent page's step-up actions. Adding a value is a reviewed change. */
export const GRANT_ACTS = Object.freeze({
  'account.mfa.enroll': {
    params: { factorType: 'string', factorId: 'string' },
    credentialChange: 'no',
  },
  'account.mfa.remove': {
    params: { factorIds: 'sorted_strings' },
    credentialChange: 'yes',
  },
  'account.mfa.reset': {
    params: { factorIds: 'sorted_strings' },
    credentialChange: 'yes',
  },
  'account.passkey.enroll': {
    params: { credentialId: 'string' },
    credentialChange: 'no',
  },
  'account.passkey.remove': {
    params: { credentialIds: 'sorted_strings' },
    credentialChange: 'yes',
  },
  'account.password': {
    params: { passwordChangeId: 'string' },
    credentialChange: 'yes',
  },
  'account.email': {
    params: { newEmailHash: 'string' },
    credentialChange: 'no',
  },
  'account.delete': {
    params: { userId: 'string' },
    credentialChange: 'revoke_all',
  },
  'sessions.revoke_all': {
    params: { userId: 'string' },
    credentialChange: 'revoke_all',
  },
  'api_keys.create': {
    params: { workspaceId: 'string', keyName: 'string', role: 'string' },
    credentialChange: 'no',
  },
  'api_keys.rotate': {
    params: { workspaceId: 'string', keyId: 'string' },
    credentialChange: 'no',
  },
  'api_keys.revoke': {
    params: { workspaceId: 'string', keyId: 'string' },
    credentialChange: 'no',
  },
  'cli.approve': {
    params: { userCode: 'string', clientId: 'string' },
    credentialChange: 'no',
  },
  'qr.approve': { params: { challengeId: 'string' }, credentialChange: 'no' },
  'oauth.consent': {
    params: { clientId: 'string', scopes: 'strings', workspaceIds: 'strings' },
    credentialChange: 'no',
  },
  'vault.pin-eval': {
    params: {
      challenge: 'string',
      wrapVersion: 'integer',
      clientKey: 'string',
      blindedElementHash: 'string',
    },
    credentialChange: 'no',
  },
} as const satisfies Record<string, ActSpec>);

export type GrantAct = keyof typeof GRANT_ACTS;

/** The acts `record_factors` commits; every other act is consumed by `consume_step_up`. */
export const FACTOR_ACTS: readonly GrantAct[] = Object.freeze([
  'account.mfa.enroll',
  'account.mfa.remove',
  'account.mfa.reset',
  'account.passkey.enroll',
  'account.passkey.remove',
  'account.password',
]);

export function isGrantAct(value: unknown): value is GrantAct {
  return typeof value === 'string' && Object.hasOwn(GRANT_ACTS, value);
}

export function actSpec(act: GrantAct): ActSpec {
  return GRANT_ACTS[act];
}

/** The closed credential issuer registry. Every outbox row initializes each one. */
export const ISSUER_IDS = Object.freeze(['ai_token', 'handoff_code'] as const);
export type IssuerId = (typeof ISSUER_IDS)[number];

export type RouteDeclaration =
  | { class: RouteClass; accountScoped: boolean }
  | {
      class: 'credential' | 'security';
      accountScoped: true;
      stepUp: { act: GrantAct; tenantParams: string[] };
    };

export type StepUpRoute = Extract<RouteDeclaration, { stepUp: unknown }>;

/** The two credential mint routes. An issuer mints only after resolving one. */
export const MINT_ROUTES = Object.freeze({
  aiToken: 'auth.ai_token.mint',
  handoff: 'auth.handoff.mint',
} as const);

/** Applied to every route the registry does not declare. */
export const UNKNOWN_ROUTE: RouteDeclaration = Object.freeze({
  class: 'security',
  accountScoped: true,
});

declare const registryBrand: unique symbol;
export type RouteRegistry = {
  readonly [registryBrand]: true;
  get(route: RouteId): RouteDeclaration;
  has(route: RouteId): boolean;
};

const CLASSES: readonly RouteClass[] = [
  'read',
  'write',
  'credential',
  'security',
];

function validate(route: string, declaration: RouteDeclaration): string | null {
  const raw = declaration as Record<string, unknown>;
  if (!CLASSES.includes(raw.class as RouteClass)) return `${route}: class`;
  if (typeof raw.accountScoped !== 'boolean') return `${route}: accountScoped`;
  const allowed = new Set(['class', 'accountScoped', 'stepUp']);
  if (Object.keys(raw).some((key) => !allowed.has(key)))
    return `${route}: member`;
  if (!('stepUp' in raw)) return null;
  const stepUp = raw.stepUp as { act?: unknown; tenantParams?: unknown };
  if (raw.class !== 'credential' && raw.class !== 'security') {
    return `${route}: a step-up route is credential or security`;
  }
  if (raw.accountScoped !== true)
    return `${route}: a step-up route is account scoped`;
  if (!isGrantAct(stepUp?.act)) return `${route}: unknown act`;
  const fields = stepUp.tenantParams;
  if (
    !Array.isArray(fields) ||
    fields.some((field) => typeof field !== 'string' || field.length === 0) ||
    new Set(fields).size !== fields.length
  ) {
    return `${route}: tenantParams`;
  }
  for (const required of Object.keys(actSpec(stepUp.act).params)) {
    if (!fields.includes(required))
      return `${route}: tenantParams omit ${required}`;
  }
  return null;
}

/**
 * Validates and freezes an app's route declarations. Throws on a declaration
 * outside the design, including mint routes declared any other way than
 * `{ class: 'credential', accountScoped: true }`.
 */
export function createRouteRegistry(
  declarations: Readonly<Record<RouteId, RouteDeclaration>>
): RouteRegistry {
  const table = new Map<RouteId, RouteDeclaration>();
  for (const [route, declaration] of Object.entries(declarations)) {
    const problem = validate(route, declaration);
    if (problem) throw new TypeError(`Invalid route declaration ${problem}`);
    const frozen =
      'stepUp' in declaration
        ? Object.freeze({
            ...declaration,
            stepUp: Object.freeze({
              act: declaration.stepUp.act,
              tenantParams: Object.freeze([...declaration.stepUp.tenantParams]),
            }),
          })
        : Object.freeze({ ...declaration });
    table.set(route, frozen as RouteDeclaration);
  }
  for (const route of Object.values(MINT_ROUTES)) {
    const declared = table.get(route);
    if (
      declared &&
      (declared.class !== 'credential' ||
        declared.accountScoped !== true ||
        'stepUp' in declared)
    ) {
      throw new TypeError(`Invalid route declaration ${route}: mint route`);
    }
  }
  return Object.freeze({
    get: (route: RouteId) => table.get(route) ?? UNKNOWN_ROUTE,
    has: (route: RouteId) => table.has(route),
  }) as RouteRegistry;
}

export function stepUpOf(
  declaration: RouteDeclaration
): StepUpRoute['stepUp'] | null {
  return 'stepUp' in declaration ? declaration.stepUp : null;
}
