import type { supportedActions } from './supported-actions';
import type { supportedProviders } from './supported-providers';

export type { UseChatHelpers } from '@ai-sdk/react';
export type { UIMessage } from 'ai';

export type SupportedAIAction = (typeof supportedActions)[number];
export type SupportedAIProvider = (typeof supportedProviders)[number];
