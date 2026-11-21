export const MIRA_CHANNEL_KINDS = ['discord', 'whatsapp', 'zalo'] as const;
export type MiraChannelKind = (typeof MIRA_CHANNEL_KINDS)[number];

export type MiraConversationType = 'direct' | 'group';

/** A provider event normalized by ingress after signature verification. */
export interface MiraInboundEvent {
  channel: MiraChannelKind;
  /** Provider account the event arrived on (bot, number or OA id). */
  providerAccountId: string;
  /** Provider event or message id used for replay detection. */
  providerEventId: string;
  conversationId: string;
  conversationType: MiraConversationType;
  /** Provider sender id, already scoped to the provider account. */
  senderId: string;
  /** Provider timestamp in Unix milliseconds. */
  providerTimestampMs: number;
  /** True when the sender is the connected account itself. */
  fromSelf: boolean;
  /** Mention of Mira, reply to a Mira message, or a ping of Mira's role. */
  addressesMira: boolean;
}
