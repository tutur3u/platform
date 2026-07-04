'use client';

import {
  Download,
  Monitor,
  Smartphone,
  Tablet,
  X,
} from '@tuturuuu/icons/lucide';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import {
  type ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ALLOWED_IMAGE_TYPES,
  createInitialFacebookMockupState,
  isBlobUrl,
  isDefaultFacebookMockupState,
  MAX_IMAGE_SIZE_BYTES,
  MAX_IMAGE_SIZE_MB,
} from './defaults';
import { FacebookMockupForm } from './form';
import { FacebookMockupPreview } from './preview';
import type { FacebookMockupState, TranslationFn } from './types';

type FacebookPreviewTheme = 'dark' | 'light';
type FacebookPreviewViewport = 'phone' | 'tablet' | 'desktop';
type ViewportControl = [
  FacebookPreviewViewport,
  ComponentType<{ className?: string }>,
];
type Html2Canvas = (
  element: HTMLElement,
  options: {
    backgroundColor?: string;
    height: number;
    logging: boolean;
    scale: number;
    useCORS: boolean;
    width: number;
  }
) => Promise<HTMLCanvasElement>;

const messages = {
  facebook_mockup: {
    actions: {
      drag_to_reorder: 'Drag {reaction} to reorder',
      move_down: 'Move {reaction} down',
      move_up: 'Move {reaction} up',
      remove: 'Remove',
      replace: 'Replace image',
      upload: 'Upload',
    },
    defaults: {
      audience_label: 'Public',
      caption:
        'Tuturuuu turns a single creative into a polished Facebook desktop mockup in seconds.',
      comments_count: '18',
      cta_label: 'Learn More',
      description:
        'Desktop-first previews for launches, page posts, education, and product campaigns.',
      headline: 'A Tuturuuu Facebook mockup preview',
      page_handle: '@tuturuuu',
      page_name: 'Tuturuuu',
      reactions_count: '124',
      shares_count: '7',
      sponsored_label: 'Sponsored',
    },
    errors: {
      download_failed: 'Failed to download the mockup image.',
      file_too_large: 'Images must be {size} or smaller.',
      invalid_type: 'Use PNG, JPG, or WEBP images.',
    },
    fields: {
      audience_label: 'Audience label',
      avatar_image: 'Avatar image',
      caption: 'Caption',
      comments: 'comments',
      creative_image: 'Creative image',
      cta_label: 'CTA label',
      description: 'Description',
      headline: 'Headline',
      page_handle: 'Page handle',
      page_name: 'Page name',
      preview_theme: 'Preview theme',
      preview_type: 'Preview type',
      preview_viewport: 'Viewport',
      reactions: 'reactions',
      shares: 'shares',
      sponsored_label: 'Sponsored label',
    },
    fullscreen: {
      close: 'Close fullscreen',
      description:
        'Preview and export the mockup with desktop, tablet, or phone framing.',
      open: 'Fullscreen preview',
      title: 'Fullscreen Preview',
    },
    helper_text: {
      drag_reactions:
        'Drag reactions to change the order they appear in the summary bar.',
      upload_image: 'PNG, JPG, or WEBP up to {size}.',
    },
    modes: {
      ad: 'Facebook ad',
      page: 'Desktop page post',
    },
    placeholders: {
      audience_label: 'Public',
      caption: 'Write your ad copy or post caption',
      cta_label: 'Learn More',
      description: 'Describe the supporting copy that appears under the image.',
      headline: 'Add the short headline under the image',
      metric_value: '0',
      page_handle: '@yourpage',
      page_name: 'Page name',
      sponsored_label: 'Sponsored',
    },
    preview: {
      actions_comment: 'Comment',
      actions_like: 'Like',
      actions_share: 'Share',
      avatar_alt: 'Preview page avatar',
      browser_title: 'facebook mockup preview',
      close: 'Close',
      creative_alt: 'Preview creative image',
      desktop_label: 'Desktop preview',
      feed_label: 'News Feed',
      more_actions: 'More actions',
      placeholder_avatar: 'Avatar',
      placeholder_image: 'Creative image',
      search_placeholder: 'Search Facebook',
      see_more: 'See more',
      show_less: 'See less',
    },
    preview_themes: {
      dark: 'Dark mode',
      light: 'Light mode',
    },
    reactions: {
      angry: 'Angry',
      care: 'Care',
      haha: 'Haha',
      like: 'Like',
      love: 'Love',
      sad: 'Sad',
      wow: 'Wow',
    },
    sections: {
      content: 'Content',
      identity: 'Page identity',
      media: 'Media',
      performance: 'Performance',
      reactions: 'Visible reactions',
    },
    viewport_modes: {
      desktop: 'Desktop',
      phone: 'Phone',
      tablet: 'Tablet',
    },
  },
} as const;

