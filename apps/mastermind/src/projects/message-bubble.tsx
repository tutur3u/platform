import { cn } from '@tuturuuu/utils/format';
import { formatTime, useI18n } from '../i18n';
import type { ThreadMessage } from './contract';

const REDACTED = '[redacted]';

/** The bridge redacts secrets inline; the marker renders as a muted token. */
function Text({ text }: { text: string }) {
  const parts = text.split(REDACTED);
  return (
    <p className="whitespace-pre-wrap break-words">
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {index < parts.length - 1 ? (
            <span className="rounded bg-muted px-1 font-mono text-muted-foreground text-xs">
              {REDACTED}
            </span>
          ) : null}
        </span>
      ))}
    </p>
  );
}

/**
 * A user-role message is not always the owner's: other agents write into
 * threads with the same role, so it carries no "You" label.
 */
export function MessageBubble({ message }: { message: ThreadMessage }) {
  const { t, locale } = useI18n();
  const user = message.role === 'user';
  return (
    <div
      className={cn(
        'max-w-[40rem] rounded-lg border px-3.5 py-2.5',
        user ? 'self-end border-transparent bg-secondary' : 'bg-background'
      )}
    >
      <div className="mb-1 text-muted-foreground text-xs">
        {t(`projects.role.${message.role}`)} · {formatTime(locale, message.at)}
      </div>
      <Text text={message.text} />
      {message.truncated ? (
        <p className="mt-1 text-muted-foreground text-xs">
          {t('projects.truncated')}
        </p>
      ) : null}
    </div>
  );
}
