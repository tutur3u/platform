import {
  batchUpsert,
  createMigrationResponse,
  requireDevMode,
} from '../batch-upsert';

const MAX_LESSON_CONTENT_LENGTH = 65_536;
const MAX_LESSON_TITLE_LENGTH = 512;

function normalizeLessonPayload(data: unknown): unknown[] {
  if (!Array.isArray(data)) return [];

  return data.map((row) => {
    if (!row || typeof row !== 'object') return row;

    const record = row as Record<string, unknown>;
    const rawTitle = record.title;
    const title =
      typeof rawTitle === 'string'
        ? rawTitle.slice(0, MAX_LESSON_TITLE_LENGTH)
        : rawTitle;
    const rawContent = record.content;
    const content =
      typeof rawContent === 'string'
        ? rawContent.slice(0, MAX_LESSON_CONTENT_LENGTH)
        : rawContent;

    return {
      ...record,
      title,
      content,
    };
  });
}

export async function PUT(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const json = await req.json();
  const result = await batchUpsert({
    table: 'user_group_posts',
    data: normalizeLessonPayload(json?.data),
  });
  return createMigrationResponse(result, 'lessons');
}
