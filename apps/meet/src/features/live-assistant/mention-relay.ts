import { hasMeetAssistantMention } from '@tuturuuu/realtime/meet';
import type { CallChatMessage } from '../call/lib/call-state';

/** One relay on the initiating device; never replay historical or assistant turns. */
export class MiraMentionRelay {
  private seen = new Set<string>();
  private pending = new Map<string, string>();
  observe(messages: CallChatMessage[], active: boolean) {
    if (!active) this.pending.clear();
    for (const message of messages) {
      if (this.seen.has(message.id)) continue;
      this.seen.add(message.id);
      if (
        active &&
        !message.replayed &&
        !message.assistant &&
        hasMeetAssistantMention(message.body)
      )
        this.pending.set(message.id, `${message.displayName}: ${message.body}`);
    }
    // Retained room history bounds IDs, while pending questions survive reconnects.
    const retained = new Set(messages.map((message) => message.id));
    for (const id of this.seen) if (!retained.has(id)) this.seen.delete(id);
    while (this.pending.size > 20)
      this.pending.delete(this.pending.keys().next().value!);
  }
  flush(send: (text: string) => boolean) {
    for (const [id, text] of this.pending) {
      if (!send(text)) break;
      this.pending.delete(id);
    }
  }
}
