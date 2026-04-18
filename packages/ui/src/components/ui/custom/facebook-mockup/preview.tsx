'use client';

import {
  Bell,
  Ellipsis,
  Gamepad2,
  Globe,
  House,
  LayoutGrid,
  MessageCircle,
  MessageCircleMore,
  Search,
  Share2,
  Store,
  ThumbsUp,
  Tv,
  X,
} from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import {
  forwardRef,
  type PropsWithChildren,
  type ReactNode,
  useMemo,
  useState,
} from 'react';
import type {
  FacebookMockupReactionVariant,
  FacebookMockupState,
  TranslationFn,
} from './types';

interface FacebookMockupPreviewProps {
  state: FacebookMockupState;
  t: TranslationFn;
  previewTheme: 'dark' | 'light';
  viewportMode: 'phone' | 'tablet' | 'desktop';
}

const FACEBOOK_REACTION_ASSET_MAP: Record<
  FacebookMockupReactionVariant,
  string
> = {
  like: '/media/facebook-reactions/like.png',
  love: '/media/facebook-reactions/love.png',
  care: '/media/facebook-reactions/care.png',
  haha: '/media/facebook-reactions/haha.png',
  wow: '/media/facebook-reactions/wow.png',
  sad: '/media/facebook-reactions/sad.png',
  angry: '/media/facebook-reactions/angry.png',
};

const topNavItems = [
  { icon: House, active: true },
  { icon: Tv, active: false },
  { icon: Store, active: false },
  { icon: Gamepad2, active: false },
];

function ReactionBadge({
  variant,
  className,
}: {
  variant: FacebookMockupReactionVariant;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label="reaction-badge"
      className={cn(
        'inline-flex size-5 overflow-hidden rounded-full',
        className
      )}
    >
      {/* biome-ignore lint/performance/noImgElement: Facebook reaction assets are intentionally rendered as images */}
      <img
        src={FACEBOOK_REACTION_ASSET_MAP[variant]}
        alt=""
        className="h-full w-full object-cover"
      />
    </span>
  );
}

function ReactionSummaryLink({
  children,
  className,
  theme,
}: PropsWithChildren<{ className?: string; theme: 'dark' | 'light' }>) {
  return (
    <button
      type="button"
      className={cn(
        'truncate text-[13px] transition-all hover:underline',
        theme === 'dark' ? 'text-[#B0B3B8]' : 'text-[#65676B]',
        className
      )}
    >
      {children}
    </button>
  );
}

function PlaceholderMedia({
  label,
  className,
  theme,
}: {
  label: string;
  className?: string;
  theme: 'dark' | 'light';
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-24 items-center justify-center text-center text-sm',
        theme === 'dark' ? 'text-white/50' : 'text-black/35',
        className
      )}
      style={{
        background:
          theme === 'dark'
            ? 'linear-gradient(135deg, rgba(59,130,246,0.14), rgba(17,24,39,0.7) 55%, rgba(147,197,253,0.12))'
            : 'linear-gradient(135deg, rgba(59,130,246,0.16), rgba(255,255,255,0.94) 58%, rgba(96,165,250,0.18))',
      }}
    >
      {label}
    </div>
  );
}

