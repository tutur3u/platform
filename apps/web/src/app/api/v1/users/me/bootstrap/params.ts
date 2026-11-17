import {
  BOOTSTRAP_MAX_SECTIONS,
  BOOTSTRAP_MAX_WORKSPACE_ID_LENGTH,
  BootstrapConfigId,
  BootstrapSection,
} from '@tuturuuu/internal-api/user-bootstrap';
import { z } from 'zod';

const list = (value: string) => value.split(',');

const QuerySchema = z
  .object({
    configs: z
      .string()
      .transform(list)
      .pipe(z.array(BootstrapConfigId).min(1).max(4))
      .optional(),
    expectedActorId: z.uuid(),
    sections: z
      .string()
      .transform(list)
      .pipe(z.array(BootstrapSection).min(1).max(BOOTSTRAP_MAX_SECTIONS)),
    unreadWsId: z.guid().optional(),
    wsId: z.string().min(1).max(BOOTSTRAP_MAX_WORKSPACE_ID_LENGTH).optional(),
  })
  .strict();

export interface BootstrapRequest {
  configs: readonly BootstrapConfigId[];
  expectedActorId: string;
  sections: readonly BootstrapSection[];
  unreadWsId: string | undefined;
  wsId: string | undefined;
}

/**
 * Parses the bootstrap query. Any violation (unknown or repeated parameter,
 * unknown section, config outside the allowlist, a parameter without its
 * section) returns `null`, and the route answers a generic 400.
 */
export function parseBootstrapRequest(url: string): BootstrapRequest | null {
  const { searchParams } = new URL(url);
  const raw: Record<string, string> = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    if (values.length !== 1) return null;
    raw[key] = values[0] as string;
  }

  const parsed = QuerySchema.safeParse(raw);
  if (!parsed.success) return null;

  const sections = [...new Set(parsed.data.sections)];
  const has = (section: BootstrapSection) => sections.includes(section);
  const { configs, unreadWsId, wsId } = parsed.data;

  if (has('configs') !== (configs !== undefined)) return null;
  if (has('workspace') !== (wsId !== undefined)) return null;
  if (unreadWsId !== undefined && !has('unreadCount')) return null;

  return {
    configs: [...new Set(configs ?? [])],
    expectedActorId: parsed.data.expectedActorId,
    sections,
    unreadWsId,
    wsId,
  };
}
