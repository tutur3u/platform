import type { ReactNode } from 'react';

export type MeetFormsAnswer =
  | string
  | number
  | string[]
  | Record<string, string>
  | null;
export type MeetFormsAnswers = Record<string, MeetFormsAnswer>;

export interface MeetFormsOption {
  id?: string;
  label: string;
  value: string;
  image?: MeetFormsImage | null;
}

export interface MeetFormsImage {
  url: string;
  alt?: string;
}

interface QuestionBase {
  id: string;
  title: string;
  description?: string;
  required?: boolean;
  image?: MeetFormsImage | null;
  options?: MeetFormsOption[];
}

type StandardQuestionType =
  | 'short_text'
  | 'long_text'
  | 'email'
  | 'phone'
  | 'number'
  | 'url'
  | 'single_choice'
  | 'multiple_choice'
  | 'dropdown'
  | 'ranking'
  | 'linear_scale'
  | 'rating'
  | 'nps'
  | 'date'
  | 'time'
  | 'section_break'
  | 'rich_text'
  | 'image'
  | 'youtube'
  | 'divider';

export type MeetFormsQuestion = QuestionBase &
  (
    | {
        type: StandardQuestionType;
        settings?: {
          placeholder?: string | null;
          minLabel?: string | null;
          maxLabel?: string | null;
          scaleMin?: number | null;
          scaleMax?: number | null;
          ratingMax?: number | null;
          numberStep?: number | null;
          youtubeVideoId?: string | null;
          youtubeStartSeconds?: number | null;
          validationMin?: number | null;
          validationMax?: number | null;
          validationMode?:
            | 'none'
            | 'integer'
            | 'real'
            | 'numeric'
            | 'regex'
            | 'email'
            | 'url'
            | null;
          validationPattern?: string | null;
          validationMessage?: string | null;
        } | null;
      }
    | {
        type: 'matrix';
        rows: { id: string; label: string }[];
        columns: { id: string; label: string }[];
      }
    | {
        type: 'file_upload';
        accept?: string;
        multiple?: boolean;
      }
  );

export interface MeetFormsLogicRule {
  triggerType?: 'question' | 'section_end';
  sourceSectionId?: string | null;
  sourceQuestionId?: string | null;
  operator?: 'equals' | 'not_equals' | 'contains';
  comparisonValue?: string;
  actionType: 'go_to_section' | 'submit';
  targetSectionId?: string | null;
}

export interface MeetFormsSection {
  id: string;
  title?: string;
  description?: string;
  image?: MeetFormsImage | null;
  questions: MeetFormsQuestion[];
}

/** Respondent projection. Quiz keys and author-only settings belong on the server. */
export interface MeetFormsDefinition {
  launchId: string;
  id: string;
  versionId: string;
  title: string;
  description?: string | null;
  sections: MeetFormsSection[];
  logicRules?: MeetFormsLogicRule[];
}

export type MeetFormsState =
  | { kind: 'loading' | 'empty' }
  | { kind: 'error'; onRetry?: () => void }
  | { kind: 'open' | 'closed'; form: MeetFormsDefinition };

export interface MeetFormsBinding {
  launchId: string;
  formId: string;
  versionId: string;
}

export type MeetFormsResult = MeetFormsBinding &
  (
    | { kind: 'submitted' }
    | {
        kind: 'graded';
        score?: { earned: number; possible: number };
        reveal?: {
          questionId: string;
          answer: string;
          explanation?: string;
        }[];
      }
  );

/** Features withheld from respondents until their server-side contract is proven. */
export interface MeetFormsGates {
  matrix?: boolean;
  uploads?: boolean;
  grading?: boolean;
}

export type MeetFormsUpload = (
  request: MeetFormsBinding & {
    questionId: string;
    file: File;
    signal: AbortSignal;
  }
) => Promise<string>;

export interface MeetFormsPanelProps {
  state: MeetFormsState;
  answers: MeetFormsAnswers;
  onAnswersChange: (answers: MeetFormsAnswers) => void;
  prefillAnswers?: MeetFormsAnswers;
  onPrefill?: (binding: MeetFormsBinding) => Promise<MeetFormsAnswers>;
  prefilledQuestionIds?: readonly string[];
  onPrefilledQuestionIdsChange?: (questionIds: readonly string[]) => void;
  onSubmit: (
    request: MeetFormsBinding & { answers: MeetFormsAnswers }
  ) => Promise<void>;
  submissionDisabled?: boolean;
  submitBlocked?: boolean;
  submissionControls?: ReactNode;
  onUpload?: MeetFormsUpload;
  result?: MeetFormsResult | null;
  gates?: MeetFormsGates;
}
