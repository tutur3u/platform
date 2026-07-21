import type { useTranslations } from 'next-intl';
import type { getFormToneClasses } from '../theme';
import type {
  FormAnswerValue,
  FormDefinition,
  FormReadOnlyAnswerIssue,
} from '../types';

export type FormsTranslator = ReturnType<typeof useTranslations<'forms'>>;

export type FormToneClasses = ReturnType<typeof getFormToneClasses>;

export type FormScaleOption = {
  id: string;
  value: string;
  label: string;
};

export interface FormRuntimeProps {
  form: FormDefinition;
  mode: 'preview' | 'public';
  initialAnswers?: Record<string, FormAnswerValue>;
  answerIssues?: FormReadOnlyAnswerIssue[];
  submittedAt?: string | null;
  responseCopyEmail?: string | null;
  readOnlyResponseId?: string | null;
  readOnlyResponseSessionId?: string | null;
  canRequestResponseCopy?: boolean;
  responseCopyAlreadySent?: boolean;
  onSubmit?: (payload: {
    answers: Record<string, FormAnswerValue>;
    turnstileToken?: string;
    sendResponseCopy?: boolean;
  }) => Promise<
    | undefined
    | {
        responseCopyRequested?: boolean;
        responseCopyStatus?: 'sent' | 'rate_limited' | 'failed' | null;
        responseCopySentTo?: string | null;
      }
  >;
  onRequestResponseCopy?: (payload: {
    responseId: string;
    sessionId: string;
    turnstileToken?: string;
  }) => Promise<
    | undefined
    | {
        responseCopySentTo?: string | null;
      }
  >;
  isSubmitting?: boolean;
  readOnly?: boolean;
  className?: string;
}
