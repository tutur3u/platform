import { getReachableQuestionIds } from './branching';
import {
  formMatrixAnswerSchema,
  formPublishedAnswersSchema,
  formUploadAnswerSchema,
  type PublishedFormAnswers,
  type PublishedFormDefinition,
} from './published-schema';
import { validateQuestionValue } from './validation';

export function validatePublishedFormAnswers(
  form: PublishedFormDefinition,
  input: unknown
):
  | { valid: true; answers: PublishedFormAnswers; reachable: Set<string> }
  | { valid: false; questionIds: string[] } {
  const parsed = formPublishedAnswersSchema.safeParse(input);
  if (!parsed.success) return { valid: false, questionIds: [] };

  const reachable = new Set(getReachableQuestionIds(form, parsed.data));
  const questionIds: string[] = [];
  const answers: PublishedFormAnswers = {};

  for (const question of form.sections.flatMap(
    (section) => section.questions
  )) {
    if (!reachable.has(question.id)) continue;
    const value = parsed.data[question.id];
    const omitted =
      value == null ||
      (typeof value === 'string' && !value.trim()) ||
      (Array.isArray(value) && value.length === 0);

    if (omitted) {
      if (question.required) questionIds.push(question.id);
      continue;
    }

    if (question.type === 'matrix') {
      const matrix = formMatrixAnswerSchema.safeParse(value);
      const rows = new Set(question.rows.map(({ id }) => id));
      const columns = new Set(question.columns.map(({ id }) => id));
      if (
        !matrix.success ||
        (question.required && Object.keys(matrix.data).length !== rows.size) ||
        Object.entries(matrix.data).some(
          ([row, column]) => !rows.has(row) || !columns.has(column)
        )
      ) {
        questionIds.push(question.id);
        continue;
      }
    } else if (question.type === 'file_upload') {
      const upload = formUploadAnswerSchema.safeParse(value);
      if (!upload.success || upload.data.length > question.maxFiles) {
        questionIds.push(question.id);
        continue;
      }
    } else if (
      (!Array.isArray(value) && typeof value === 'object') ||
      !validateQuestionValue(value, question.settings, question.type).valid
    ) {
      questionIds.push(question.id);
      continue;
    }

    answers[question.id] = value;
  }

  return questionIds.length
    ? { valid: false, questionIds }
    : { valid: true, answers, reachable };
}
