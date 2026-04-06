import type { ModelMessage, UIMessage } from 'ai';

export function getTextFromModelMessage(
  message: Pick<ModelMessage, 'content'>
): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  return message.content
    .flatMap((part) => {
      switch (part.type) {
        case 'text':
          return [part.text];
        default:
          return [];
      }
    })
    .join('');
}

export function getTextFromUIMessage(
  message: Pick<UIMessage, 'parts'>
): string {
  return message.parts
    .flatMap((part) => {
      switch (part.type) {
        case 'text':
        case 'reasoning':
          return [part.text];
        default:
          return [];
      }
    })
    .join('');
}