const viewportControls: ViewportControl[] = [
  ['phone', Smartphone],
  ['tablet', Tablet],
  ['desktop', Monitor],
];

const t: TranslationFn = (key, values) => {
  const value = key.split('.').reduce<unknown>((current, part) => {
    if (current && typeof current === 'object' && part in current) {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, messages);

  if (typeof value !== 'string') return key;

  return Object.entries(values ?? {}).reduce(
    (result, [name, replacement]) =>
      result.replaceAll(`{${name}}`, String(replacement)),
    value
  );
};

function downloadCanvasImage(canvas: HTMLCanvasElement) {
  const link = document.createElement('a');
  link.download = `facebook-mockup-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function loadHtml2Canvas(): Promise<Html2Canvas> {
  const loadModule = new Function('specifier', 'return import(specifier)') as (
    specifier: string
  ) => Promise<{ default: Html2Canvas }>;
  const module = await loadModule('html2canvas-pro');
  return module.default;
}

function detectCurrentTheme(): FacebookPreviewTheme {
  if (typeof document !== 'undefined') {
    if (document.documentElement.classList.contains('dark')) {
      return 'dark';
    }

    const htmlTheme = document.documentElement.getAttribute('data-theme');
    if (htmlTheme === 'dark' || htmlTheme === 'light') {
      return htmlTheme;
    }
  }

  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }

  return 'light';
}

export function FacebookMockupDemo({ locale = 'en' }: { locale?: string }) {
  const previewRef = useRef<HTMLDivElement>(null);
  const fullscreenPreviewRef = useRef<HTMLDivElement>(null);
  const defaults = useMemo(() => createInitialFacebookMockupState(t), []);
  const [state, setState] = useState<FacebookMockupState>(() => defaults);
  const [error, setError] = useState<string | null>(null);
  const [previewTheme, setPreviewTheme] =
    useState<FacebookPreviewTheme>('light');
  const [previewViewport, setPreviewViewport] =
    useState<FacebookPreviewViewport>('phone');
  const [inlinePreviewViewport, setInlinePreviewViewport] =
    useState<Extract<FacebookPreviewViewport, 'phone' | 'tablet'>>('phone');
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);

  useEffect(() => {
    setPreviewTheme(detectCurrentTheme());
  }, []);

  useEffect(() => {
    if (!isFullscreenOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreenOpen]);

  useEffect(() => {
    return () => {
      if (isBlobUrl(state.avatarImageUrl)) {
        URL.revokeObjectURL(state.avatarImageUrl);
      }
      if (isBlobUrl(state.creativeImageUrl)) {
        URL.revokeObjectURL(state.creativeImageUrl);
      }
    };
  }, [state.avatarImageUrl, state.creativeImageUrl]);

  const handleValueChange = useCallback(
    <Key extends keyof FacebookMockupState>(
      key: Key,
      value: FacebookMockupState[Key]
    ) => {
      setState((current) => ({ ...current, [key]: value }));
    },
    []
  );

  const handleImageChange = useCallback(
    (
      urlKey: 'avatarImageUrl' | 'creativeImageUrl',
      nameKey: 'avatarFileName' | 'creativeFileName',
      file: File | null
    ) => {
      if (!file) {
        setError(null);
        setState((current) => ({
          ...current,
          [urlKey]: null,
          [nameKey]: null,
        }));
        return;
      }

      if (
        !ALLOWED_IMAGE_TYPES.includes(
          file.type as (typeof ALLOWED_IMAGE_TYPES)[number]
        )
      ) {
        setError(t('facebook_mockup.errors.invalid_type'));
        return;
      }

      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        setError(
          t('facebook_mockup.errors.file_too_large', {
            size: `${MAX_IMAGE_SIZE_MB}MB`,
          })
        );
        return;
      }

      setError(null);
      const imageUrl = URL.createObjectURL(file);
      setState((current) => ({
        ...current,
        [urlKey]: imageUrl,
        [nameKey]: file.name,
      }));
    },
    []
  );

  const handleDownload = useCallback(async () => {
    const activePreviewRef = isFullscreenOpen
      ? fullscreenPreviewRef.current
      : previewRef.current;

    if (!activePreviewRef) return;

    try {
      const html2canvas = await loadHtml2Canvas();
      const previewBounds = activePreviewRef.getBoundingClientRect();
      const canvas = await html2canvas(activePreviewRef, {
        backgroundColor:
          window.getComputedStyle(activePreviewRef).backgroundColor,
        height: Math.round(previewBounds.height),
        logging: false,
        scale: 2,
        useCORS: true,
        width: Math.round(previewBounds.width),
      });

      downloadCanvasImage(canvas);
      setError(null);
    } catch {
      setError(t('facebook_mockup.errors.download_failed'));
    }
  }, [isFullscreenOpen]);

  const handlePreviewViewportChange = useCallback(
    (viewport: FacebookPreviewViewport) => {
      setPreviewViewport(viewport);
      if (viewport !== 'desktop') {
        setInlinePreviewViewport(viewport);
      }
    },
    []
  );

  const handleCloseFullscreen = useCallback(() => {
    setIsFullscreenOpen(false);
    setPreviewViewport((currentViewport) =>
      currentViewport === 'desktop' ? inlinePreviewViewport : currentViewport
    );
  }, [inlinePreviewViewport]);

  const handleReset = useCallback(() => {
    setError(null);
    setState(defaults);
    setPreviewTheme(detectCurrentTheme());
    setPreviewViewport('phone');
    setInlinePreviewViewport('phone');
  }, [defaults]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
      <FacebookMockupForm
        state={state}
        error={error}
        canReset={!isDefaultFacebookMockupState(state, defaults)}
        t={t}
        previewTheme={previewTheme}
        onPreviewThemeChange={setPreviewTheme}
        previewViewport={previewViewport}
        onPreviewViewportChange={handlePreviewViewportChange}
        onOpenFullscreen={() => setIsFullscreenOpen(true)}
        onValueChange={handleValueChange}
        onAvatarChange={(file) =>
          handleImageChange('avatarImageUrl', 'avatarFileName', file)
        }
        onCreativeChange={(file) =>
          handleImageChange('creativeImageUrl', 'creativeFileName', file)
        }
        onReset={handleReset}
        onDownload={handleDownload}
      />
      <div className="xl:sticky xl:top-24 xl:self-start">
        <FacebookMockupPreview
          ref={previewRef}
          locale={locale}
          state={state}
          t={t}
          previewTheme={previewTheme}
          viewportMode={previewViewport}
        />
      </div>

      {isFullscreenOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-xl">
          <div className="flex shrink-0 items-center justify-between border-border border-b px-4 py-3">
            <div>
              <h2 className="font-semibold text-lg">
                {t('facebook_mockup.fullscreen.title')}
              </h2>
              <p className="text-muted-foreground text-sm">
                {t('facebook_mockup.fullscreen.description')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden items-center rounded-xl border border-border/70 bg-background p-1 sm:flex">
                {viewportControls.map(([viewport, Icon]) => (
                  <Button
                    key={viewport}
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={t(`facebook_mockup.viewport_modes.${viewport}`)}
                    aria-pressed={previewViewport === viewport}
                    className={cn(
                      'size-9 rounded-lg',
                      previewViewport === viewport &&
                        'bg-dynamic-blue/10 text-dynamic-blue'
                    )}
                    onClick={() => handlePreviewViewportChange(viewport)}
                  >
                    <Icon className="size-4" />
                  </Button>
                ))}
              </div>
              <Button type="button" variant="outline" onClick={handleDownload}>
                <Download className="size-4" />
                {t('facebook_mockup.fullscreen.open')}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t('facebook_mockup.fullscreen.close')}
                onClick={handleCloseFullscreen}
              >
                <X className="size-5" />
              </Button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-4 md:p-8">
            <FacebookMockupPreview
              ref={fullscreenPreviewRef}
              locale={locale}
              state={state}
              t={t}
              previewTheme={previewTheme}
              viewportMode={previewViewport}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
