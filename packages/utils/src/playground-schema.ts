import { PLAYGROUND_LANGUAGES } from '@tuturuuu/types/primitives/playgrounds';
import { z } from 'zod';

function hasDirectoryConflict(paths: string[]) {
  const inventory = new Set(paths);
  return paths.some((path) => {
    const pieces = path.split('/');
    return pieces
      .slice(0, -1)
      .some((_, index) => inventory.has(pieces.slice(0, index + 1).join('/')));
  });
}

function validPreviewPath(path: string) {
  if (!path.startsWith('/') || /[\r\n\0\\]/.test(path)) return false;
  try {
    const pathname = decodeURIComponent(path.split(/[?#]/, 1)[0]!);
    return (
      pathname === '/' ||
      (!/[\r\n\0\\]/.test(pathname) &&
        pathname
          .slice(1)
          .split('/')
          .every((part) => part !== '' && part !== '.' && part !== '..'))
    );
  } catch {
    return false;
  }
}

export const PLAYGROUND_BYTES = 2 * 1024 * 1024;
export const PlaygroundPath = z
  .string()
  .min(1)
  .max(240)
  .refine(
    (path) =>
      path
        .split('/')
        .every(
          (part) =>
            /^[a-zA-Z0-9_.@+-]+$/.test(part) && part !== '.' && part !== '..'
        ) &&
      !path
        .split('/')
        .some((part) =>
          ['node_modules', '.git', '__pycache__', 'target', '.venv'].includes(
            part
          )
        )
  );
export const PlaygroundFiles = z
  .array(
    z
      .object({
        path: PlaygroundPath,
        content: z
          .string()
          .max(256 * 1024)
          .refine(
            (value) =>
              !value.includes('\0') &&
              new TextEncoder().encode(value).byteLength <= 256 * 1024
          ),
      })
      .strict()
  )
  .max(128)
  .superRefine((files, ctx) => {
    if (new Set(files.map((file) => file.path)).size !== files.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate file paths' });
    if (
      files.reduce(
        (size, file) => size + new TextEncoder().encode(file.content).length,
        0
      ) > PLAYGROUND_BYTES
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Project exceeds storage limit',
      });
    const paths = files.map((file) => file.path).sort();
    if (hasDirectoryConflict(paths))
      ctx.addIssue({
        code: 'custom',
        message: 'File conflicts with directory',
      });
  });
export const PlaygroundCreate = z
  .object({
    name: z.string().trim().min(1).max(80),
    language: z.enum(PLAYGROUND_LANGUAGES),
  })
  .strict();
export const PlaygroundSave = z
  .object({
    revision: z.number().int().nonnegative(),
    files: PlaygroundFiles,
    command: z
      .string()
      .min(1)
      .max(4096)
      .refine((value) => !value.includes('\0')),
  })
  .strict();
export const PlaygroundJob = z
  .object({
    projectId: z.guid(),
    revision: z.number().int().nonnegative(),
    language: z.enum(PLAYGROUND_LANGUAGES),
    operation: z.enum(['run', 'stop', 'preview']),
    files: PlaygroundFiles.optional(),
    command: z.string().max(4096).optional(),
    stdin: z.string().max(65536).optional(),
    port: z.number().int().min(1024).max(65535).optional(),
    path: z.string().max(2048).optional(),
  })
  .strict()
  .superRefine((job, ctx) => {
    if (
      job.operation === 'run' &&
      (!job.files || !job.command || job.command.includes('\0'))
    )
      ctx.addIssue({ code: 'custom', message: 'Missing run payload' });
    if (
      job.operation === 'preview' &&
      (!job.port || !job.path || !validPreviewPath(job.path))
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid preview request' });
  });
export type PlaygroundJobPayload = z.infer<typeof PlaygroundJob>;

/** Full path inventory plus changed text; unchanged file bytes never cross the callback. */
export const PlaygroundDelta = PlaygroundSave.extend({
  paths: z.array(PlaygroundPath).max(128),
}).superRefine((value, ctx) => {
  const paths = [...value.paths].sort();
  if (
    new Set(paths).size !== paths.length ||
    hasDirectoryConflict(paths) ||
    value.files.some((file) => !paths.includes(file.path))
  )
    ctx.addIssue({ code: 'custom', message: 'Invalid delta inventory' });
});

/** Authenticated runner export merged into the room before Drive persistence. */
export const PlaygroundRunnerExport = z
  .object({
    revision: z.number().int().nonnegative(),
    files: PlaygroundFiles,
    paths: z.array(PlaygroundPath).max(128),
    baseline: z.record(PlaygroundPath, z.string().regex(/^[a-f0-9]{64}$/)),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.paths).size === value.paths.length &&
      !hasDirectoryConflict(value.paths) &&
      value.files.every((file) => value.paths.includes(file.path)),
    'Invalid runner inventory'
  );

export const PlaygroundPreviewCapability = z
  .object({
    aud: z.literal('tuturuuu.playground-preview'),
    ownerId: z.guid(),
    projectId: z.guid(),
    port: z.number().int().min(1024).max(65535),
    meetingId: z.guid().optional(),
    roomId: z.guid().optional(),
    exp: z.number().int().positive(),
  })
  .strict();
