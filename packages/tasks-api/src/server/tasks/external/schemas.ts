import { z } from 'zod';

export const MAX_COMMENT_LENGTH = 65536;

export const commentBodySchema = z.object({
  body: z
    .string()
    .max(MAX_COMMENT_LENGTH)
    .refine((value) => value.trim().length > 0, 'Comment cannot be empty'),
});

export const commentParamsSchema = z.object({
  wsId: z.string().min(1),
  taskId: z.guid(),
  commentId: z.guid(),
});

export const linkParamsSchema = z.object({
  wsId: z.string().min(1),
  taskId: z.guid(),
  linkId: z.guid(),
});

const httpsUrl = z
  .url()
  .max(2048)
  .refine((value) => value.startsWith('https://'), 'URL must use https');

export const LINK_KINDS = [
  'pull_request',
  'commit',
  'ci_run',
  'issue',
  'doc',
  'url',
] as const;
export const LINK_STATES = [
  'open',
  'closed',
  'merged',
  'draft',
  'success',
  'failure',
  'pending',
  'cancelled',
] as const;

export const createLinkSchema = z.object({
  url: httpsUrl,
  kind: z.enum(LINK_KINDS).optional(),
  provider: z.enum(['github', 'web']).optional(),
  title: z.string().trim().min(1).max(500).optional(),
  state: z.enum(LINK_STATES).optional(),
  external_id: z.string().trim().min(1).max(200).optional(),
});

export const normalizedIssueSchema = z.object({
  url: httpsUrl,
  repo: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u),
  number: z.number().int().positive(),
  title: z.string().min(1).max(1000),
  body: z.string().max(1_000_000).nullable().default(''),
  state: z.enum(['open', 'closed']),
  state_reason: z.string().max(50).nullable().default(null),
  author: z.string().max(100).nullable().default(null),
  created_at: z.string().max(40),
  closed_at: z.string().max(40).nullable().default(null),
  labels: z.array(z.string().max(100)).max(100).default([]),
  assignees: z.array(z.string().max(100)).max(50).default([]),
  milestone: z.string().max(200).nullable().default(null),
  comments: z
    .array(
      z.object({
        url: httpsUrl,
        author: z.string().max(100).nullable().default(null),
        body: z.string().max(MAX_COMMENT_LENGTH),
        created_at: z.string().max(40),
      })
    )
    .max(500)
    .default([]),
  linked_prs: z
    .array(
      z.object({
        url: httpsUrl,
        number: z.number().int().positive().optional(),
        state: z.string().max(20).nullable().optional(),
        merged: z.boolean().optional(),
        title: z.string().max(500).nullable().optional(),
      })
    )
    .max(100)
    .default([]),
  linked_commits: z
    .array(z.object({ url: httpsUrl, oid: z.string().max(64).optional() }))
    .max(100)
    .default([]),
  /** Original GitHub timeline events (closed, reopened, labeled, ...). */
  events: z
    .array(
      z.object({
        event: z.enum([
          'closed',
          'reopened',
          'labeled',
          'unlabeled',
          'assigned',
          'milestoned',
        ]),
        at: z.string().max(40),
        actor: z.string().max(100).nullish(),
        label: z.string().max(100).optional(),
        milestone: z.string().max(200).optional(),
        assignee: z.string().max(100).optional(),
      })
    )
    .max(100)
    .default([]),
  parent_url: httpsUrl.nullable().default(null),
  sub_issue_urls: z.array(httpsUrl).max(200).default([]),
});

export const importMappingSchema = z.object({
  status_lists: z.object({
    open_list_id: z.guid().nullish(),
    completed_list_id: z.guid().nullish(),
    not_planned_list_id: z.guid().nullish(),
  }),
  labels: z.record(z.string(), z.string()).default({}),
  /** Workspace label names every imported task carries; created when missing. */
  always_labels: z
    .array(z.string().trim().min(1).max(100))
    .max(10)
    .default(['github']),
  assignees: z.record(z.string(), z.guid()).default({}),
  authors: z.record(z.string(), z.guid()).default({}),
  milestones: z.record(z.string(), z.guid()).default({}),
});

export const MAX_IMPORT_BATCH = 25;

export const importRequestSchema = z.object({
  board_id: z.guid(),
  dry_run: z.boolean().default(false),
  /** Overwrite the name and description of already imported tasks. */
  refresh_content: z.boolean().default(false),
  mapping: importMappingSchema,
  issues: z.array(normalizedIssueSchema).min(1).max(MAX_IMPORT_BATCH),
});

export type NormalizedIssue = z.infer<typeof normalizedIssueSchema>;
export type ImportMapping = z.infer<typeof importMappingSchema>;
export type ImportRequest = z.infer<typeof importRequestSchema>;
