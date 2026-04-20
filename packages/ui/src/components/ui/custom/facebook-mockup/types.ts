export type FacebookMockupMode = 'ad' | 'page';
export const FACEBOOK_REACTION_VARIANTS = [
  'love',
  'like',
  'care',
  'haha',
  'wow',
  'sad',
  'angry',
] as const;

export type FacebookMockupReactionVariant =
  (typeof FACEBOOK_REACTION_VARIANTS)[number];
export type FacebookMockupReactionState = Record<
  FacebookMockupReactionVariant,
  boolean
>;
export type FacebookMockupReactionOrder = FacebookMockupReactionVariant[];

export interface FacebookMockupState {
  mode: FacebookMockupMode;
  pageName: string;
  pageHandle: string;
  audienceLabel: string;
  sponsoredLabel: string;
  caption: string;
  ctaLabel: string;
  headline: string;
  description: string;
  reactions: string;
  comments: string;
  shares: string;
  enabledReactions: FacebookMockupReactionState;
  reactionOrder: FacebookMockupReactionOrder;
  avatarImageUrl: string | null;
  avatarFileName: string | null;
  creativeImageUrl: string | null;
  creativeFileName: string | null;
}

export type TranslationFn = (
  key: string,
  values?: Record<string, string | number>
) => string;
