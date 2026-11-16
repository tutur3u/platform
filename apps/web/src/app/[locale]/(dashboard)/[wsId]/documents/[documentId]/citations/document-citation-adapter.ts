import {
  type CitationFields,
  type CitationStyle,
  type CiteWork,
  CiteWorkSchema,
  citationFieldsSchema,
  type FormattedOutput,
  formatDocument,
  fromLegacyCitationFields,
  issuedYear,
  toPlainText,
  validateCitation,
} from '@tuturuuu/cite';
import type {
  CitationAdapter,
  CitationCapture,
  CitationFormattedRun,
  CitationLibraryAdapter,
  CitationRepair,
  CitationResult,
  CitationSnapshot,
  CitationSnapshotInspection,
  CitationWorkSummary,
  DocumentCitation,
  FormattedDocumentCitations,
} from '@tuturuuu/ui/text-editor/citation';
import { groupCitationWorks } from './document-citation-groups';
import { editableWork } from './manual-work-edit';

/** Version of the `cite-work` snapshot envelope stored in document JSON. */
export const CITE_WORK_SNAPSHOT_VERSION = 1;

/**
 * Transport the host wires from `@tuturuuu/internal-api`. Every member is
 * optional: an absent library or repair transport renders a typed unavailable
 * state instead of placeholder data.
 */
export interface DocumentCitationTransport {
  library?: CitationLibraryAdapter;
  capture?: (input: string) => Promise<CitationResult<CitationCapture>>;
  repair?: {
    createOperationId(): string;
    /** A readable snapshot is sent as a work; an unreadable one as raw text. */
    run(
      input: { work: CiteWork } | { raw: string },
      operationId: string
    ): Promise<CitationResult<CitationRepair>>;
  };
}

const MAX_RAW_REPAIR_LENGTH = 4000;

export function summarizeWork(work: CiteWork): CitationWorkSummary {
  const contributorsForSummary = work.authors.length
    ? work.authors
    : work.editors;
  const names = contributorsForSummary.map((author) =>
    author.kind === 'person' ? author.family : author.name
  );
  const contributors =
    names.length > 2 ? `${names[0]} et al.` : names.join(' & ');
  const year = issuedYear(work);
  return {
    title: work.title,
    contributors,
    year: year ? String(year) : null,
  };
}

/** Reads a stored snapshot into a canonical work; null when unreadable. */
export function snapshotWork(snapshot: CitationSnapshot): CiteWork | null {
  if (snapshot.kind === 'cite-work') {
    if (snapshot.version !== CITE_WORK_SNAPSHOT_VERSION) return null;
    const parsed = CiteWorkSchema.safeParse(snapshot.work);
    return parsed.success ? parsed.data : null;
  }
  if (snapshot.version !== 1) return null;
  const fields = citationFieldsSchema.safeParse(snapshot.fields);
  if (!fields.success) return null;
  try {
    return fromLegacyCitationFields(fields.data as CitationFields);
  } catch {
    return null;
  }
}

function rawTitle(snapshot: CitationSnapshot): string {
  const source =
    snapshot.kind === 'cite-work' ? snapshot.work : snapshot.fields;
  const title =
    typeof source === 'object' && source !== null && 'title' in source
      ? (source as { title: unknown }).title
      : null;
  return typeof title === 'string' ? title.trim() : '';
}

export function inspectCitationSnapshot(
  snapshot: CitationSnapshot,
  style: CitationStyle
): CitationSnapshotInspection {
  const work = snapshotWork(snapshot);
  if (!work) {
    const title = rawTitle(snapshot);
    return {
      status: 'invalid',
      summary: title ? { title, contributors: '', year: null } : null,
    };
  }
  return {
    status: 'valid',
    summary: summarizeWork(work),
    issues: validateCitation(work, style).map(({ field, severity }) => ({
      field,
      severity,
    })),
  };
}

/** Copies the formatter's allowlisted runs; marks stay data, never HTML. */
export function toCitationRuns(
  output: FormattedOutput
): CitationFormattedRun[] {
  return output.runs.map((run) => ({
    text: run.text,
    ...(run.italic ? { italic: true as const } : {}),
    ...(run.bold ? { bold: true as const } : {}),
    ...(run.vertical ? { vertical: run.vertical } : {}),
    ...(run.href ? { href: run.href } : {}),
  }));
}

