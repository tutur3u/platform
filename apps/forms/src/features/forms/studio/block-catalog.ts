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
  'email',
  'phone',
  'number',
  'url',
  'single_choice',
  'multiple_choice',
  'dropdown',
  'ranking',
  'linear_scale',
  'rating',
  'nps',
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
  translate: (key: string, values?: Record<string, string | number>) => string,
  count = 2
) {
  const label = translate('studio.new_option');

  return Array.from({ length: count }, (_, index) => ({
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

  // Ranking starts with three items rather than two: ordering two things is a
  // binary choice the respondent can express faster as single choice, so a
  // two-item default would model the question badly.
  if (type === 'ranking') {
    return {
      ...base,
      options: createChoiceOptions(translate, 3),
      settings: {},
    };
  }

  // The placeholder is the only useful hint on a bare text field, but on these
  // the input type already tells the browser (and the respondent's keyboard)
  // what is wanted, so a generic "Type your answer" adds noise.
  if (type === 'email' || type === 'phone' || type === 'url') {
    return {
      ...base,
      settings: { placeholder: translate(`studio.placeholder_${type}`) },
    };
  }

  if (type === 'number') {
    return {
      ...base,
      settings: { placeholder: '', numberStep: null },
    };
  }

  // NPS is a fixed 0-10 question by definition, so the scale bounds are not
  // author-editable; only the anchor labels are.
  if (type === 'nps') {
    return {
      ...base,
      settings: {
        minLabel: translate('studio.nps_default_min_label'),
        maxLabel: translate('studio.nps_default_max_label'),
      },
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
