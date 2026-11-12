import {
  DefaultChatTransport,
  readUIMessageStream,
  type UIMessage,
} from '@tuturuuu/ai/core';
import {
  MAX_RESPONSE_LENGTH,
  parseSuggestions,
  type ReviewProvider,
  reviewPrompt,
  selectReviewText,
} from './review';

type Transport = Pick<DefaultChatTransport<UIMessage>, 'sendMessages'>;

export function createWorkspaceReview({
  workspaceId,
  chatId,
  transport = new DefaultChatTransport({
    api: '/api/ai/chat',
    body: { wsId: workspaceId, creditSource: 'workspace' },
    credentials: 'include',
  }),
}: {
  workspaceId: string;
  /** An existing, actor-owned review conversation, separate from ordinary chat. */
  chatId: string;
  transport?: Transport;
}): ReviewProvider {
  return async (request, signal, onPreview) => {
    if (signal.aborted) throw new Error('REVIEW_CANCELLED');
    selectReviewText(request.text, { start: 0, end: request.text.length });
    const stream = await transport.sendMessages({
      chatId,
      trigger: 'submit-message',
      messageId: undefined,
      abortSignal: signal,
      messages: [
        {
          id: crypto.randomUUID(),
          role: 'user',
          parts: [{ type: 'text', text: reviewPrompt(request) }],
        },
      ],
    });
    let text = '';
    let finished = false;
    const reader = stream.getReader();
    try {
      const checkedStream = new ReadableStream({
        async pull(controller) {
          const result = await reader.read();
          if (result.done) {
            controller.close();
            return;
          }
          if (result.value.type === 'finish') {
            finished = result.value.finishReason === 'stop';
          }
          if (result.value.type === 'error') {
            controller.error(new Error('REVIEW_FAILED'));
            return;
          }
          controller.enqueue(result.value);
        },
      });
      for await (const message of readUIMessageStream({
        stream: checkedStream,
        terminateOnError: true,
      })) {
        if (signal.aborted) throw new Error('REVIEW_CANCELLED');
        text = message.parts
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('');
        if (text.length > MAX_RESPONSE_LENGTH) {
          throw new Error('RESPONSE_TOO_LONG');
        }
        onPreview(text);
      }
      if (signal.aborted || !finished) throw new Error('REVIEW_INCOMPLETE');
      return parseSuggestions(text, request.text);
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
  };
}
