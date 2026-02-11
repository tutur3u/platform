'use client';

import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  LinkIcon,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface LinkFormat {
  name: string;
  domain: string;
  path: string;
}

const LINK_FORMATS: LinkFormat[] = [
  { name: 'tumeet.me', domain: 'https://tumeet.me', path: '/' },
  { name: 'tumeet.us', domain: 'https://tumeet.us', path: '/' },
  {
    name: 'tuturuuu.com',
    domain: 'https://tuturuuu.com',
    path: '/meet-together/plans/',
  },
];

// Extract the plan ID from the URL
const getPlanId = (url: string): string => {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    // Handle /meet-together/plans/{planId} and /{planId} formats
    let planIdIndex: number;
    if (pathParts.includes('meet-together') && pathParts.includes('plans')) {
      planIdIndex = pathParts.indexOf('plans') + 1;
    } else if (pathParts.includes('r')) {
      // Handle legacy /r/{planId} format
      planIdIndex = pathParts.indexOf('r') + 1;
    } else {
      // Handle /{planId} format (tumeet.me, tumeet.us)
      planIdIndex = pathParts.length - 1;
    }
    return pathParts[planIdIndex] || '';
  } catch {
    return '';
  }
};

// Generate tumeet.me URL (default format)
export const generateTumeetMeUrl = (url: string): string => {
  const planId = getPlanId(url);
  return planId ? `https://tumeet.me/${planId}` : url;
};

export default function CopyLinkButton({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const t = useTranslations('meet-together-plan-details');
  const [copied, setCopied] = useState(false);
  const [selectedFormat] = useState<LinkFormat>(
    LINK_FORMATS?.[0] ?? {
      name: 'tumeet.me',
      domain: 'https://tumeet.me',
      path: '/r/',
    }
  ); // Default to tumeet.me

  useEffect(() => {
    if (copied) {
      setTimeout(() => {
        setCopied(false);
      }, 3000);
    }
  }, [copied]);

  const planId = getPlanId(url);
  const formattedUrl = planId
    ? `${selectedFormat.domain}${selectedFormat.path}${planId}`
    : url;

  const handleCopy = async (linkFormat?: LinkFormat) => {
    const urlToCopy = linkFormat
      ? `${linkFormat.domain}${linkFormat.path}${planId}`
      : formattedUrl;

    try {
      await navigator.clipboard.writeText(urlToCopy);
      setCopied(true);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = urlToCopy;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className={cn(
            'group relative w-full border-dynamic-purple/50 text-dynamic-purple transition-all duration-200 hover:border-dynamic-purple hover:bg-dynamic-purple/10 md:w-auto',
            copied && 'border-dynamic-purple bg-dynamic-purple/20',
            className
          )}
          variant="outline"
          disabled={copied || !url}
        >
          {copied ? (
            <Check className="mr-2 h-4 w-4 animate-pulse" />
          ) : (
            <LinkIcon className="mr-2 h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
          )}
          <span className="transition-all duration-200">
            {copied ? 'Copied!' : t('copy_link')}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:rotate-180" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 border-dynamic-purple/20 p-4 shadow-xl backdrop-blur-sm"
      >
        <div className="mb-4 border-dynamic-purple/20 border-b px-1 py-2 pb-3 font-semibold text-dynamic-purple text-sm">
          <div className="flex items-center gap-2">
            <LinkIcon className="h-4 w-4" />
            Choose link format
          </div>
        </div>
        {LINK_FORMATS.map((format, index) => {
          const isDefault = format.name === 'tumeet.me';
          return (
            <div key={format.name}>
              {index > 0 && (
                <div className="my-3 border-dynamic-purple/10 border-t" />
              )}
              <DropdownMenuItem
                onClick={() => handleCopy(format)}
                className={cn(
                  'group flex cursor-pointer flex-col items-start gap-3 rounded-lg p-4 transition-all duration-200 hover:bg-dynamic-purple/5 hover:shadow-md',
                  isDefault &&
                    'border border-dynamic-purple/30 bg-dynamic-purple/5 shadow-sm'
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full font-bold text-sm',
                        isDefault
                          ? 'bg-dynamic-purple text-white'
                          : 'bg-dynamic-purple/10 text-dynamic-purple'
                      )}
                    >
                      {format.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {format.name}
                      </span>
                      {isDefault && (
                        <span className="rounded-full border border-dynamic-purple/30 bg-dynamic-purple/20 px-2 py-0.5 font-medium text-dynamic-purple text-xs">
                          Default
                        </span>
                      )}
                    </div>
                  </div>
                  <Copy className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                </div>
                <div className="w-full">
                  <div className="mb-2 font-medium text-muted-foreground text-xs">
                    Full URL:
                  </div>
                  <div className="flex items-center gap-2 rounded-md border border-dynamic-purple/20 bg-muted/30 p-3 transition-colors duration-200 group-hover:border-dynamic-purple/40 group-hover:bg-muted/50">
                    <span className="break-all font-mono text-foreground text-xs">
                      {format.domain}
                      {format.path}
                      {planId}
                    </span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </div>
                </div>
                <div className="w-full font-medium text-dynamic-purple text-xs">
                  Click to copy to clipboard
                </div>
              </DropdownMenuItem>
            </div>
          );
        })}
        <div className="mt-4 border-dynamic-purple/20 border-t pt-3">
          <div className="flex items-center gap-2 px-1 text-muted-foreground text-xs">
            <ExternalLink className="h-3 w-3" />
            Links will open in a new tab when shared
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
