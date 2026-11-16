// @vitest-environment jsdom
/**
 * Before/after harness: typing latency and editor render counts while the same
 * delayed uploads are in flight. Skipped unless MAIL_MEDIA_HARNESS=1.
 *
 * It drives only the public surface (FloatingComposer props and the DOM), so
 * the identical file runs against the baseline source and the changed source:
 *
 *   MAIL_MEDIA_HARNESS=1 MAIL_MEDIA_HARNESS_LABEL=baseline \
 *   MAIL_MEDIA_HARNESS_OUT=/abs/path/baseline.json \
 *   bunx vitest run --config apps/mail/vitest.config.ts \
 *     "apps/mail/src/app/[locale]/(dashboard)/[wsId]/floating-composer-media.harness.test.ts"
 *
 * Method and limits are documented in the Mail platform docs (compose media).
 * Numbers are jsdom CPU time for synchronous dispatch + React commit, not
 * browser paint latency; there is no layout engine, so no layout-shift value
 * is measured or implied.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import type { MailMailbox } from '@tuturuuu/internal-api';
import { writeFileSync } from 'node:fs';
import { createElement as h, Profiler } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FloatingComposer } from './floating-composer';

const enabled = process.env.MAIL_MEDIA_HARNESS === '1';
const RUNS = Number(process.env.MAIL_MEDIA_HARNESS_RUNS ?? 9);
const WORKLOAD = {
  attachmentFiles: 2,
  churnKeystrokes: 30,
  idleKeystrokes: 20,
  imageFiles: 3,
  releaseEveryKeystrokes: 6,
  uploadingKeystrokes: 40,
};

const api = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  upload: vi.fn(),
}));
const probe = vi.hoisted(() => ({
  editor: null as unknown,
  editors: new Set<unknown>(),
  renders: 0,
}));
vi.mock('@tuturuuu/internal-api', () => ({
  createMailDraft: api.create,
  updateMailDraft: api.update,
  copyMailDraftAttachments: vi.fn(),
  deleteMailDraftAttachment: api.remove,
  uploadMailDraftAttachment: api.upload,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tiptap/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiptap/react')>();
  return {
    ...actual,
    useEditor(...args: Parameters<typeof actual.useEditor>) {
      const editor = actual.useEditor(...args);
      probe.renders += 1;
      probe.editor = editor;
      if (editor) probe.editors.add(editor);
      return editor;
    },
  };
});
vi.mock('./mail-composer-header', () => ({ MailComposerHeader: () => null }));
vi.mock('./mail-composer-ai', () => ({ MailComposerAi: () => null }));
vi.mock('./mail-composer-send-review', () => ({
  MailComposerSendReview: () => null,
}));
vi.mock('./recipient-field', () => ({ RecipientField: () => null }));
vi.mock('@tuturuuu/ui/select', () => ({
  Select: () => null,
  SelectContent: () => null,
  SelectItem: () => null,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

const mailbox = {
  id: 'mailbox',
  address: 'sender@example.com',
  role: 'owner',
  status: 'active',
  signatureHtml: null,
  signatureText: null,
  providerLimits: { maxRecipients: 50, maxMessageBytes: 25_000_000 },
} as MailMailbox;
const initialDraft = {
  draftId: 'draft',
  to: ['recipient@example.com'],
  subject: 'Harness',
  bodyHtml: '<p>Start</p>',
  bodyText: 'Start',
};

class FakeImage {
  naturalWidth = 640;
  naturalHeight = 480;
  decode = () => Promise.resolve();
  set src(_value: string) {}
}

const pending: Array<() => void> = [];
let attachmentCounter = 0;
function installUploadMock() {
  pending.length = 0;
  attachmentCounter = 0;
  api.upload.mockImplementation(
    (
      _workspace: string,
      _mailbox: string,
      _draft: string,
      file: File,
      name: string,
      metadata?: { contentId?: string | null; disposition?: string }
    ) =>
      new Promise((resolve) => {
        pending.push(() =>
          resolve({
            attachment: {
              contentId: metadata?.contentId ?? null,
              contentType: file.type,
              disposition: metadata?.disposition ?? 'attachment',
              filename: name,
              id: `att-${++attachmentCounter}`,
              protectedUrl: null,
              sizeBytes: file.size,
            },
          })
        );
      })
  );
}
const flushMicrotasks = () =>
  act(async () => {
    for (let index = 0; index < 30; index += 1) await Promise.resolve();
  });
async function release() {
  const next = pending.shift();
  if (!next) return false;
  next();
  await flushMicrotasks();
  return true;
}

const file = (name: string, type: string) =>
  new File([new Uint8Array(2048)], name, { type });
function pick(label: string, files: File[]) {
  fireEvent.change(screen.getByLabelText(label), { target: { files } });
}
const percentile = (sorted: number[], p: number) =>
  sorted.length
    ? (sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ??
      0)
    : 0;
function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    max: sorted.at(-1) ?? 0,
    mean: sorted.length ? sum / sorted.length : 0,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
  };
}

interface RunResult {
  commits: { churn: number; idle: number; select: number; uploading: number };
  commitMs: { churn: number; idle: number; select: number; uploading: number };
  editorIdentities: number;
  editorRenders: { churn: number; idle: number; select: number; uploading: number };
  final: {
    imageElements: number;
    removeControls: number;
    uploadsCompleted: number;
  };
  immediatelyAfterSelect: { imageElements: number; removeControls: number };
  keystrokeMs: {
    afterCompletion: number[];
    churn: number[];
    idle: number[];
    uploading: number[];
  };
  transactions: number;
}

async function runOnce(): Promise<RunResult> {
  probe.editor = null;
  probe.editors = new Set();
  probe.renders = 0;
  installUploadMock();
  api.update.mockResolvedValue({ message: { id: 'draft' } });
  api.create.mockResolvedValue({ message: { id: 'draft' } });
  api.remove.mockResolvedValue(undefined);

  let phase: keyof RunResult['commits'] = 'idle';
  const commits = { churn: 0, idle: 0, select: 0, uploading: 0 };
  const commitMs = { churn: 0, idle: 0, select: 0, uploading: 0 };
  const editorRenders = { churn: 0, idle: 0, select: 0, uploading: 0 };
  const view = render(
    h(
      Profiler,
      {
        id: 'composer',
        onRender: (_id, _phase, actualDuration) => {
          commits[phase] += 1;
          commitMs[phase] += actualDuration;
        },
      },
      h(FloatingComposer, {
        initialDraft,
        mailboxes: [mailbox],
        onOpenChange: vi.fn(),
        onSend: vi.fn(),
        open: true,
        selectedMailboxId: mailbox.id,
        sending: false,
        workspaceId: 'personal',
      })
    )
  );
  await flushMicrotasks();
  const editor = probe.editor as Editor;
  let transactions = 0;
  editor.on('transaction', () => {
    transactions += 1;
  });
  const type = () => {
    const before = performance.now();
    act(() => {
      editor.commands.insertContent('x');
    });
    return performance.now() - before;
  };
  const rendersAtPhaseStart = () => probe.renders;
  const keystrokeMs: RunResult['keystrokeMs'] = {
    afterCompletion: [],
    churn: [],
    idle: [],
    uploading: [],
  };

  // Control: typing with nothing in flight.
  phase = 'idle';
  let mark = rendersAtPhaseStart();
  for (let index = 0; index < WORKLOAD.idleKeystrokes; index += 1)
    keystrokeMs.idle.push(type());
  editorRenders.idle = probe.renders - mark;

  // Select the same files in both versions; uploads are held by the mock.
  phase = 'select';
  mark = rendersAtPhaseStart();
  pick(
    'insert_images',
    Array.from({ length: WORKLOAD.imageFiles }, (_, index) =>
      file(`photo-${index + 1}.png`, 'image/png')
    )
  );
  pick(
    'attach_files',
    Array.from({ length: WORKLOAD.attachmentFiles }, (_, index) =>
      file(`notes-${index + 1}.pdf`, 'application/pdf')
    )
  );
  const immediatelyAfterSelect = {
    imageElements: view.container.querySelectorAll('.tiptap img').length,
    removeControls: view.container.querySelectorAll(
      'button[aria-label="remove_attachment"], [data-chip-remove]'
    ).length,
  };
  await flushMicrotasks();
  editorRenders.select = probe.renders - mark;

  // Typing while every upload is still in flight.
  phase = 'uploading';
  mark = rendersAtPhaseStart();
  for (let index = 0; index < WORKLOAD.uploadingKeystrokes; index += 1)
    keystrokeMs.uploading.push(type());
  editorRenders.uploading = probe.renders - mark;

  // Typing while uploads complete one by one.
  phase = 'churn';
  mark = rendersAtPhaseStart();
  for (let index = 0; index < WORKLOAD.churnKeystrokes; index += 1) {
    const completed =
      index % WORKLOAD.releaseEveryKeystrokes === 0 && (await release());
    (completed ? keystrokeMs.afterCompletion : keystrokeMs.churn).push(type());
  }
  while (await release()) {
    // Drain whatever is still held.
  }
  editorRenders.churn = probe.renders - mark;

  const final = {
    imageElements: view.container.querySelectorAll('.tiptap img').length,
    removeControls: view.container.querySelectorAll(
      'button[aria-label="remove_attachment"], [data-chip-remove]'
    ).length,
    uploadsCompleted: attachmentCounter,
  };
  const result: RunResult = {
    commits,
    commitMs,
    editorIdentities: probe.editors.size,
    editorRenders,
    final,
    immediatelyAfterSelect,
    keystrokeMs,
    transactions,
  };
  cleanup();
  return result;
}

const median = (values: number[]) => stats(values).p50;
function summarize(runs: RunResult[]) {
  const measured = runs.slice(1); // run 0 is JIT/module warm-up
  const collect = (pick: (run: RunResult) => number[]) =>
    stats(measured.flatMap(pick));
  const total = (record: Record<string, number>) =>
    Object.values(record).reduce((sum, value) => sum + value, 0);
  return {
    keystrokeMs: {
      afterCompletion: collect((run) => run.keystrokeMs.afterCompletion),
      churn: collect((run) => run.keystrokeMs.churn),
      idle: collect((run) => run.keystrokeMs.idle),
      uploading: collect((run) => run.keystrokeMs.uploading),
    },
    medianOfRunMedians: {
      uploading: median(measured.map((run) => stats(run.keystrokeMs.uploading).p50)),
    },
    perRunMedian: {
      commits: median(measured.map((run) => total(run.commits))),
      commitMs: median(measured.map((run) => total(run.commitMs))),
      editorIdentities: median(measured.map((run) => run.editorIdentities)),
      editorRenders: median(measured.map((run) => total(run.editorRenders))),
      editorRendersWhileUploading: median(
        measured.map((run) => run.editorRenders.uploading + run.editorRenders.churn)
      ),
      editorRendersAtSelect: median(measured.map((run) => run.editorRenders.select)),
      transactions: median(measured.map((run) => run.transactions)),
    },
    behavior: {
      finalImageElements: measured.map((run) => run.final.imageElements),
      finalRemoveControls: measured.map((run) => run.final.removeControls),
      imageElementsImmediatelyAfterSelect: measured.map(
        (run) => run.immediatelyAfterSelect.imageElements
      ),
      removeControlsImmediatelyAfterSelect: measured.map(
        (run) => run.immediatelyAfterSelect.removeControls
      ),
      uploadsCompleted: measured.map((run) => run.final.uploadsCompleted),
    },
  };
}

describe.skipIf(!enabled)('compose media before/after harness', () => {
  beforeAll(() => {
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => [],
    });
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(),
    });
    Object.assign(URL, {
      createObjectURL: () => 'blob:harness',
      revokeObjectURL: () => {},
    });
    vi.stubGlobal('Image', FakeImage);
    // Autosave debounce is frozen so saves are not part of the workload;
    // performance.now stays real for the measurements.
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
  });
  afterAll(() => vi.useRealTimers());
  afterEach(() => cleanup());

  it(
    'measures typing latency and editor renders under delayed uploads',
    { timeout: 300_000 },
    async () => {
      const runs: RunResult[] = [];
      for (let index = 0; index < RUNS; index += 1) runs.push(await runOnce());
      const output = {
        label: process.env.MAIL_MEDIA_HARNESS_LABEL ?? 'unlabeled',
        node: process.version,
        runs: RUNS,
        summary: summarize(runs),
        workload: WORKLOAD,
        rawRuns: runs,
      };
      const out = process.env.MAIL_MEDIA_HARNESS_OUT;
      if (out) writeFileSync(out, `${JSON.stringify(output, null, 2)}\n`);
      console.log(`MAIL_MEDIA_HARNESS_RESULT ${JSON.stringify(output.summary)}`);
      // The workload itself must complete identically on both versions.
      expect(output.summary.behavior.uploadsCompleted.every((n) => n === 5)).toBe(
        true
      );
    }
  );
});
