import type { supportedActions } from './supported-actions';
import type { supportedProviders } from './supported-providers';
import { type Message } from 'ai';
import { type UseChatHelpers } from 'ai/react';

export type ResponseMode = 'short' | 'medium' | 'long';
export { type Message, type UseChatHelpers };

export type SupportedAIAction = (typeof supportedActions)[number];
export type SupportedAIProvider = (typeof supportedProviders)[number];

export interface NovaSubmissionCriteria {
  submission_id: string;
  criteria_id: string;
  score: number;
  feedback: string;
}

export interface NovaSubmissionTestCase {
  submission_id: string;
  test_case_id: string;
  output: string;
  matched: boolean;
}
