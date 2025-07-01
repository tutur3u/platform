'use client';

import { Button } from '@tuturuuu/ui/button';
import { CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import {
  Check,
  Copy,
  ExternalLink,
  Link as LinkIcon,
  Loader2,
  Sparkles,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface ShortenedLinkResult {
  id: string;
  slug: string;
  link: string;
  created_at: string;
}

export function InlineLinkShortenerForm() {
  const router = useRouter();
  const t = useTranslations();
  const [url, setUrl] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ShortenedLinkResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const validateUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const getShortUrl = (slug: string) => {
    if (process.env.NODE_ENV === 'development') {
      return `http://localhost:3002/${slug}`;
    }
    return `${process.env.NEXT_PUBLIC_SHORTENER_URL || ''}/${slug}`;
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: t('link-shortener.copied_to_clipboard'),
        description: t('link-shortener.copied_description'),
      });
    } catch (_err) {
      toast({
        title: t('link-shortener.copy_failed'),
        description: t('link-shortener.copy_failed_description'),
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!url.trim()) {
      toast({
        title: t('common.error'),
        description: t('link-shortener.url_required'),
        variant: 'destructive',
      });
      return;
    }

    if (!validateUrl(url)) {
      toast({
        title: t('common.error'),
        description: t('link-shortener.invalid_url'),
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/v1/link-shortener/shorten', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: url.trim(),
          customSlug: customSlug.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('link-shortener.failed_to_create'));
      }

      setResult(data);
      toast({
        title: t('common.success'),
        description: t('link-shortener.created_successfully'),
      });

      // Refresh the table data
      router.refresh();
    } catch (err) {
      toast({
        title: t('common.error'),
        description:
          err instanceof Error
            ? err.message
            : t('link-shortener.failed_to_create'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAnother = () => {
    setUrl('');
    setCustomSlug('');
    setResult(null);
    setShowAdvanced(false);
  };

  return (
    <div className="w-full">
      <CardHeader className="pb-6">
        <CardTitle className="flex items-center gap-3">
          <div className="p-2 bg-dynamic-blue/10 rounded-lg">
            <LinkIcon className="h-5 w-5 text-dynamic-blue" />
          </div>
          <div>
            <h3 className="text-xl font-semibold">
              {t('link-shortener.create')}
            </h3>
            <p className="text-sm text-muted-foreground font-normal mt-1">
              {t('link-shortener.create_description')}
            </p>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {!result ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-3">
              <Label
                htmlFor="url"
                className="text-sm font-semibold text-foreground"
              >
                {t('link-shortener.url_to_shorten')} *
              </Label>
              <Input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t('link-shortener.url_placeholder')}
                disabled={loading}
                required
                className="h-12 text-base transition-all duration-200 focus:ring-2 focus:ring-dynamic-blue/20 border-border/60 focus:border-dynamic-blue"
              />
            </div>

            {showAdvanced && (
              <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border/40">
                <Label
                  htmlFor="customSlug"
                  className="text-sm font-semibold text-foreground"
                >
                  {t('link-shortener.custom_slug')}
                </Label>
                <Input
                  id="customSlug"
                  type="text"
                  value={customSlug}
                  onChange={(e) => setCustomSlug(e.target.value)}
                  placeholder={t('link-shortener.custom_slug_placeholder')}
                  pattern="[a-zA-Z0-9\-_]+"
                  title="Only letters, numbers, hyphens, and underscores are allowed"
                  disabled={loading}
                  className="h-11 transition-all duration-200 focus:ring-2 focus:ring-dynamic-blue/20 border-border/60 focus:border-dynamic-blue"
                />
                <p className="text-xs text-muted-foreground">
                  {t('link-shortener.custom_slug_description')}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                size="default"
                onClick={() => setShowAdvanced(!showAdvanced)}
                disabled={loading}
                className="flex items-center gap-2 h-11 border-border/60 hover:bg-muted/50 transition-colors"
              >
                <Sparkles className="h-4 w-4" />
                {showAdvanced ? 'Hide Advanced Options' : 'Advanced Options'}
              </Button>

              <Button
                type="submit"
                disabled={loading || !url.trim()}
                size="default"
                className="flex items-center gap-2 h-11 bg-dynamic-blue hover:bg-dynamic-blue/90 transition-colors px-8"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LinkIcon className="h-4 w-4" />
                )}
                {loading ? t('common.creating') : t('link-shortener.create')}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-3 text-dynamic-green p-4 bg-dynamic-green/5 rounded-lg border border-dynamic-green/20">
              <div className="p-1 bg-dynamic-green/10 rounded-full">
                <Check className="h-4 w-4" />
              </div>
              <span className="font-semibold">
                {t('link-shortener.created_successfully')}
              </span>
            </div>

            <div className="space-y-4 p-5 bg-muted/40 rounded-lg border border-border/40">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t('link-shortener.original_url')}
                </Label>
                <div className="flex items-center gap-3 group">
                  <p className="text-sm flex-1 truncate font-medium text-foreground">
                    {result.link}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(result.link, '_blank')}
                    className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t('link-shortener.short_url')}
                </Label>
                <div className="flex items-center gap-3 group p-3 bg-background rounded-md border border-border/60">
                  <code className="text-sm font-mono flex-1 text-dynamic-blue font-semibold">
                    {getShortUrl(result.slug)}
                  </code>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(getShortUrl(result.slug))}
                      className="h-8 w-8 p-0"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        window.open(getShortUrl(result.slug), '_blank')
                      }
                      className="h-8 w-8 p-0"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <Button
              onClick={handleCreateAnother}
              variant="outline"
              size="default"
              className="w-full h-11 border-border/60 hover:bg-muted/50 transition-colors"
            >
              Create Another Link
            </Button>
          </div>
        )}
      </CardContent>
    </div>
  );
}
