'use client';

import {
  buildFormSubmissionMessage,
  buildUiActionSubmissionMessage,
} from '../action-submission';
import type { CreateTransactionInput } from './shared';

type RegistrySetState = (
  updater: (prev: Record<string, unknown>) => Record<string, unknown>
) => void;

type RegistryContext = {
  submitText?: (text: string) => void;
  sendMessage?: (message: {
    role: 'user';
    parts: Array<{ type: 'text'; text: string }>;
  }) => Promise<void>;
  createTransaction?: (params: CreateTransactionInput) => Promise<void>;
};

async function deliverMessage(
  context: RegistryContext,
  messageText: string
): Promise<void> {
  const { submitText, sendMessage } = context || {};

  if (submitText) {
    submitText(messageText);
    return;
  }

  if (!sendMessage) {
    throw new Error('Internal error: sendMessage not found');
  }

  try {
    await sendMessage({
      role: 'user',
      parts: [{ type: 'text', text: messageText }],
    });
  } catch (error) {
    console.error('Failed to deliver dashboard action message:', error);
    throw error instanceof Error
      ? error
      : new Error('Failed to deliver message');
  }
}

export const dashboardActions = {
  submit_form: async (
    params: Record<string, unknown> | undefined,
    setState: RegistrySetState,
    context: RegistryContext
  ) => {
    if (!params) return;
    const { submitText, sendMessage } = context || {};
    if (!submitText && !sendMessage) {
      setState((prev) => ({
        ...prev,
        error: 'Internal error: sendMessage not found',
      }));
      return;
    }

    setState((prev) => ({ ...prev, submitting: true, error: null }));

    try {
      const messageText = buildFormSubmissionMessage({
        title: params.title,
        values: params.values,
      });

      await deliverMessage(context, messageText);

      setState((prev) => ({
        ...prev,
        submitting: false,
        success: true,
        message: 'Form submitted successfully!',
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        submitting: false,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  },

  __ui_action__: async (
    params: Record<string, unknown> | undefined,
    setState: RegistrySetState,
    context: RegistryContext
  ) => {
    const { submitText, sendMessage } = context || {};
    if (!submitText && !sendMessage) return;

    setState((prev) => ({ ...prev, submitting: true, error: null }));

    try {
      const messageText = buildUiActionSubmissionMessage({
        id: params?.id,
        label: params?.label,
        source: params?.source,
      });

      await deliverMessage(context, messageText);

      setState((prev) => ({
        ...prev,
        submitting: false,
        success: true,
        message: 'Form submitted successfully!',
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        submitting: false,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  },

  log_transaction: async (
    params: Record<string, unknown> | undefined,
    setState: RegistrySetState,
    context: RegistryContext
  ) => {
    if (!params) return;
    const { submitText, sendMessage, createTransaction } = context || {};
    if (!createTransaction) {
      setState((prev) => ({
        ...prev,
        submitting: false,
        success: false,
        error: 'Internal error: createTransaction not found',
      }));
      return;
    }
    setState((prev) => ({ ...prev, submitting: true }));

    try {
      if (
        typeof params.amount !== 'number' ||
        typeof params.description !== 'string' ||
        typeof params.walletId !== 'string'
      ) {
        throw new Error('Invalid transaction payload');
      }

      const typedPayload: CreateTransactionInput = {
        amount: params.amount,
        description: params.description,
        walletId: params.walletId,
      };

      await createTransaction(typedPayload);

      if (submitText || sendMessage) {
        const messageText = `### Transaction Logged\n\n**Amount**: ${params.amount}\n**Description**: ${typeof params.description === 'string' ? params.description : 'N/A'}`;
        if (submitText) {
          submitText(messageText);
        } else if (sendMessage) {
          await sendMessage({
            role: 'user',
            parts: [{ type: 'text', text: messageText }],
          });
        }
      }

      setState((prev) => ({
        ...prev,
        submitting: false,
        success: true,
        message: 'Transaction logged successfully!',
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        submitting: false,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  },
  create_time_tracking_request: async (
    params: Record<string, unknown> | undefined,
    setState: RegistrySetState,
    context: RegistryContext
  ) => {
    if (!params) return;
    const { submitText, sendMessage } = context || {};
    if (!submitText && !sendMessage) {
      setState((prev) => ({
        ...prev,
        error: 'Internal error: sendMessage not found',
      }));
      return;
    }

    setState((prev) => ({ ...prev, submitting: true, error: null }));

    try {
      const messageText = buildFormSubmissionMessage({
        title:
          typeof params.title === 'string'
            ? params.title
            : 'Time tracking request',
        values: params,
      });

      await deliverMessage(context, messageText);

      setState((prev) => ({
        ...prev,
        submitting: false,
        success: true,
        message: 'Time tracking request submitted successfully!',
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        submitting: false,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  },
};
