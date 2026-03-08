import { normalizeMarkdownForComparison } from './content';
import type { FormDefinition, FormDefinitionSection } from './types';

export function normalizeAnswer(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.trim() ? [value.trim()] : [];
  }

  if (typeof value === 'number') {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export function matchesRule(
  operator: 'equals' | 'not_equals' | 'contains',
  comparisonValue: string,
  answer: unknown
): boolean {
  const normalizedAnswer = normalizeAnswer(answer);
  const normalizedComparison = comparisonValue.trim();

  if (!normalizedComparison) {
    return false;
  }

  switch (operator) {
    case 'equals':
      return normalizedAnswer.some((value) => value === normalizedComparison);
    case 'not_equals':
      return normalizedAnswer.length > 0
        ? normalizedAnswer.every((value) => value !== normalizedComparison)
        : false;
    case 'contains':
      return normalizedAnswer.some((value) =>
        value.toLowerCase().includes(normalizedComparison.toLowerCase())
      );
  }
}

export function getOrderedSections(
  form: FormDefinition
): FormDefinitionSection[] {
  return form.sections;
}

export function getNextSectionTarget(
  form: FormDefinition,
  currentSectionId: string,
  answers: Record<string, unknown>
): { type: 'next' | 'section' | 'submit'; targetSectionId?: string } {
  const sections = getOrderedSections(form);
  const currentIndex = sections.findIndex(
    (section) => section.id === currentSectionId
  );

  if (currentIndex === -1) {
    return { type: 'submit' };
  }

  const questionIds = new Set(
    sections[currentIndex]?.questions.map((question) => question.id)
  );
  const questionMap = new Map(
    form.sections.flatMap((section) =>
      section.questions.map((question) => [question.id, question] as const)
    )
  );
  const matchingRule = form.logicRules
    .filter((rule) => questionIds.has(rule.sourceQuestionId))
    .find((rule) => {
      const sourceQuestion = questionMap.get(rule.sourceQuestionId);
      const comparisons = new Set([rule.comparisonValue.trim()]);

      if (sourceQuestion) {
        const matchedOption = sourceQuestion.options.find(
          (option) =>
            normalizeMarkdownForComparison(option.label) ===
            normalizeMarkdownForComparison(rule.comparisonValue)
        );

        if (matchedOption?.value) {
          comparisons.add(matchedOption.value);
        }
      }

      return [...comparisons].some((comparisonValue) =>
        matchesRule(
          rule.operator,
          comparisonValue,
          answers[rule.sourceQuestionId]
        )
      );
    });

  if (matchingRule) {
    if (matchingRule.actionType === 'submit') {
      return { type: 'submit' };
    }

    if (matchingRule.targetSectionId) {
      return { type: 'section', targetSectionId: matchingRule.targetSectionId };
    }
  }

  const nextSection = sections[currentIndex + 1];
  return nextSection
    ? { type: 'next', targetSectionId: nextSection.id }
    : { type: 'submit' };
}

export function getReachableSectionIds(
  form: FormDefinition,
  answers: Record<string, unknown>
): string[] {
  const sections = getOrderedSections(form);

  if (sections.length === 0) {
    return [];
  }

  const reachable = new Set<string>();
  let currentSection = sections[0];
  let safety = 0;

  while (currentSection && safety < sections.length + 8) {
    reachable.add(currentSection.id);
    const target = getNextSectionTarget(form, currentSection.id, answers);

    if (target.type === 'submit') {
      break;
    }

    currentSection = sections.find(
      (section) => section.id === target.targetSectionId
    );
    safety += 1;
  }

  return sections
    .filter((section) => reachable.has(section.id))
    .map((section) => section.id);
}

export function getReachableQuestionIds(
  form: FormDefinition,
  answers: Record<string, unknown>
): string[] {
  const reachableSections = new Set(getReachableSectionIds(form, answers));

  return form.sections
    .filter((section) => reachableSections.has(section.id))
    .flatMap((section) => section.questions.map((question) => question.id));
}
