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

const REPO = '([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)';
const ISSUE_URL_PATTERN = new RegExp(
  `^https://github\\.com/${REPO}/issues/(\\d+)$`,
  'u'
);
const COMMENT_URL_PATTERN = new RegExp(
  `^https://github\\.com/${REPO}/issues/(\\d+)#issuecomment-\\d+$`,
  'u'
);
const PR_URL_PATTERN = new RegExp(
  `^https://github\\.com/${REPO}/pull/\\d+$`,
  'u'
);
const COMMIT_URL_PATTERN = new RegExp(
  `^https://github\\.com/${REPO}/commit/[0-9a-fA-F]{7,40}$`,
  'u'
);

const githubUrl = (pattern: RegExp, shape: string) =>
  z.string().max(2048).regex(pattern, `Must be a github.com ${shape} URL`);

const issueUrl = githubUrl(ISSUE_URL_PATTERN, 'issue');
const commentUrl = githubUrl(COMMENT_URL_PATTERN, 'issue comment');
const pullUrl = githubUrl(PR_URL_PATTERN, 'pull request');
const commitUrl = githubUrl(COMMIT_URL_PATTERN, 'commit');

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

export const normalizedIssueSchema = z
  .object({
    url: issueUrl,
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
          url: commentUrl,
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
          url: pullUrl,
          number: z.number().int().positive().optional(),
          state: z.string().max(20).nullable().optional(),
          merged: z.boolean().optional(),
          title: z.string().max(500).nullable().optional(),
        })
      )
      .max(100)
      .default([]),
    linked_commits: z
      .array(z.object({ url: commitUrl, oid: z.string().max(64).optional() }))
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
    parent_url: issueUrl.nullable().default(null),
    sub_issue_urls: z.array(issueUrl).max(200).default([]),
  })
  .superRefine((issue, ctx) => {
    // The issue and its comments must live in the declared repository, and the
    // URL's issue number must be the declared one, so a URL cannot claim a
    // different issue than the one it is stored under.
    const owns = (pattern: RegExp, url: string) => {
      const match = pattern.exec(url);
      return (
        !!match &&
        `${match[1]}/${match[2]}`.toLowerCase() === issue.repo.toLowerCase() &&
        Number(match[3]) === issue.number
      );
    };
    if (!owns(ISSUE_URL_PATTERN, issue.url)) {
      ctx.addIssue({
        code: 'custom',
        path: ['url'],
        message: 'Issue URL must match repo and number',
      });
    }
    issue.comments.forEach((comment, index) => {
      if (!owns(COMMENT_URL_PATTERN, comment.url)) {
        ctx.addIssue({
          code: 'custom',
          path: ['comments', index, 'url'],
          message: 'Comment URL must belong to this issue',
        });
      }
    });
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
