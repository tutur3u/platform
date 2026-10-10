import { InternalApiError } from '@tuturuuu/internal-api/client';
import {
  getProductFeedback,
  listProductFeedback,
  type ProductFeedbackListQuery,
} from '@tuturuuu/internal-api/product-feedback';
import { z } from 'zod';
import type { TuturuuuUserClient } from '../platform';
import type { FlagValue } from './args';
import type { HelpTopic } from './help-format';

export const feedbackHelp: HelpTopic = {
  usage: 'ttr feedback list|show [id] [options]',
  description:
    'Read the private staff-global inbox. No selected workspace is required. One page per invocation.',
  commands: [
    'list                         list safe metadata only',
    'show <uuid>                  show metadata; body requires --include-content',
  ],
  options: [
    '--view inbox|resolved|archive|all',
    '--status open|resolved       archive/all only',
    '--search <title>             title search only',
    '--limit <1..50>              default 25',
    '--cursor <opaque>            explicit next page',
    '--include-content            show only; private body to stdout',
    '--json                       sanitized machine-readable output',
  ],
  examples: [
    'ttr feedback list --view inbox --json',
    'ttr feedback show <uuid> --include-content --json',
  ],
};
const metadata = z.object({
  id: z.uuid(),
  title: z
    .string()
    .refine((text) => [...text].length >= 1 && [...text].length <= 160),
  createdAt: z.iso.datetime({ offset: true }),
  status: z.enum(['open', 'resolved']),
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
const detail = metadata.extend({
  body: z
    .string()
    .refine((text) => [...text].length >= 1 && [...text].length <= 8000),
  updatedAt: z.iso.datetime({ offset: true }),
  capabilities: z.object({ canManage: z.literal(false) }),
});
const invalid = () =>
  new Error('feedback_invalid_arguments: use ttr feedback --help');

export function validateFeedbackCommand(
  positionals: string[],
  flags: Record<string, FlagValue>,
  argv?: string[]
) {
  const action = positionals[1] ?? 'list';
  const allowed =
    action === 'list'
      ? [
          'view',
          'status',
          'search',
          'limit',
          'cursor',
          'json',
          'no-update-check',
        ]
      : ['include-content', 'json', 'no-update-check'];
  if (
    !['list', 'show'].includes(action) ||
    Object.keys(flags).some((key) => !allowed.includes(key))
  )
    throw invalid();
  for (const [key, value] of Object.entries(flags)) {
    if (
      ['json', 'include-content', 'no-update-check'].includes(key)
        ? value !== true
        : typeof value !== 'string'
    )
      throw invalid();
  }
  if (argv) {
    const keys = argv
      .filter((arg) => arg.startsWith('--'))
      .map((arg) => arg.slice(2).split('=')[0]);
    if (new Set(keys).size !== keys.length) throw invalid();
  }
  if (action === 'show') {
    if (positionals.length !== 3 || !z.uuid().safeParse(positionals[2]).success)
      throw invalid();
    return {
      action: 'show' as const,
      id: positionals[2]!.toLowerCase(),
      includeContent:
        Object.hasOwn(flags, 'include-content') &&
        flags['include-content'] === true,
    };
  }
  if (positionals.length > 2) throw invalid();
  const view = flags.view ?? 'inbox';
  const status = flags.status;
  if (
    !['inbox', 'resolved', 'archive', 'all'].includes(String(view)) ||
    (status !== undefined &&
      (!['open', 'resolved'].includes(String(status)) ||
        !['archive', 'all'].includes(String(view))))
  )
    throw invalid();
  const q = typeof flags.search === 'string' ? flags.search.trim() : undefined;
  if (q && ([...q].length > 160 || /[\p{Cc}\p{Cf}]/u.test(q))) throw invalid();
  const limit = flags.limit ?? '25';
  if (!/^\d+$/.test(String(limit)) || Number(limit) < 1 || Number(limit) > 50)
    throw invalid();
  const cursor = flags.cursor;
  if (
    cursor !== undefined &&
    (typeof cursor !== 'string' ||
      !/^[A-Za-z0-9_-]+$/.test(cursor) ||
      Buffer.byteLength(cursor) > 1152)
  )
    throw invalid();
  if (typeof cursor === 'string') {
    try {
      const bytes = Buffer.from(cursor, 'base64url');
      if (bytes.toString('base64url') !== cursor) throw invalid();
      const position = z
        .object({
          v: z.literal(1),
          view: z.enum(['inbox', 'resolved', 'archive', 'all']),
          status: z.enum(['open', 'resolved']).nullable(),
          q: z.string(),
          createdAt: z.iso
            .datetime({ offset: true })
            .refine((value) => !/\.\d{7}/.test(value)),
          id: z.uuid(),
        })
        .strict()
        .parse(
          JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
        );
      if (
        position.view !== view ||
        position.status !== (status ?? null) ||
        position.q !== (q ?? '')
      )
        throw invalid();
    } catch {
      throw invalid();
    }
  }
  const query: ProductFeedbackListQuery = {
    view: view as ProductFeedbackListQuery['view'],
    limit: Number(limit),
    ...(status ? { status: status as 'open' | 'resolved' } : {}),
    ...(q ? { q } : {}),
    ...(cursor ? { cursor: String(cursor) } : {}),
  };
  return { action: 'list' as const, query };
}

/** Visible escapes disable terminal control/ANSI in human AND JSON output. */
export function feedbackTerminalText(value: string): string {
  return value.replace(
    /[\p{Cc}\p{Cf}]/gu,
    (char) => `\\u${char.codePointAt(0)!.toString(16).padStart(4, '0')}`
  );
}
function safeMetadata(item: z.infer<typeof metadata>) {
  return {
    id: item.id,
    title: feedbackTerminalText(item.title),
    createdAt: feedbackTerminalText(item.createdAt),
    status: item.status,
    archivedAt:
      item.archivedAt === null ? null : feedbackTerminalText(item.archivedAt),
    revision: item.revision,
  };
}
export interface FeedbackCommandInput {
  client: Pick<TuturuuuUserClient, 'getClientOptions'>;
  positionals: string[];
  flags: Record<string, FlagValue>;
  json: boolean;
}
export async function runFeedbackCommand(input: FeedbackCommandInput) {
  const parsed = validateFeedbackCommand(input.positionals, input.flags);
  let output: unknown;
  try {
    // Public host/refresh/Bearer transport. No local eligibility or workspace gate.
    const options = input.client.getClientOptions();
    if (parsed.action === 'list') {
      const page = z
        .object({
          items: z.array(metadata).max(50),
          nextCursor: z.string().max(1152).nullable(),
        })
        .parse(await listProductFeedback(parsed.query, options));
      output = {
        items: page.items.map(safeMetadata),
        nextCursor:
          page.nextCursor === null
            ? null
            : feedbackTerminalText(page.nextCursor),
      };
    } else {
      const item = detail.parse(await getProductFeedback(parsed.id, options));
      if (item.id !== parsed.id) throw new Error('invalid_identity');
      output = {
        ...safeMetadata(item),
        updatedAt: feedbackTerminalText(item.updatedAt),
        capabilities: { canManage: false },
        ...(parsed.includeContent
          ? { body: feedbackTerminalText(item.body) }
          : {}),
      };
    }
  } catch (error) {
    const status =
      error instanceof InternalApiError &&
      [400, 401, 403, 404, 503].includes(error.status)
        ? error.status
        : 503;
    const codes: Record<number, string> = {
      400: 'feedback_invalid_query',
      401: 'feedback_unauthorized',
      403: 'feedback_forbidden',
      404: 'feedback_not_found',
      503: 'feedback_unavailable',
    };
    const code = codes[status] ?? 'feedback_unavailable';
    // Never forward provider messages, bodies, URLs, stack traces or debug packets.
    throw new Error(`${code} (${status})`);
  }
  process.stdout.write(
    `${input.json ? JSON.stringify(output, null, 2) : formatFeedbackOutput(output)}\n`
  );
}
function formatFeedbackOutput(output: unknown) {
  const data = output as {
    items?: ReturnType<typeof safeMetadata>[];
    nextCursor?: string | null;
    title?: string;
    id?: string;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
    archivedAt?: string | null;
    revision?: number;
    body?: string;
  };
  if (data.items)
    return [
      ...data.items.map(
        (item) =>
          `${item.id}\t${item.status}\t${item.createdAt}\t${item.archivedAt ? 'archived\t' : ''}${item.title}`
      ),
      data.items.length ? '' : 'No feedback in this page.',
      data.nextCursor ? `Next cursor: ${data.nextCursor}` : 'End of page.',
    ]
      .filter(Boolean)
      .join('\n');
  return [
    `${data.title}`,
    `ID: ${data.id}`,
    `Status: ${data.status}`,
    `Created: ${data.createdAt}`,
    `Updated: ${data.updatedAt}`,
    `Archived: ${data.archivedAt ?? 'no'}`,
    `Revision: ${data.revision}`,
    'Read only (canManage: false)',
    ...(data.body === undefined ? [] : ['', data.body]),
  ].join('\n');
}
