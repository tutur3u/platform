'use client';

import { Copy, ExternalLink, Eye, LinkIcon } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface AnalyticsHeaderProps {
  link: {
    slug: string;
    link: string;
  };
}

export function AnalyticsHeader({ link }: AnalyticsHeaderProps) {
  const t = useTranslations();

  const handleCopy = async () => {
    try {
      const shortUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://tuturuuu.com'}/${link.slug}`;
      await navigator.clipboard.writeText(shortUrl);
      toast.success(t('link-shortener.copied_to_clipboard'));
    } catch (error) {
      console.error('Failed to copy text:', error);
      toast.error(t('link-shortener.copy_failed'));
    }
  };

  return (
    <div className="flex items-center space-x-4">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-dynamic-blue/20 blur-lg" />
        <div className="relative rounded-full border border-dynamic-blue/20 bg-linear-to-br from-dynamic-blue/10 to-dynamic-blue/5 p-4">
          <LinkIcon className="h-10 w-10 text-dynamic-blue" />
        </div>
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="bg-linear-to-r from-foreground via-foreground to-foreground/60 bg-clip-text font-bold text-4xl tracking-tight">
            {t('link-shortener.analytics.title')}
          </h1>
          <Badge
            variant="secondary"
            className="bg-dynamic-blue/10 text-dynamic-blue"
          >
            <Eye className="mr-1 h-3 w-3" />
            {t('link-shortener.analytics.live')}
          </Badge>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="font-mono text-dynamic-blue text-lg">/{link.slug}</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-dynamic-blue"
              onClick={handleCopy}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <p className="truncate text-muted-foreground text-sm">
              {link.link}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-dynamic-blue"
              asChild
            >
              <Link href={link.link} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