function SideRail({
  title,
  children,
  theme,
}: PropsWithChildren<{ title?: string; theme: 'dark' | 'light' }>) {
  return (
    <div
      className={cn(
        'rounded-xl p-3 shadow-[0_1px_2px_rgba(0,0,0,0.12)]',
        theme === 'dark' ? 'bg-[#242526]' : 'bg-white'
      )}
    >
      {title ? (
        <div
          className={cn(
            'mb-3 font-semibold text-sm',
            theme === 'dark' ? 'text-[#E4E6EB]' : 'text-[#1C1E21]'
          )}
        >
          {title}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function RailSkeleton({
  lines = 3,
  theme,
}: {
  lines?: number;
  theme: 'dark' | 'light';
}) {
  return (
    <div className="grid gap-2">
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={`line-${index + 1}`}
          className="h-2.5 rounded-full"
          style={{
            width: `${100 - index * 14}%`,
            backgroundColor:
              index === 0
                ? '#2374E1'
                : theme === 'dark'
                  ? '#4E4F50'
                  : '#D8DADF',
          }}
        />
      ))}
    </div>
  );
}

function PreviewAction({
  icon,
  label,
  theme,
}: {
  icon: ReactNode;
  label: string;
  theme: 'dark' | 'light';
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-10 items-center justify-center gap-2 rounded-md font-semibold text-[15px] transition-colors',
        theme === 'dark'
          ? 'text-[#B0B3B8] hover:bg-[#3A3B3C]'
          : 'text-[#65676B] hover:bg-[#F2F3F5]'
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function getDestinationLabel(state: FacebookMockupState) {
  const normalizedHandle = state.pageHandle.replace(/^@/, '').trim();
  return normalizedHandle || 'facebook.com';
}

function renderAvatar(imageUrl: string | null, alt: string, fallback: string) {
  if (imageUrl) {
    return (
      <>
        {/* biome-ignore lint/performance/noImgElement: local mockup assets and object URLs are rendered directly */}
        <img src={imageUrl} alt={alt} className="h-full w-full object-cover" />
      </>
    );
  }

  return (
    <span className="font-semibold text-[#B0B3B8] text-[10px]">{fallback}</span>
  );
}

function formatCompactCount(value: string) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return value;
  }

  return new Intl.NumberFormat('en', {
    notation: numericValue >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: numericValue >= 10000 ? 0 : 1,
  }).format(numericValue);
}

function getCollapsedCaption(caption: string) {
  const normalizedCaption = caption.trim();

  if (normalizedCaption.length <= 220) {
    return { text: normalizedCaption, needsExpansion: false };
  }

  const previewText = normalizedCaption.slice(0, 220);
  const breakIndex = Math.max(
    previewText.lastIndexOf(' '),
    previewText.lastIndexOf('\n')
  );

  return {
    text: `${previewText.slice(0, breakIndex > 0 ? breakIndex : 220)}...`,
    needsExpansion: true,
  };
}

export const FacebookMockupPreview = forwardRef<
  HTMLDivElement,
  FacebookMockupPreviewProps
>(function FacebookMockupPreview(
  { state, t, previewTheme, viewportMode },
  ref
) {
  const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);
  const visibleReactions = state.reactionOrder.filter(
    (reaction) => state.enabledReactions[reaction]
  );
  const collapsedCaption = useMemo(
    () => getCollapsedCaption(state.caption),
    [state.caption]
  );
  const captionToRender =
    collapsedCaption.needsExpansion && !isCaptionExpanded
      ? collapsedCaption.text
      : state.caption.trim();
  const isDarkTheme = previewTheme === 'dark';
  const isPhoneViewport = viewportMode === 'phone';
  const isTabletViewport = viewportMode === 'tablet';
  const showDesktopRails = viewportMode === 'desktop';
  const showExpandedNav = viewportMode !== 'phone';
  const theme = {
    app: isDarkTheme ? 'bg-[#18191A]' : 'bg-[#F0F2F5]',
    appBorder: isDarkTheme ? 'border-white/10' : 'border-black/8',
    topBar: isDarkTheme
      ? 'bg-[#242526] border-white/10'
      : 'bg-white border-black/10',
    search: isDarkTheme
      ? 'bg-[#3A3B3C] text-[#B0B3B8]'
      : 'bg-[#F0F2F5] text-[#65676B]',
    utility: isDarkTheme
      ? 'bg-[#3A3B3C] text-[#E4E6EB]'
      : 'bg-[#E4E6EB] text-[#050505]',
    card: isDarkTheme ? 'bg-[#242526]' : 'bg-white',
    cardShadow: isDarkTheme
      ? 'shadow-[0_1px_2px_rgba(0,0,0,0.28)]'
      : 'shadow-[0_1px_2px_rgba(0,0,0,0.12)]',
    text: isDarkTheme ? 'text-[#E4E6EB]' : 'text-[#1C1E21]',
    muted: isDarkTheme ? 'text-[#B0B3B8]' : 'text-[#65676B]',
    hover: isDarkTheme ? 'hover:bg-[#3A3B3C]' : 'hover:bg-[#F2F3F5]',
    divider: isDarkTheme ? 'border-[#3E4042]' : 'border-[#CED0D4]',
    subCard: isDarkTheme ? 'bg-[#18191A]' : 'bg-[#F7F8FA]',
    ring: isDarkTheme ? 'ring-[#F0F2F5]' : 'ring-white',
  };

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[28px] border shadow-[0_28px_80px_rgba(0,0,0,0.18)]',
        theme.appBorder,
        viewportMode === 'desktop'
          ? 'mx-auto w-full max-w-[1380px]'
          : viewportMode === 'tablet'
            ? 'mx-auto w-full max-w-[860px]'
            : 'mx-auto w-full max-w-[430px]'
      )}
      style={{
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
      }}
    >
      <div
        ref={ref}
        data-testid="facebook-mockup-preview"
        className={cn('overflow-hidden', theme.app)}
      >
        <div
          className={cn(
            'grid items-center border-b',
            theme.topBar,
            isPhoneViewport
              ? 'grid-cols-[minmax(0,1fr)_auto] gap-2 px-3 py-2.5'
              : 'grid-cols-[minmax(260px,360px)_minmax(360px,1fr)_auto] gap-4 px-4 py-3'
          )}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            {/* biome-ignore lint/performance/noImgElement: public Facebook brand asset is intentionally rendered as an image */}
            <img
              src="/media/facebook-logo.svg"
              alt="Facebook"
              className={cn('shrink-0', isPhoneViewport ? 'size-8' : 'size-10')}
            />
            <div
              className={cn(
                'flex min-w-0 items-center gap-2 rounded-full text-sm',
                theme.search,
                isPhoneViewport
                  ? 'flex-1 px-3 py-2'
                  : 'max-w-[320px] flex-1 px-4 py-2.5'
              )}
            >
              <Search className="size-4" />
              <span className="truncate">
                {t('facebook_mockup.preview.search_placeholder')}
              </span>
            </div>
          </div>

          {showExpandedNav ? (
            <div className="hidden min-w-0 grid-cols-4 items-center justify-center gap-1 lg:grid">
              {topNavItems.map(({ icon: Icon, active }, index) => (
                <button
                  key={`top-nav-${index + 1}`}
                  type="button"
                  className={cn(
                    'relative flex h-11 w-full min-w-0 items-center justify-center rounded-xl px-2 transition-colors',
                    isDarkTheme ? 'hover:bg-white/5' : 'hover:bg-black/5'
                  )}
                >
                  <Icon
                    className={cn(
                      'size-5',
                      active ? 'text-[#2374E1]' : theme.muted
                    )}
                    strokeWidth={2.2}
                  />
                  {active ? (
                    <span className="absolute right-2 -bottom-3 left-2 h-[3px] rounded-full bg-[#2374E1]" />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          <div
            className={cn(
              'flex items-center justify-end',
              isPhoneViewport ? 'gap-1' : 'gap-2'
            )}
          >
            {[LayoutGrid, MessageCircleMore, Bell].map((Icon, index) => (
              <button
                key={`utility-${index + 1}`}
                type="button"
                className={cn(
                  'flex items-center justify-center rounded-full',
                  theme.utility,
                  isPhoneViewport ? 'size-9' : 'size-10'
                )}
              >
                <Icon
                  className={cn(isPhoneViewport ? 'size-4' : 'size-5')}
                  strokeWidth={2.1}
                />
              </button>
            ))}
            <div
              className={cn(
                'flex items-center justify-center overflow-hidden rounded-full',
                theme.utility,
                isPhoneViewport ? 'size-9' : 'size-10'
              )}
            >
              {renderAvatar(
                state.avatarImageUrl,
                t('facebook_mockup.preview.avatar_alt'),
                t('facebook_mockup.preview.placeholder_avatar')
              )}
            </div>
          </div>
        </div>

        <div
          className={cn(
            'mx-auto grid gap-5 px-5 py-5',
            showDesktopRails
              ? 'w-full max-w-[1220px] items-start justify-center lg:grid-cols-[240px_650px_240px]'
              : 'grid-cols-1'
          )}
        >
          <div
            className={cn(
              'gap-3',
              showDesktopRails ? 'hidden lg:grid' : 'hidden'
            )}
          >
            <SideRail theme={previewTheme}>
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full',
                    theme.utility
                  )}
                >
                  {renderAvatar(
                    state.avatarImageUrl,
                    '',
                    t('facebook_mockup.preview.placeholder_avatar')
                  )}
                </div>
                <div className="min-w-0">
                  <div
                    className={cn('truncate font-semibold text-sm', theme.text)}
                  >
                    {state.pageName}
                  </div>
                  <div className={cn('truncate text-xs', theme.muted)}>
                    {state.pageHandle}
                  </div>
                </div>
              </div>
            </SideRail>
            <SideRail theme={previewTheme}>
              <RailSkeleton lines={4} theme={previewTheme} />
            </SideRail>
            <SideRail theme={previewTheme}>
              <RailSkeleton lines={3} theme={previewTheme} />
            </SideRail>
          </div>

          <div className="mx-auto w-full max-w-[650px]">
            <div
              data-testid="facebook-mockup-post-card"
              className={cn(
                'overflow-hidden rounded-2xl',
                theme.card,
                theme.cardShadow
              )}
            >
              <div className="flex items-start gap-3 px-4 pt-4 pb-2">
                <div
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full',
                    theme.utility
                  )}
                >
                  {renderAvatar(
                    state.avatarImageUrl,
                    t('facebook_mockup.preview.avatar_alt'),
                    t('facebook_mockup.preview.placeholder_avatar')
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      'truncate font-semibold text-[15px] leading-tight',
                      theme.text
                    )}
                  >
                    {state.pageName}
                  </div>
                  <div
                    className={cn(
                      'mt-px flex flex-wrap items-center gap-1 text-[13px] leading-none',
                      theme.muted
                    )}
                  >
                    {state.mode === 'ad' ? (
                      <>
                        <span>{state.sponsoredLabel}</span>
                        <span>&middot;</span>
                      </>
                    ) : null}
                    <span>{state.audienceLabel}</span>
                    <span>&middot;</span>
                    <Globe className="size-3.5" strokeWidth={2.25} />
                  </div>
                </div>

                <div className={cn('flex items-center gap-0.5', theme.muted)}>
                  <button
                    type="button"
                    className={cn(
                      'flex size-8 items-center justify-center rounded-full',
                      theme.hover
                    )}
                    aria-label={t('facebook_mockup.preview.more_actions')}
                  >
                    <Ellipsis className="size-4" strokeWidth={2.2} />
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'flex size-8 items-center justify-center rounded-full',
                      theme.hover
                    )}
                    aria-label={t('facebook_mockup.preview.close')}
                  >
                    <X className="size-4" strokeWidth={2.25} />
                  </button>
                </div>
              </div>

              <div
                className={cn(
                  'whitespace-pre-wrap px-4 pb-3 text-[15px] leading-[1.34]',
                  theme.text
                )}
              >
                {captionToRender}
                {collapsedCaption.needsExpansion ? (
                  <>
                    {' '}
                    <button
                      type="button"
                      className={cn('font-semibold', theme.muted)}
                      onClick={() =>
                        setIsCaptionExpanded((current) => !current)
                      }
                    >
                      {isCaptionExpanded
                        ? t('facebook_mockup.preview.show_less')
                        : t('facebook_mockup.preview.see_more')}
                    </button>
                  </>
                ) : null}
              </div>

              <div className={cn('overflow-hidden border-y', theme.divider)}>
                {state.creativeImageUrl ? (
                  /* biome-ignore lint/performance/noImgElement: local mockup assets and object URLs are rendered directly */
                  <img
                    src={state.creativeImageUrl}
                    alt={t('facebook_mockup.preview.creative_alt')}
                    className={cn(
                      'w-full object-cover',
                      isPhoneViewport
                        ? 'h-[280px]'
                        : isTabletViewport
                          ? 'h-[320px]'
                          : 'h-[332px]'
                    )}
                  />
                ) : (
                  <PlaceholderMedia
                    label={t('facebook_mockup.preview.placeholder_image')}
                    className={cn(
                      isPhoneViewport
                        ? 'min-h-[280px]'
                        : isTabletViewport
                          ? 'min-h-[320px]'
                          : 'min-h-[332px]'
                    )}
                    theme={previewTheme}
                  />
                )}
              </div>

              {state.mode === 'ad' ? (
                <div
                  className={cn(
                    'flex items-center justify-between gap-4 px-4 py-3',
                    theme.subCard
                  )}
                >
                  <div className="min-w-0">
                    <div
                      className={cn(
                        'text-[12px] uppercase tracking-[0.02em]',
                        theme.muted
                      )}
                    >
                      {getDestinationLabel(state)}
                    </div>
                    <div
                      className={cn(
                        'truncate font-semibold text-[15px]',
                        theme.text
                      )}
                    >
                      {state.headline}
                    </div>
                    <div
                      className={cn('line-clamp-2 text-[13px]', theme.muted)}
                    >
                      {state.description}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={cn(
                      'shrink-0 rounded-md px-4 py-2 font-semibold text-sm',
                      isDarkTheme
                        ? 'bg-[#E4E6EB] text-[#050505]'
                        : 'bg-[#E4E6EB] text-[#1C1E21]'
                    )}
                  >
                    {state.ctaLabel}
                  </button>
                </div>
              ) : null}

              <div
                className={cn(
                  'flex items-center justify-between gap-4 px-4 pt-3 pb-2 text-[15px]',
                  theme.muted
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {visibleReactions.length > 0 ? (
                    <div className="flex items-center">
                      {visibleReactions.map((variant, index) => (
                        <ReactionBadge
                          key={variant}
                          variant={variant}
                          className={index === 0 ? undefined : '-ml-1.5'}
                        />
                      ))}
                    </div>
                  ) : null}
                  <ReactionSummaryLink className="min-w-0" theme={previewTheme}>
                    {formatCompactCount(state.reactions)}
                  </ReactionSummaryLink>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-[13px]">
                  <ReactionSummaryLink theme={previewTheme}>
                    {formatCompactCount(state.comments)}{' '}
                    {t('facebook_mockup.fields.comments')}
                  </ReactionSummaryLink>
                  <ReactionSummaryLink theme={previewTheme}>
                    {formatCompactCount(state.shares)}{' '}
                    {t('facebook_mockup.fields.shares')}
                  </ReactionSummaryLink>
                </div>
              </div>

              <div className="px-4">
                <div className={cn('border-t', theme.divider)} />
              </div>

              <div className="grid grid-cols-3 gap-1 px-2 py-1.5">
                <PreviewAction
                  icon={
                    <ThumbsUp
                      className={cn('size-4', theme.muted)}
                      strokeWidth={2.2}
                    />
                  }
                  label={t('facebook_mockup.preview.actions_like')}
                  theme={previewTheme}
                />
                <PreviewAction
                  icon={
                    <MessageCircle
                      className={cn('size-4', theme.muted)}
                      strokeWidth={2.2}
                    />
                  }
                  label={t('facebook_mockup.preview.actions_comment')}
                  theme={previewTheme}
                />
                <PreviewAction
                  icon={
                    <Share2
                      className={cn('size-4', theme.muted)}
                      strokeWidth={2.2}
                    />
                  }
                  label={t('facebook_mockup.preview.actions_share')}
                  theme={previewTheme}
                />
              </div>
            </div>
          </div>

          <div
            className={cn(
              'gap-3',
              showDesktopRails ? 'hidden lg:grid' : 'hidden'
            )}
          >
            <SideRail
              title={t('facebook_mockup.preview.desktop_label')}
              theme={previewTheme}
            >
              <RailSkeleton lines={4} theme={previewTheme} />
            </SideRail>
            <SideRail
              title={t('facebook_mockup.preview.feed_label')}
              theme={previewTheme}
            >
              <RailSkeleton lines={3} theme={previewTheme} />
            </SideRail>
          </div>
        </div>
      </div>
    </div>
  );
});
