import type { FacebookMockupState, TranslationFn } from './types';
import { FACEBOOK_REACTION_VARIANTS } from './types';

export const MAX_IMAGE_SIZE_MB = 8;
export const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const;

const DEFAULT_ENABLED_REACTIONS = FACEBOOK_REACTION_VARIANTS.reduce(
  (accumulator, reaction) => {
    accumulator[reaction] =
      reaction === 'love' || reaction === 'like' || reaction === 'haha';
    return accumulator;
  },
  {} as Record<(typeof FACEBOOK_REACTION_VARIANTS)[number], boolean>
);

export function createInitialFacebookMockupState(
  t: TranslationFn
): FacebookMockupState {
  return {
    mode: 'ad',
    pageName: t('facebook_mockup.defaults.page_name'),
    pageHandle: t('facebook_mockup.defaults.page_handle'),
    audienceLabel: t('facebook_mockup.defaults.audience_label'),
    sponsoredLabel: t('facebook_mockup.defaults.sponsored_label'),
    caption: t('facebook_mockup.defaults.caption'),
    ctaLabel: t('facebook_mockup.defaults.cta_label'),
    headline: t('facebook_mockup.defaults.headline'),
    description: t('facebook_mockup.defaults.description'),
    reactions: t('facebook_mockup.defaults.reactions_count'),
    comments: t('facebook_mockup.defaults.comments_count'),
    shares: t('facebook_mockup.defaults.shares_count'),
    enabledReactions: { ...DEFAULT_ENABLED_REACTIONS },
    reactionOrder: [...FACEBOOK_REACTION_VARIANTS],
    avatarImageUrl: '/media/logos/light.png',
    avatarFileName: null,
    creativeImageUrl: '/cover.png',
    creativeFileName: null,
  };
}

export function isBlobUrl(value: string | null | undefined): value is string {
  return Boolean(value?.startsWith('blob:'));
}

export function isDefaultFacebookMockupState(
  state: FacebookMockupState,
  defaults: FacebookMockupState
): boolean {
  return (
    state.mode === defaults.mode &&
    state.pageName === defaults.pageName &&
    state.pageHandle === defaults.pageHandle &&
    state.audienceLabel === defaults.audienceLabel &&
    state.sponsoredLabel === defaults.sponsoredLabel &&
    state.caption === defaults.caption &&
    state.ctaLabel === defaults.ctaLabel &&
    state.headline === defaults.headline &&
    state.description === defaults.description &&
    state.reactions === defaults.reactions &&
    state.comments === defaults.comments &&
    state.shares === defaults.shares &&
    FACEBOOK_REACTION_VARIANTS.every(
      (reaction) =>
        state.enabledReactions[reaction] === defaults.enabledReactions[reaction]
    ) &&
    state.reactionOrder.length === defaults.reactionOrder.length &&
    state.reactionOrder.every(
      (reaction, index) => reaction === defaults.reactionOrder[index]
    ) &&
    state.avatarImageUrl === defaults.avatarImageUrl &&
    state.avatarFileName === defaults.avatarFileName &&
    state.creativeImageUrl === defaults.creativeImageUrl &&
    state.creativeFileName === defaults.creativeFileName
  );
}
