'use client';

import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
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
        description: `${t('link-shortener.short_url')} copied!`,
      });
    } catch (_err) {
      toast({
        title: t('link-shortener.copy_failed'),
        description: 'Failed to copy to clipboard',
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
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LinkIcon className="h-5 w-5 text-dynamic-blue" />
          {t('link-shortener.create')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!result ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url" className="text-sm font-medium">
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
                className="transition-all duration-200 focus:ring-2 focus:ring-dynamic-blue/20"
              />
            </div>

            {showAdvanced && (
              <div className="space-y-2">
                <Label htmlFor="customSlug" className="text-sm font-medium">
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
                  className="transition-all duration-200 focus:ring-2 focus:ring-dynamic-blue/20"
                />
                <p className="text-xs text-muted-foreground">
                  {t('link-shortener.custom_slug_description')}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAdvanced(!showAdvanced)}
                disabled={loading}
                className="flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4" />
                {showAdvanced ? 'Hide Advanced' : 'Advanced Options'}
              </Button>

              <Button
                type="submit"
                disabled={loading || !url.trim()}
                className="flex items-center gap-2 bg-dynamic-blue hover:bg-dynamic-blue/90"
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
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-dynamic-green">
              <Check className="h-5 w-5" />
              <span className="font-medium">
                {t('link-shortener.created_successfully')}
              </span>
            </div>

            <div className="space-y-3 rounded-lg bg-muted/50 p-4">
              <div>
                <Label className="text-xs font-medium text-muted-foreground">
                  {t('link-shortener.original_url')}
                </Label>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-sm truncate flex-1">{result.link}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(result.link, '_blank')}
                    className="h-6 w-6 p-0"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-xs font-medium text-muted-foreground">
                  Short URL
                </Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-sm font-mono bg-background rounded px-2 py-1 flex-1 text-dynamic-blue">
                    {getShortUrl(result.slug)}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(getShortUrl(result.slug))}
                    className="h-6 w-6 p-0"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      window.open(getShortUrl(result.slug), '_blank')
                    }
                    className="h-6 w-6 p-0"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>

            <Button
              onClick={handleCreateAnother}
              variant="outline"
              className="w-full"
            >
              Create Another Link
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
