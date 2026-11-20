import type {
  MeetFormsAnswer,
  MeetFormsAnswers,
  MeetFormsDefinition,
  MeetFormsGates,
  MeetFormsLogicRule,
  MeetFormsQuestion,
  MeetFormsSection,
} from './types';

export function plainFormText(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`{3}[\s\S]*?`{3}/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_~]+/g, '')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isContent(question: MeetFormsQuestion) {
  return (
    question.type === 'section_break' ||
    question.type === 'divider' ||
    question.type === 'rich_text' ||
    question.type === 'image' ||
    question.type === 'youtube'
  );
}

export function isGatedQuestion(
  question: MeetFormsQuestion,
  gates: MeetFormsGates | undefined
) {
  switch (question.type) {
    case 'matrix':
      return !gates?.matrix;
    case 'file_upload':
      return !gates?.uploads;
    default:
      return false;
  }
}

export function isAnswered(value: MeetFormsAnswer | undefined) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).some((item) => item.trim() !== '');
  }
  return typeof value === 'number' || Boolean(value?.trim());
}

function matchesRule(
  rule: MeetFormsLogicRule,
  questions: Map<string, MeetFormsQuestion>,
  answers: MeetFormsAnswers
) {
  const questionId = rule.sourceQuestionId;
  if (!questionId) return rule.triggerType === 'section_end';
  const comparison = rule.comparisonValue?.trim();
  const value = answers[questionId];
  if (
    !comparison ||
    value == null ||
    (typeof value === 'object' && !Array.isArray(value))
  ) {
    return false;
  }

  const question = questions.get(questionId);
  const optionValue = question?.options?.find(
    (option) =>
      plainFormText(option.label).toLowerCase() ===
      plainFormText(comparison).toLowerCase()
  )?.value;
  const comparisons = optionValue ? [comparison, optionValue] : [comparison];
  const values = (Array.isArray(value) ? value : [String(value)])
    .map((item) => item.trim())
    .filter(Boolean);
  if (values.length === 0) return false;

  switch (rule.operator ?? 'equals') {
    case 'not_equals':
      return comparisons.some((candidate) =>
        values.every((item) => item !== candidate)
      );
    case 'equals':
      return values.some((item) => comparisons.includes(item));
    case 'contains':
      return values.some((item) =>
        comparisons.some((candidate) =>
          item.toLowerCase().includes(candidate.toLowerCase())
        )
      );
  }
}

function nextSectionId(
  form: MeetFormsDefinition,
  section: MeetFormsSection,
  questions: Map<string, MeetFormsQuestion>,
  answers: MeetFormsAnswers
) {
  const rules = form.logicRules ?? [];
  const ids = new Set(section.questions.map((question) => question.id));
  const matchedRule =
    rules.find(
      (rule) =>
        rule.triggerType === 'section_end' &&
        (rule.sourceSectionId ?? '').trim() === section.id &&
        matchesRule(rule, questions, answers)
    ) ??
    rules.find(
      (rule) =>
        rule.triggerType !== 'section_end' &&
        rule.sourceQuestionId &&
        ids.has(rule.sourceQuestionId) &&
        matchesRule(rule, questions, answers)
    );

  if (matchedRule) {
    return matchedRule.actionType === 'submit'
      ? null
      : (matchedRule.targetSectionId ?? '');
  }
  const index = form.sections.indexOf(section);
  return form.sections[index + 1]?.id ?? null;
}

export function planMeetFormsPath(
  form: MeetFormsDefinition,
  answers: MeetFormsAnswers,
  gates?: MeetFormsGates
) {
  const sections = new Map(
    form.sections.map((section) => [section.id, section])
  );
  const questions = new Map(
    form.sections.flatMap((section) =>
      section.questions.map((question) => [question.id, question] as const)
    )
  );
  const path: MeetFormsSection[] = [];
  const visited = new Set<string>();
  const scopedAnswers: MeetFormsAnswers = Object.create(null);
  let sectionId: string | null = form.sections[0]?.id ?? null;

  while (sectionId !== null) {
    const section = sections.get(sectionId);
    if (!section || visited.has(sectionId)) {
      return { path, answers: scopedAnswers, invalid: true };
    }
    visited.add(sectionId);
    path.push(section);
    for (const question of section.questions) {
      const answer = answers[question.id];
      if (
        Object.hasOwn(answers, question.id) &&
        answer !== undefined &&
        !isContent(question) &&
        !isGatedQuestion(question, gates) &&
        isAnswered(answer)
      ) {
        scopedAnswers[question.id] = answer;
      }
    }
    sectionId = nextSectionId(form, section, questions, scopedAnswers);
  }
  return { path, answers: { ...scopedAnswers }, invalid: false };
}

export function mergeMeetFormsPrefill(
  form: MeetFormsDefinition,
  answers: MeetFormsAnswers,
  prefill: MeetFormsAnswers
) {
  let next = answers;
  for (const question of form.sections.flatMap(
    (section) => section.questions
  )) {
    if (
      question.type !== 'short_text' &&
      question.type !== 'long_text' &&
      question.type !== 'email'
    ) {
      continue;
    }

    const suggested = prefill[question.id];
    if (
      Object.hasOwn(answers, question.id) ||
      !Object.hasOwn(prefill, question.id) ||
      typeof suggested !== 'string' ||
      !suggested.trim()
    ) {
      continue;
    }
    next = { ...next, [question.id]: suggested };
  }
  return next;
}

export function questionIssue(
  question: MeetFormsQuestion,
  value: MeetFormsAnswer | undefined
): 'requiredError' | 'invalidError' | undefined {
  if (isContent(question)) return;
  if (!isAnswered(value))
    return question.required ? 'requiredError' : undefined;
  if (question.type === 'matrix') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return 'invalidError';
    }
    const selection = value;
    if (
      question.required &&
      question.rows.some((row) => !Object.hasOwn(selection, row.id))
    ) {
      return 'requiredError';
    }
    const rows = new Set(question.rows.map((row) => row.id));
    const columns = new Set(question.columns.map((column) => column.id));
    if (
      Object.entries(selection).some(
        ([row, column]) => !rows.has(row) || !columns.has(column)
      )
    ) {
      return 'invalidError';
    }
  }
  if (question.type === 'file_upload') {
    if (
      !Array.isArray(value) ||
      (!question.multiple && value.length !== 1) ||
      value.some((reference) => !reference.trim())
    ) {
      return 'invalidError';
    }
  }
  if (question.type === 'ranking') {
    const options = question.options ?? [];
    const list = Array.isArray(value) ? value : [];
    const order = new Set(list);
    if (
      list.length !== options.length ||
      order.size !== options.length ||
      options.some((option) => !order.has(option.value))
    ) {
      return 'invalidError';
    }
  }
}
