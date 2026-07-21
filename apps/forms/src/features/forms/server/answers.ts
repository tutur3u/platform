import type { SupabaseClient } from '@tuturuuu/supabase';
import type { Database } from '@tuturuuu/types';
import type {
  FormAnswerValue,
  FormResponseAnswerRow,
  FormResponseRow,
} from '../types';
import { getPrivateFormsClient } from './client';

export async function fetchResponseAnswersByIds(
  supabase: SupabaseClient<Database>,
  responseIds: string[]
): Promise<FormResponseAnswerRow[]> {
  const formsClient = getPrivateFormsClient(supabase);
  const answers: FormResponseAnswerRow[] = [];

  for (let index = 0; index < responseIds.length; index += 500) {
    const chunk = responseIds.slice(index, index + 500);

    if (!chunk.length) {
      continue;
    }

    const { data } = await formsClient
      .from('form_response_answers')
      .select('*')
      .in('response_id', chunk);

    answers.push(...(data ?? []));
  }

  return answers;
}

export async function fetchResponseMetadataByIds(
  supabase: SupabaseClient<Database>,
  responseIds: string[]
): Promise<
  Array<Pick<FormResponseRow, 'id' | 'respondent_email' | 'respondent_user_id'>>
> {
  const responses: Array<
    Pick<FormResponseRow, 'id' | 'respondent_email' | 'respondent_user_id'>
  > = [];
  const formsClient = getPrivateFormsClient(supabase);

  for (let index = 0; index < responseIds.length; index += 500) {
    const chunk = responseIds.slice(index, index + 500);

    if (!chunk.length) {
      continue;
    }

    const { data } = await formsClient
      .from('form_responses')
      .select('id, respondent_email, respondent_user_id')
      .in('id', chunk);

    responses.push(...(data ?? []));
  }

  return responses;
}

export function serializeAnswerForStorage(answer: unknown) {
  if (typeof answer === 'string') {
    return {
      answer_text: answer,
      answer_json: null,
    };
  }

  if (typeof answer === 'number') {
    return {
      answer_text: String(answer),
      answer_json: answer,
    };
  }

  if (Array.isArray(answer)) {
    return {
      answer_text: null,
      answer_json: answer,
    };
  }

  return {
    answer_text: null,
    answer_json: null,
  };
}

export function formatAnswerForDisplay(answer: FormResponseAnswerRow) {
  if (typeof answer.answer_text === 'string' && answer.answer_text.trim()) {
    return answer.answer_text;
  }

  if (Array.isArray(answer.answer_json)) {
    return answer.answer_json.join(', ');
  }

  if (typeof answer.answer_json === 'number') {
    return String(answer.answer_json);
  }

  return '—';
}

export function extractStoredAnswerValue(
  answer: Pick<FormResponseAnswerRow, 'answer_text' | 'answer_json'>
): FormAnswerValue | null {
  if (typeof answer.answer_text === 'string' && answer.answer_text.trim()) {
    return answer.answer_text;
  }

  if (Array.isArray(answer.answer_json)) {
    return answer.answer_json.filter(
      (entry): entry is string => typeof entry === 'string'
    );
  }

  if (typeof answer.answer_json === 'number') {
    return answer.answer_json;
  }

  return null;
}
