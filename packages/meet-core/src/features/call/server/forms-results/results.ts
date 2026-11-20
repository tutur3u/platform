import { sanitizeSpreadsheetText } from '@tuturuuu/utils/spreadsheet-text';
import { z } from 'zod';
import { buildSafeCsv } from '../../lib/csv-export';

const count = z.number().int().nonnegative();
const question = z.object({
  id: z.string(),
  title: z.string(),
  answeredCount: count,
  breakdown: z.array(z.object({ label: z.string(), count })),
});

const aggregate = z.object({
  meetingId: z.uuid(),
  launchId: z.uuid(),
  formId: z.guid(),
  versionId: z.uuid(),
  title: z.string(),
  responseCount: count,
  questions: z.array(question),
});

const source = z.discriminatedUnion('responseMode', [
  aggregate.extend({ responseMode: z.literal('anonymous') }),
  aggregate.extend({ responseMode: z.literal('named') }),
]);

export type FormsResults = Omit<z.output<typeof source>, 'meetingId'>;

export class FormsResultsAccessError extends Error {
  constructor(readonly status: 403 | 404) {
    super(
      status === 403
        ? 'Form results are restricted to the host'
        : 'Form launch not found'
    );
  }
}

export async function readFormsResults(
  scope: { isHost: boolean; meetingId: string; launchId: string },
  read: () => Promise<unknown>
): Promise<FormsResults> {
  if (!scope.isHost) throw new FormsResultsAccessError(403);

  const snapshot = await read();
  if (snapshot === null) throw new FormsResultsAccessError(404);

  const { meetingId, ...results } = source.parse(snapshot);
  if (meetingId !== scope.meetingId || results.launchId !== scope.launchId) {
    throw new FormsResultsAccessError(404);
  }
  return results;
}

export function exportFormsResults(results: FormsResults): string {
  const rows = results.questions.flatMap((question) => {
    const title = sanitizeSpreadsheetText(question.title);
    const baseline = [title, question.answeredCount];
    if (!question.breakdown.length) return [[...baseline, '', '']];
    return question.breakdown.map(({ label, count }) => [
      ...baseline,
      sanitizeSpreadsheetText(label),
      count,
    ]);
  });

  return buildSafeCsv([
    ['Response mode', 'Responses', 'Question', 'Answered', 'Option', 'Count'],
    [results.responseMode, results.responseCount, '', '', '', ''],
    ...rows.map((row) => ['', '', ...row]),
  ]);
}
