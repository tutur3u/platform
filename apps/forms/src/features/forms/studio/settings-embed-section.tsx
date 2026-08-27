'use client';

import { Check, Code2, Copy } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { BASE_URL } from '@/constants/common';
import {
  buildEmbedSnippet,
  buildIframeSnippet,
  isOverlayEmbedMode,
} from '../embed/embed-snippet';
import { EMBED_MODES, type EmbedMode } from '../embed/protocol';
import type { getFormToneClasses } from '../theme';
import { SettingsSection } from './settings-section';

function SnippetBlock({
  label,
  snippet,
  toneClasses,
}: {
  label: string;
  snippet: string;
  toneClasses: ReturnType<typeof getFormToneClasses>;
}) {
  const tCommon = useTranslations('common');
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied (insecure origin, permissions). The
      // snippet is on screen and selectable, so there is nothing to recover.
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <Button
          className={cn('h-8', toneClasses.secondaryButtonClassName)}
          onClick={copy}
          size="sm"
          type="button"
          variant="outline"
        >
          {copied ? (
            <Check className="mr-1.5 h-3.5 w-3.5 text-dynamic-green" />
          ) : (
            <Copy className="mr-1.5 h-3.5 w-3.5" />
          )}
          {copied ? tCommon('copied') : tCommon('copy')}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-2xl border border-border/60 bg-muted/30 p-4 font-mono text-[0.72rem] leading-relaxed">
        <code>{snippet}</code>
      </pre>
    </div>
  );
}

/**
 * Embed builder.
 *
 * Requires a share link: an embed is just a framed `/embed/<shareCode>`, so
 * without a published link there is nothing to point at — better to say so than
 * to hand over a snippet that renders an error on someone's site.
 */
export function EmbedSettingsSection({
  shareCode,
  toneClasses,
}: {
  shareCode?: string | null;
  toneClasses: ReturnType<typeof getFormToneClasses>;
}) {
  const t = useTranslations('forms');
  const [mode, setMode] = useState<EmbedMode>('inline');
  const [height, setHeight] = useState('');
  const [minHeight, setMinHeight] = useState('');
  const [launcherText, setLauncherText] = useState('');

  const snippets = useMemo(() => {
    if (!shareCode) return null;

    const parsedHeight = Number.parseInt(height, 10);
    const parsedMinHeight = Number.parseInt(minHeight, 10);

    return {
      embed: buildEmbedSnippet({
        baseUrl: BASE_URL,
        height: Number.isNaN(parsedHeight) ? null : parsedHeight,
        minHeight: Number.isNaN(parsedMinHeight) ? null : parsedMinHeight,
        launcherText,
        mode,
        shareCode,
      }),
      // The iframe fallback has no auto-resize — it takes an explicit height
      // and keeps it — so a floor would control nothing there.
      iframe: buildIframeSnippet({
        baseUrl: BASE_URL,
        height: Number.isNaN(parsedHeight) ? null : parsedHeight,
        shareCode,
      }),
    };
  }, [height, launcherText, minHeight, mode, shareCode]);

  return (
    <SettingsSection
      description={t('settings.embed_description')}
      icon={Code2}
      title={t('settings.embed')}
      value="embed"
    >
      {snippets ? (
        <>
          <div className="space-y-2">
            <Label>{t('settings.embed_mode')}</Label>
            <div className="flex flex-wrap gap-2">
              {EMBED_MODES.map((candidate) => (
                <Button
                  className={cn(
                    'h-9',
                    candidate === mode
                      ? toneClasses.primaryButtonClassName
                      : toneClasses.secondaryButtonClassName
                  )}
                  key={candidate}
                  onClick={() => setMode(candidate)}
                  size="sm"
                  type="button"
                  variant={candidate === mode ? 'default' : 'outline'}
                >
                  {t(`settings.embed_modes.${candidate}`)}
                </Button>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              {t(`settings.embed_mode_hints.${mode}`)}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {isOverlayEmbedMode(mode) ? (
              <div className="space-y-2">
                <Label htmlFor="embed-launcher">
                  {t('settings.embed_launcher_text')}
                </Label>
                <Input
                  id="embed-launcher"
                  maxLength={40}
                  onChange={(event) => setLauncherText(event.target.value)}
                  placeholder={t('settings.embed_launcher_placeholder')}
                  value={launcherText}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="embed-height">
                  {t('settings.embed_height')}
                </Label>
                <Input
                  id="embed-height"
                  inputMode="numeric"
                  onChange={(event) => setHeight(event.target.value)}
                  placeholder={t('settings.embed_height_placeholder')}
                  value={height}
                />
                <p className="text-muted-foreground text-xs">
                  {t('settings.embed_height_hint')}
                </p>

                {/* Only meaningful while the embed auto-sizes: a fixed height
                    already decides the size, so a floor beside it does
                    nothing. */}
                {height.trim() ? null : (
                  <div className="space-y-2 pt-1">
                    <Label htmlFor="embed-min-height">
                      {t('settings.embed_min_height')}
                    </Label>
                    <Input
                      id="embed-min-height"
                      inputMode="numeric"
                      onChange={(event) => setMinHeight(event.target.value)}
                      placeholder={t('settings.embed_min_height_placeholder')}
                      value={minHeight}
                    />
                    <p className="text-muted-foreground text-xs">
                      {t('settings.embed_min_height_hint')}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <SnippetBlock
            label={t('settings.embed_snippet')}
            snippet={snippets.embed}
            toneClasses={toneClasses}
          />
          <SnippetBlock
            label={t('settings.embed_iframe_snippet')}
            snippet={snippets.iframe}
            toneClasses={toneClasses}
          />
        </>
      ) : (
        <p className="rounded-2xl border border-dynamic-orange/35 bg-dynamic-orange/8 px-4 py-3 text-sm">
          {t('settings.embed_requires_share_link')}
        </p>
      )}
    </SettingsSection>
  );
}
