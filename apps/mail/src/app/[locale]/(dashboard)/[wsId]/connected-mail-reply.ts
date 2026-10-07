import type { ConnectedMailMessage } from '@tuturuuu/internal-api';
import { forwardSubject, replySubject } from './mail-reply-utils';

export function connectedReplyDraft(
  message: ConnectedMailMessage | undefined,
  address: string,
  mode?: 'reply' | 'reply_all' | 'forward' | 'edit'
) {
  if (!message) return { to: [], cc: [], subject: '', text: '' };
  if (mode === 'edit')
    return {
      to: message.to ?? [],
      cc: message.cc ?? [],
      subject: message.subject,
      text: message.text ?? '',
    };
  const self = address.toLowerCase();
  const unique = (values: string[]) => [
    ...new Map(
      values
        .filter((value) => value.toLowerCase() !== self)
        .map((value) => [value.toLowerCase(), value])
    ).values(),
  ];
  const sent = message.from.toLowerCase() === self;
  const targets = sent
    ? (message.to ?? [])
    : message.replyTo?.length
      ? message.replyTo
      : [message.from];
  const to =
    mode === 'forward'
      ? []
      : unique(
          mode === 'reply_all' ? [...targets, ...(message.to ?? [])] : targets
        );
  return {
    to,
    cc:
      mode === 'reply_all'
        ? unique(message.cc ?? []).filter(
            (value) =>
              !to.some((target) => target.toLowerCase() === value.toLowerCase())
          )
        : [],
    subject:
      mode === 'forward'
        ? forwardSubject(message.subject)
        : replySubject(message.subject),
    text: `\n\n${message.from} — ${message.date}\n${message.text ?? ''}`,
  };
}
