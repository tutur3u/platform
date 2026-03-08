import type { UseFormReturn } from '@tuturuuu/ui/hooks/use-form';

import { createDefaultFormStudioInput, type FormStudioInput } from '../schema';
import { getThemePreset } from '../theme';
import type { FormDefinition } from '../types';

export type StudioForm = UseFormReturn<FormStudioInput, any, FormStudioInput>;
export type FormFontId = FormStudioInput['theme']['headlineFontId'];
export type StudioSectionInput = FormStudioInput['sections'][number];
export type StudioQuestionInput = StudioSectionInput['questions'][number];
export type StudioOptionInput = StudioQuestionInput['options'][number];

export function getOffsetOptionId<T extends { id: string }>(
  options: readonly T[],
  currentId: string,
  offset: number
) {
  const currentIndex = options.findIndex((option) => option.id === currentId);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex =
    (safeIndex + offset + options.length * Math.abs(offset)) % options.length;

  return options[nextIndex]?.id ?? options[0]?.id ?? currentId;
}

export function getRandomOptionId<T extends { id: string }>(
  options: readonly T[],
  currentId?: string
) {
  const availableOptions = currentId
    ? options.filter((option) => option.id !== currentId)
    : [...options];

  if (!availableOptions.length) {
    return currentId ?? options[0]?.id ?? '';
  }

  return availableOptions[Math.floor(Math.random() * availableOptions.length)]!
    .id;
}

export function applyThemePreset(form: StudioForm, presetId: string) {
  const preset = getThemePreset(presetId);

  form.setValue('theme.presetId', preset.id, {
    shouldDirty: true,
  });
  form.setValue('theme.accentColor', preset.accentColor, {
    shouldDirty: true,
  });
  form.setValue('theme.headlineFontId', preset.headlineFontId, {
    shouldDirty: true,
  });
  form.setValue('theme.bodyFontId', preset.bodyFontId, {
    shouldDirty: true,
  });
  form.setValue('theme.surfaceStyle', preset.surfaceStyle, {
    shouldDirty: true,
  });
  form.setValue('theme.coverKicker', preset.kicker, {
    shouldDirty: true,
  });
}

export function createClientId() {
  const webCrypto =
    typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  const formatUuid = (bytes: ArrayLike<number>) => {
    const hex = Array.from(bytes, (byte: number) =>
      byte.toString(16).padStart(2, '0')
    );

    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  };

  if (webCrypto?.randomUUID) {
    return webCrypto.randomUUID();
  }

  if (webCrypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    const versionByte = bytes[6] ?? 0;
    const variantByte = bytes[8] ?? 0;
    bytes[6] = (versionByte & 0x0f) | 0x40;
    bytes[8] = (variantByte & 0x3f) | 0x80;

    return formatUuid(bytes);
  }

  const fallbackBytes = new Uint8Array(16);
  fallbackBytes.forEach((_, index) => {
    fallbackBytes[index] = Math.floor(Math.random() * 256);
  });
  const fallbackVersionByte = fallbackBytes[6] ?? 0;
  const fallbackVariantByte = fallbackBytes[8] ?? 0;
  fallbackBytes[6] = (fallbackVersionByte & 0x0f) | 0x40;
  fallbackBytes[8] = (fallbackVariantByte & 0x3f) | 0x80;

  return formatUuid(fallbackBytes);
}

function duplicateOptionInput(
  option: StudioOptionInput
): StudioOptionInput & { id: string } {
  return {
    ...option,
    id: createClientId(),
    image: {
      storagePath: option.image?.storagePath ?? '',
      url: option.image?.url ?? '',
      alt: option.image?.alt ?? '',
    },
  };
}

export function duplicateQuestionInput(
  question: StudioQuestionInput
): StudioQuestionInput & { id: string } {
  return {
    ...question,
    id: createClientId(),
    settings: {
      ...question.settings,
    },
    options: question.options.map((option) => duplicateOptionInput(option)),
  };
}

export function duplicateSectionInput(
  section: StudioSectionInput
): StudioSectionInput & { id: string } {
  return {
    ...section,
    id: createClientId(),
    image: {
      storagePath: section.image?.storagePath ?? '',
      url: section.image?.url ?? '',
      alt: section.image?.alt ?? '',
    },
    questions: section.questions.map((question) =>
      duplicateQuestionInput(question)
    ),
  };
}

export function ensureIdentifiers(input: FormStudioInput): FormStudioInput {
  return {
    ...input,
    sections: input.sections.map((section) => ({
      ...section,
      id: section.id ?? createClientId(),
      questions: section.questions.map((question) => ({
        ...question,
        id: question.id ?? createClientId(),
        options: question.options.map((option) => ({
          ...option,
          id: option.id ?? createClientId(),
          image: option.image ?? {
            storagePath: '',
            url: '',
            alt: '',
          },
        })),
      })),
    })),
    logicRules: input.logicRules.map((rule) => ({
      ...rule,
      id: rule.id ?? createClientId(),
    })),
  };
}

export function toStudioInput(form?: FormDefinition): FormStudioInput {
  if (!form) {
    return ensureIdentifiers(createDefaultFormStudioInput());
  }

  return ensureIdentifiers({
    title: form.title,
    description: form.description,
    status: form.status,
    accessMode: form.accessMode,
    openAt: form.openAt,
    closeAt: form.closeAt,
    maxResponses: form.maxResponses,
    theme: form.theme,
    settings: form.settings,
    sections: form.sections.map((section) => ({
      id: section.id,
      title: section.title,
      description: section.description,
      image: section.image,
      questions: section.questions.map((question) => ({
        id: question.id,
        type: question.type,
        title: question.title,
        description: question.description,
        required: question.required,
        settings: question.settings,
        options: question.options.map((option) => ({
          id: option.id,
          label: option.label,
          value: option.value,
          image: option.image,
        })),
      })),
    })),
    logicRules: form.logicRules.map((rule) => ({
      id: rule.id,
      sourceQuestionId: rule.sourceQuestionId,
      operator: rule.operator,
      comparisonValue: rule.comparisonValue,
      actionType: rule.actionType,
      targetSectionId: rule.targetSectionId,
    })),
  });
}

export function toPreviewDefinition(
  values: FormStudioInput,
  base: { id: string; wsId: string; creatorId: string }
): FormDefinition {
  const resolvedSectionImages = Object.fromEntries(
    values.sections.map((section, index) => [
      section.id ?? `section:${index}`,
      section.image,
    ])
  );

  return {
    id: base.id,
    wsId: base.wsId,
    creatorId: base.creatorId,
    title: values.title,
    description: values.description,
    status: values.status,
    accessMode: values.accessMode,
    openAt: values.openAt ?? null,
    closeAt: values.closeAt ?? null,
    maxResponses: values.maxResponses ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    shareCode: null,
    theme: {
      ...values.theme,
      sectionImages: resolvedSectionImages,
    },
    settings: values.settings,
    sections: values.sections.map((section) => ({
      ...section,
      id: section.id ?? createClientId(),
      questions: section.questions.map((question) => ({
        ...question,
        id: question.id ?? createClientId(),
        sectionId: section.id ?? createClientId(),
        options: question.options.map((option) => ({
          id: option.id ?? createClientId(),
          label: option.label,
          value: option.value,
          image: option.image,
        })),
      })),
    })),
    logicRules: values.logicRules.map((rule) => ({
      ...rule,
      id: rule.id ?? createClientId(),
    })),
  };
}
