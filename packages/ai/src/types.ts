import type { UseChatHelpers } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import type {
  ChatSdkKnownAdapterId,
  ChatSdkPlatformAdapterId,
  ChatSdkStateAdapterId,
} from './chat-sdk/adapters';
import type { supportedActions } from './supported-actions';
import type { supportedProviders } from './supported-providers';

export type {
  ChatSdkKnownAdapterId,
  ChatSdkPlatformAdapterId,
  ChatSdkStateAdapterId,
  UIMessage,
  UseChatHelpers,
};

export type SupportedAIAction = (typeof supportedActions)[number];
export type SupportedAIProvider = (typeof supportedProviders)[number];

export interface NovaSubmissionCriteria {
  submission_id: string;
  criteria_id: string;
  score: number;
  feedback: string;
  strengths?: string[];
  improvements?: string[];
}

export interface NovaSubmissionTestCase {
  submission_id: string;
  test_case_id: string;
  output: string;
  matched: boolean;
  confidence?: number;
  reasoningText?: string;
}
