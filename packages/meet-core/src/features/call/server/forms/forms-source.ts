import 'server-only';

export {
  formAnswerValueSchema,
  formStudioSchema,
  formSubmitSchema,
  formLogicRuleSchema,
  formOptionSchema,
  formQuestionSchema,
  formSectionSchema,
  FORM_RESPONSE_ANSWER_MAX_LENGTH,
  createDefaultFormStudioInput,
  type FormStudioInput,
} from '../../../../../../../apps/forms/src/features/forms/schema';
export type {
  FormDefinition,
  FormDefinitionQuestion,
  FormRow,
} from '../../../../../../../apps/forms/src/features/forms/types';
export { buildFormDefinition } from '../../../../../../../apps/forms/src/features/forms/server/definition';
export {
  hasFormMedia,
  resolveFormDefinitionMedia,
  sanitizeFormMediaForStorage,
} from '../../../../../../../apps/forms/src/features/forms/server/media';
export { serializeAnswerForStorage } from '../../../../../../../apps/forms/src/features/forms/server/answers';
export { normalizeMarkdownToText } from '../../../../../../../apps/forms/src/features/forms/content';
export { getReachableQuestionIds } from '../../../../../../../apps/forms/src/features/forms/branching';
export { isAnswerableQuestionType } from '../../../../../../../apps/forms/src/features/forms/block-utils';
export {
  validateQuestionValue,
  validateSubmittedAnswers,
} from '../../../../../../../apps/forms/src/features/forms/validation';
