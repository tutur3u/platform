import { deriveUniqueOptionValue } from '../answer-utils';
import type { FormQuestionInput } from '../schema';
import { createClientId, type StudioQuestionInput } from './studio-utils';

type TFunction = (...args: any[]) => string;
type CreatedQuestionInput = StudioQuestionInput & { id: string };

function createEmptyImage() {
  return {
    storagePath: '',
    url: '',
    alt: '',
  };
}

export const FIELD_BLOCK_TYPES: FormQuestionInput['type'][] = [
  'short_text',
  'long_text',
  'single_choice',
  'multiple_choice',
  'dropdown',
  'linear_scale',
  'rating',
  'date',
  'time',
  'section_break',
];

export const CONTENT_BLOCK_TYPES: FormQuestionInput['type'][] = [
  'rich_text',
  'image',
  'youtube',
  'divider',
];

function createChoiceOptions(
  translate: (key: string, values?: Record<string, string | number>) => string
) {
  const label = translate('studio.new_option');

  return Array.from({ length: 2 }, (_, index) => ({
    id: createClientId(),
    label: `${label} ${index + 1}`,
    value: deriveUniqueOptionValue(`${label} ${index + 1}`, []),
    image: createEmptyImage(),
  }));
}

export function createQuestionInput(
  type: FormQuestionInput['type'],
  t: TFunction
): CreatedQuestionInput {
  const translate = (key: string, values?: Record<string, string | number>) =>
    t(key, values);
  const base: CreatedQuestionInput = {
    id: createClientId(),
    type,
    title:
      type === 'rich_text'
        ? translate('studio.new_text_block')
        : type === 'image'
          ? translate('studio.new_image_block')
          : type === 'youtube'
            ? translate('studio.new_youtube_block')
            : type === 'divider'
              ? translate('studio.new_divider_block')
              : translate('studio.new_question'),
    description: '',
    required: false,
    image: createEmptyImage(),
    settings: {
      placeholder: translate('runtime.type_your_answer'),
      optionLayout: 'list',
    },
    options: [],
  };

  if (
    type === 'single_choice' ||
    type === 'multiple_choice' ||
    type === 'dropdown'
  ) {
    return {
      ...base,
      options: createChoiceOptions(translate),
    };
  }

  if (type === 'rich_text') {
    return {
      ...base,
      description: translate('studio.new_text_block_description'),
      settings: {},
    };
  }

  if (type === 'image') {
    return {
      ...base,
      title: translate('studio.new_image_block'),
      description: translate('studio.image_block_description'),
      settings: {},
    };
  }

  if (type === 'youtube') {
    return {
      ...base,
      title: translate('studio.new_youtube_block'),
      description: translate('studio.youtube_block_description'),
      settings: {
        youtubeUrl: '',
        youtubeVideoId: '',
        youtubeStartSeconds: 0,
      },
    };
  }

  if (type === 'divider') {
    return {
      ...base,
      title: translate('studio.new_divider_block'),
      settings: {},
    };
  }

  if (type === 'section_break') {
    return {
      ...base,
      title: translate('studio.new_section_break'),
      settings: {},
    };
  }

  return base;
}
