'use client';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
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

function downloadCanvasImage(canvas: HTMLCanvasElement) {
  const link = document.createElement('a');
  link.download = `facebook-mockup-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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

export default function FacebookMockup() {
  const t = useTranslations() as TranslationFn;
  const previewRef = useRef<HTMLDivElement>(null);
  const fullscreenPreviewRef = useRef<HTMLDivElement>(null);
  const createDefaults = useCallback(
    () => createInitialFacebookMockupState(t),
    [t]
  );
  const [state, setState] = useState<FacebookMockupState>(() =>
    createDefaults()
  );
  const [error, setError] = useState<string | null>(null);
  const [previewTheme, setPreviewTheme] =
    useState<FacebookPreviewTheme>('light');
  const [previewViewport, setPreviewViewport] =
    useState<FacebookPreviewViewport>('phone');
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
      if (isBlobUrl(state.avatarImageUrl))
        URL.revokeObjectURL(state.avatarImageUrl);
      if (isBlobUrl(state.creativeImageUrl))
        URL.revokeObjectURL(state.creativeImageUrl);
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
    [t]
  );

  const handleDownload = useCallback(async () => {
    const activePreviewRef = isFullscreenOpen
      ? fullscreenPreviewRef.current
      : previewRef.current;

    if (!activePreviewRef) return;

    const html2canvas = (await import('html2canvas-pro')).default;
    const canvas = await html2canvas(activePreviewRef, {
      backgroundColor: null,
      logging: false,
      scale: 2,
      useCORS: true,
    });

    downloadCanvasImage(canvas);
  }, [isFullscreenOpen]);

  const handleReset = useCallback(() => {
    setError(null);
    setState(createDefaults());
    setPreviewTheme(detectCurrentTheme());
    setPreviewViewport('phone');
  }, [createDefaults]);

  const defaults = createDefaults();

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
        onPreviewViewportChange={setPreviewViewport}
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
          state={state}
          t={t}
          previewTheme={previewTheme}
          viewportMode={previewViewport}
        />
      </div>

      {isFullscreenOpen ? (
        <div className="fixed inset-0 z-50 bg-black/70 p-4 backdrop-blur-sm md:p-6">
          <div className="flex h-full flex-col rounded-[32px] border border-white/10 bg-background shadow-[0_36px_120px_rgba(0,0,0,0.42)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-border/60 border-b px-4 py-4 md:px-6">
              <div>
                <h2 className="font-semibold text-lg">
                  {t('facebook_mockup.fullscreen.title')}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {t('facebook_mockup.fullscreen.description')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="grid grid-cols-3 rounded-lg bg-muted/70 p-1">
                  {(['phone', 'tablet', 'desktop'] as const).map((viewport) => (
                    <Button
                      key={viewport}
                      type="button"
                      variant="ghost"
                      aria-pressed={previewViewport === viewport}
                      className={cn(
                        'justify-center px-3 py-2 text-sm',
                        previewViewport === viewport &&
                          'bg-background text-foreground shadow-sm hover:bg-background'
                      )}
                      onClick={() => setPreviewViewport(viewport)}
                    >
                      {t(`facebook_mockup.viewport_modes.${viewport}`)}
                    </Button>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDownload}
                >
                  {t('common.download')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsFullscreenOpen(false)}
                >
                  {t('facebook_mockup.fullscreen.close')}
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-4 py-4 md:px-6 md:py-6">
              <div className="mx-auto flex min-h-full items-start justify-center">
                <FacebookMockupPreview
                  ref={fullscreenPreviewRef}
                  state={state}
                  t={t}
                  previewTheme={previewTheme}
                  viewportMode={previewViewport}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