/**
 * Formats every placed citation in one engine pass. Sources that resolve to the
 * same canonical work share one reference entry; unreadable snapshots are
 * reported per citation rather than failing the document.
 */
export function formatDocumentCitations(
  style: CitationStyle,
  citations: readonly DocumentCitation[]
): FormattedDocumentCitations {
  const works: CiteWork[] = [];
  const workIdByGroup = new Map<number, string>();
  const placed: { citation: DocumentCitation; workId: string }[] = [];
  const issues: FormattedDocumentCitations['issues'] = [];
  const readable: { citation: DocumentCitation; work: CiteWork }[] = [];

  for (const citation of citations) {
    const work = snapshotWork(citation.snapshot);
    if (!work) {
      issues.push({ citationId: citation.citationId, code: 'invalid-work' });
      continue;
    }
    readable.push({ citation, work });
  }

  const groups = groupCitationWorks(readable.map(({ work }) => work));
  for (const [index, { citation, work }] of readable.entries()) {
    const group = groups[index] ?? index;
    let workId = workIdByGroup.get(group);
    if (!workId) {
      workId = `w${works.length}`;
      workIdByGroup.set(group, workId);
      works.push({ ...work, id: workId });
    }
    placed.push({ citation, workId });
  }

  if (placed.length === 0) return { inText: {}, bibliography: [], issues };

  const result = formatDocument({
    style,
    works,
    citations: placed.map(({ citation, workId }) => ({
      id: citation.citationId,
      items: [
        {
          workId,
          suppressAuthor: citation.suppressAuthor,
          ...(citation.locator
            ? { label: citation.locator.label, locator: citation.locator.value }
            : {}),
        },
      ],
    })),
  });

  const citationIdsByWork = new Map<string, string[]>();
  for (const { citation, workId } of placed) {
    citationIdsByWork.set(workId, [
      ...(citationIdsByWork.get(workId) ?? []),
      citation.citationId,
    ]);
  }
  const workErrors = new Set(
    result.issues
      .filter((entry) =>
        entry.issues.some((issue) => issue.severity === 'error')
      )
      .map((entry) => entry.workId)
  );
  for (const { citation, workId } of placed) {
    if (workErrors.has(workId)) {
      issues.push({ citationId: citation.citationId, code: 'missing-fields' });
    }
  }

  return {
    inText: Object.fromEntries(
      result.citations.map(({ id, output }) => [id, toPlainText(output)])
    ),
    bibliography: result.bibliography.map(({ workId, output }) => ({
      key: workId,
      text: toPlainText(output),
      runs: toCitationRuns(output),
      citationIds: citationIdsByWork.get(workId) ?? [],
    })),
    issues,
  };
}

export function createCitationSnapshot(
  work: unknown,
  libraryVersion: number | null,
  now: () => Date = () => new Date()
): CitationSnapshot | null {
  const parsed = CiteWorkSchema.safeParse(work);
  if (!parsed.success) return null;
  return {
    kind: 'cite-work',
    version: CITE_WORK_SNAPSHOT_VERSION,
    work: parsed.data,
    capturedAt: now().toISOString(),
    libraryVersion,
  };
}

export function createDocumentCitationAdapter(
  transport: DocumentCitationTransport
): Omit<CitationAdapter, 'renderManualEditor'> {
  const { capture, repair } = transport;
  return {
    formatDocument: formatDocumentCitations,
    inspectSnapshot: inspectCitationSnapshot,
    createSnapshot: (work, libraryVersion) =>
      createCitationSnapshot(work, libraryVersion),
    library: transport.library,
    canEditWork: (work) => editableWork(work) !== null,
    capture: capture
      ? { lookup: capture, searchTitle: (title) => capture(`title:${title}`) }
      : undefined,
    repair: repair
      ? {
          createOperationId: repair.createOperationId,
          run: (snapshot, operationId) => {
            const work = snapshotWork(snapshot);
            const raw = JSON.stringify(
              snapshot.kind === 'cite-work' ? snapshot.work : snapshot.fields
            ).slice(0, MAX_RAW_REPAIR_LENGTH);
            return repair.run(work ? { work } : { raw }, operationId);
          },
          // One pasted reference, bounded like an unreadable snapshot.
          runRaw: (input, operationId) =>
            repair.run(
              { raw: input.trim().slice(0, MAX_RAW_REPAIR_LENGTH) },
              operationId
            ),
        }
      : undefined,
  };
}
