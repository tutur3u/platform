import { z } from 'zod';
import {
  createInternalApiClient,
  type InternalApiClientOptions,
} from './client';

// Client for the people registry manager routes. Revision conflicts and
// refusals are expected outcomes, so calls return the status and body instead
// of throwing on every non-2xx response.

export const peopleChannels = [
  'zalo',
  'whatsapp',
  'discord',
  'email',
  'phone',
] as const;

export const peopleRegistryControlSchema = z.object({
  isOwner: z.boolean(),
  captureEnabled: z.boolean(),
  personalSessionsEnabled: z.boolean(),
  stopped: z.boolean(),
  generation: z.number(),
});

export const peopleListItemSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['person', 'organisation']),
  label: z.string(),
  status: z.string(),
  isOwner: z.boolean(),
  version: z.number(),
  updatedAt: z.string(),
  identityCount: z.number(),
});

export const peopleIdentitySchema = z.object({
  id: z.string().uuid(),
  channel: z.enum(peopleChannels),
  providerAccountId: z.string(),
  verification: z.enum(['asserted', 'desk_observed', 'code_verified']),
  linkState: z.enum(['proposed', 'confirmed', 'rejected']),
  basis: z.string(),
  keyVersion: z.number(),
  displayValue: z.string().nullable(),
  decidedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const peoplePersonSchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
  version: z.number(),
  kind: z.enum(['person', 'organisation']).optional(),
  label: z.string().optional(),
  isOwner: z.boolean().optional(),
  contactId: z.string().nullable().optional(),
  linkedUserId: z.string().nullable().optional(),
  consentVersion: z.number().optional(),
  identities: z.array(peopleIdentitySchema).optional(),
  fleetIdentities: z
    .array(
      z.object({
        channel: z.string(),
        providerAccountId: z.string(),
        verifiedAt: z.string(),
      })
    )
    .optional(),
  facts: z.array(z.record(z.string(), z.unknown())).optional(),
  rules: z.array(z.record(z.string(), z.unknown())).optional(),
  consents: z.array(z.record(z.string(), z.unknown())).optional(),
  relationships: z.array(z.record(z.string(), z.unknown())).optional(),
  activity: z.array(z.record(z.string(), z.unknown())).optional(),
});

export type PeopleRegistryControl = z.infer<typeof peopleRegistryControlSchema>;
export type PeopleListItem = z.infer<typeof peopleListItemSchema>;
export type PeoplePerson = z.infer<typeof peoplePersonSchema>;

export type PeopleRegistryResponse<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; data?: unknown };

function base(wsId: string) {
  return `/api/v1/workspaces/${encodeURIComponent(wsId)}/people-registry`;
}

async function call<T>(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | undefined>;
  },
  options: InternalApiClientOptions | undefined,
  parse?: (value: unknown) => T
): Promise<PeopleRegistryResponse<T>> {
  const response = await createInternalApiClient(options).fetch(path, {
    method: init.method ?? 'GET',
    cache: 'no-store',
    redirect: 'error',
    query: init.query,
    headers:
      init.body === undefined
        ? undefined
        : { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body: unknown = await response.json().catch(() => null);
  const reason =
    body && typeof body === 'object' && 'reason' in body
      ? String(body.reason)
      : null;
  if (!response.ok) {
    const error =
      body && typeof body === 'object' && 'error' in body
        ? String(body.error)
        : reason;
    return {
      ok: false,
      status: response.status,
      error: error ?? 'request_failed',
      data: body,
    };
  }
  return {
    ok: true,
    status: response.status,
    data: parse ? parse(body) : (body as T),
  };
}

export function getPeopleRegistryControl(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return call(base(wsId), {}, options, (body) =>
    peopleRegistryControlSchema.parse(body)
  );
}

export function enablePeopleRegistry(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return call<{ reason: string }>(base(wsId), { method: 'POST' }, options);
}

export function listPeople(
  wsId: string,
  query: { q?: string; limit?: number; after?: string } = {},
  options?: InternalApiClientOptions
) {
  return call(
    `${base(wsId)}/persons`,
    { query },
    options,
    (body) =>
      z.object({ persons: z.array(peopleListItemSchema) }).parse(body).persons
  );
}

export function getPerson(
  wsId: string,
  personId: string,
  options?: InternalApiClientOptions
) {
  return call(
    `${base(wsId)}/persons/${encodeURIComponent(personId)}`,
    {},
    options,
    (body) => peoplePersonSchema.parse(body)
  );
}

export function createPerson(
  wsId: string,
  body: { label: string; kind?: 'person' | 'organisation'; isOwner?: boolean },
  options?: InternalApiClientOptions
) {
  return call<{ id: string }>(
    `${base(wsId)}/persons`,
    { method: 'POST', body },
    options
  );
}

export function updatePerson(
  wsId: string,
  personId: string,
  body: {
    baseVersion: number;
    label?: string;
    kind?: 'person' | 'organisation';
  },
  options?: InternalApiClientOptions
) {
  return call<{ reason: string; version?: number }>(
    `${base(wsId)}/persons/${encodeURIComponent(personId)}`,
    { method: 'PATCH', body },
    options
  );
}

export function deletePerson(
  wsId: string,
  personId: string,
  body: { step: 'begin' | 'finish'; withoutSuppression?: boolean },
  options?: InternalApiClientOptions
) {
  return call<{ reason: string }>(
    `${base(wsId)}/persons/${encodeURIComponent(personId)}`,
    { method: 'DELETE', body },
    options
  );
}

type PersonResource =
  | 'facts'
  | 'rules'
  | 'consents'
  | 'relationships'
  | 'identities';

export function writePersonResource(
  wsId: string,
  personId: string,
  resource: PersonResource,
  body: Record<string, unknown>,
  options?: InternalApiClientOptions,
  method: 'PUT' | 'POST' | 'PATCH' = resource === 'identities' ? 'POST' : 'PUT'
) {
  return call<{ reason?: string } & Record<string, unknown>>(
    `${base(wsId)}/persons/${encodeURIComponent(personId)}/${resource}`,
    { method, body },
    options
  );
}

export function writeRegistrySetting(
  wsId: string,
  setting: 'flags' | 'managers' | 'bindings',
  body: Record<string, unknown>,
  options?: InternalApiClientOptions
) {
  return call<{ reason?: string } & Record<string, unknown>>(
    `${base(wsId)}/${setting}`,
    { method: 'PUT', body },
    options
  );
}
