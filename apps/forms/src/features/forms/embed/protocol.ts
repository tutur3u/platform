/**
 * Message contract between an embedded form and the host page.
 *
 * Shared by the React embed page and the plain-JS SDK in `public/embed.js`, so
 * the two cannot drift. Every message carries `source` so a host page running
 * other iframes can tell ours apart, and the SDK verifies it before acting.
 */

export const EMBED_MESSAGE_SOURCE = 'tuturuuu-forms';

export const EMBED_MESSAGE_TYPES = {
  /** Content height changed; the host should resize the iframe. */
  resize: 'resize',
  /** The respondent submitted; overlay modes may auto-dismiss. */
  submitted: 'submitted',
  /** The embed mounted and is ready to be shown. */
  ready: 'ready',
} as const;

export type EmbedMessageType =
  (typeof EMBED_MESSAGE_TYPES)[keyof typeof EMBED_MESSAGE_TYPES];

export interface EmbedMessage {
  source: typeof EMBED_MESSAGE_SOURCE;
  type: EmbedMessageType;
  shareCode: string;
  /** Present on `resize`. Content height in CSS pixels. */
  height?: number;
}

export const EMBED_MODES = [
  'inline',
  'fullpage',
  'popup',
  'slider',
  'popover',
  'sidetab',
] as const;

export type EmbedMode = (typeof EMBED_MODES)[number];

export function isEmbedMode(value: string): value is EmbedMode {
  return (EMBED_MODES as readonly string[]).includes(value);
}
