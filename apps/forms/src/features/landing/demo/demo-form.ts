import type { FormThemeInput } from '@/features/forms/schema';
import type {
  FormDefinition,
  FormDefinitionQuestion,
} from '@/features/forms/types';

/**
 * The landing page's demo form is a real `FormDefinition` rendered through the
 * real `FormRuntime`, not a screenshot or a bespoke mock. Visitors interact with
 * the same component that serves live responses, so the demo cannot drift away
 * from the product, and theme switching on the landing exercises exactly the
 * code path the studio's theme picker drives.
 */

const EMPTY_MEDIA = { storagePath: '', url: '', alt: '' } as const;

/** Stable ids — the runtime keys answers by question id. */
const DEMO_IDS = {
  form: '00000000-0000-4000-8000-000000000001',
  section: '00000000-0000-4000-8000-000000000010',
  role: '00000000-0000-4000-8000-000000000011',
  priority: '00000000-0000-4000-8000-000000000012',
  satisfaction: '00000000-0000-4000-8000-000000000013',
  notes: '00000000-0000-4000-8000-000000000014',
} as const;

export interface DemoFormCopy {
  title: string;
  description: string;
  confirmationTitle: string;
  confirmationMessage: string;
  sectionTitle: string;
  sectionDescription: string;
  roleTitle: string;
  roleOptions: string[];
  priorityTitle: string;
  priorityDescription: string;
  priorityOptions: string[];
  satisfactionTitle: string;
  satisfactionMinLabel: string;
  satisfactionMaxLabel: string;
  notesTitle: string;
  notesPlaceholder: string;
}

function choiceQuestion(
  id: string,
  type: 'single_choice' | 'multiple_choice',
  title: string,
  labels: string[],
  extras: Partial<FormDefinitionQuestion> = {}
): FormDefinitionQuestion {
  return {
    id,
    sectionId: DEMO_IDS.section,
    type,
    title,
    description: '',
    required: false,
    image: { ...EMPTY_MEDIA },
    settings: { optionLayout: 'grid' },
    options: labels.map((label, index) => ({
      id: `${id}-opt-${index}`,
      label,
      value: `option-${index + 1}`,
      image: { ...EMPTY_MEDIA },
    })),
    ...extras,
  };
}

/**
 * Builds the demo definition for a given theme. `theme` is passed in rather
 * than baked in so the landing's theme switcher can rebuild the form without
 * duplicating the question tree.
 */
export function buildDemoForm(
  copy: DemoFormCopy,
  theme: FormThemeInput
): FormDefinition {
  const now = new Date(0).toISOString();

  return {
    id: DEMO_IDS.form,
    wsId: 'demo',
    creatorId: 'demo',
    createdAt: now,
    updatedAt: now,
    title: copy.title,
    description: copy.description,
    status: 'published',
    accessMode: 'anonymous',
    openAt: null,
    closeAt: null,
    maxResponses: null,
    shareCode: null,
    theme,
    settings: {
      // Sections mode on the landing: a visitor skimming the page should see
      // what the form asks, not have to click through four screens to find out.
      displayMode: 'sections',
      welcomeEnabled: false,
      welcomeTitle: '',
      welcomeDescription: '',
      welcomeButtonLabel: '',
      showProgressBar: true,
      allowMultipleSubmissions: true,
      oneResponsePerUser: false,
      // Turnstile only mounts in `public` mode; the demo runs in `preview`.
      requireTurnstile: false,
      confirmationTitle: copy.confirmationTitle,
      confirmationMessage: copy.confirmationMessage,
    },
    // The demo is never crawled as a form page of its own, so it carries no
    // SEO overrides — the landing route supplies the page's metadata.
    seo: {
      title: '',
      description: '',
      image: { ...EMPTY_MEDIA },
      keywords: [],
      canonicalUrl: '',
      noIndex: false,
    },
    logicRules: [],
    sections: [
      {
        id: DEMO_IDS.section,
        title: copy.sectionTitle,
        description: copy.sectionDescription,
        image: { ...EMPTY_MEDIA },
        questions: [
          choiceQuestion(
            DEMO_IDS.role,
            'single_choice',
            copy.roleTitle,
            copy.roleOptions,
            { required: true }
          ),
          choiceQuestion(
            DEMO_IDS.priority,
            'multiple_choice',
            copy.priorityTitle,
            copy.priorityOptions,
            { description: copy.priorityDescription }
          ),
          {
            id: DEMO_IDS.satisfaction,
            sectionId: DEMO_IDS.section,
            type: 'linear_scale',
            title: copy.satisfactionTitle,
            description: '',
            required: false,
            image: { ...EMPTY_MEDIA },
            settings: {
              scaleMin: 1,
              scaleMax: 5,
              minLabel: copy.satisfactionMinLabel,
              maxLabel: copy.satisfactionMaxLabel,
            },
            options: [],
          },
          {
            id: DEMO_IDS.notes,
            sectionId: DEMO_IDS.section,
            type: 'long_text',
            title: copy.notesTitle,
            description: '',
            required: false,
            image: { ...EMPTY_MEDIA },
            settings: { placeholder: copy.notesPlaceholder },
            options: [],
          },
        ],
      },
    ],
  };
}

export { DEMO_IDS };
