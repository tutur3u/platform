import { z } from 'zod';

/** Portable contract for `GET /api/v1/users/me/bootstrap` (zod only). */
export const BOOTSTRAP_VERSION = 1;
export const BOOTSTRAP_MAX_SECTIONS = 8;
export const BOOTSTRAP_MAX_WORKSPACE_ID_LENGTH = 64;

export const BOOTSTRAP_SECTIONS = [
  'profile',
  'workspace',
  'configs',
  'onboarding',
  'unreadCount',
  'invitations',
  'hiddenWorkspaces',
  'workspaces',
] as const;
export const BootstrapSection = z.enum(BOOTSTRAP_SECTIONS);
export type BootstrapSection = z.infer<typeof BootstrapSection>;

/** The shell configs; task-scoped configs are excluded by construction. */
export const BOOTSTRAP_CONFIG_IDS = [
  'SORBET_THEME',
  'EXPERIMENTAL_SORBET_UI',
  'SIDEBAR_BEHAVIOR',
  'SHOW_VERSION_BADGE',
] as const;
export const BootstrapConfigId = z.enum(BOOTSTRAP_CONFIG_IDS);
export type BootstrapConfigId = z.infer<typeof BootstrapConfigId>;

export const BOOTSTRAP_ERROR_CODES = [
  'forbidden',
  'not_found',
  'failed',
  'timeout',
  'unavailable',
  'workspace_unavailable',
] as const;

/** Codes and statuses only: never messages, ids or stack traces. */
export const BootstrapSectionError = z.object({
  code: z.enum(BOOTSTRAP_ERROR_CODES),
  status: z.number().int(),
});
export type BootstrapSectionError = z.infer<typeof BootstrapSectionError>;

const section = <T extends z.ZodType>(data: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data }),
    z.object({ ok: z.literal(false), error: BootstrapSectionError }),
  ]);

/**
 * Each section's `data` is the JSON body the individual endpoint returns, so
 * the shapes below only pin what clients rely on and leave the rest open.
 */
export const UserBootstrapResponse = z.object({
  version: z.literal(BOOTSTRAP_VERSION),
  actorId: z.uuid(),
  sections: z
    .object({
      profile: section(z.looseObject({ id: z.string() })).optional(),
      workspace: section(z.looseObject({ id: z.string() })).optional(),
      configs: z
        .partialRecord(
          BootstrapConfigId,
          section(z.object({ value: z.string().nullable() }))
        )
        .optional(),
      onboarding: section(z.looseObject({}).nullable()).optional(),
      unreadCount: section(
        z.object({ count: z.number().int().nonnegative() })
      ).optional(),
      invitations: section(
        z.object({ invitations: z.array(z.looseObject({})) })
      ).optional(),
      hiddenWorkspaces: section(
        z.object({ hiddenWorkspaceIds: z.array(z.uuid()) })
      ).optional(),
      workspaces: section(
        z.array(z.looseObject({ id: z.string() }))
      ).optional(),
    })
    .strict(),
});
export type UserBootstrapResponse = z.infer<typeof UserBootstrapResponse>;

/** Query of the bootstrap request; the server applies the same bounds. */
export interface UserBootstrapParams {
  configs?: readonly BootstrapConfigId[];
  expectedActorId: string;
  sections: readonly BootstrapSection[];
  unreadWsId?: string;
  wsId?: string;
}
