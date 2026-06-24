'use client';

import { HelpCircle } from '@tuturuuu/icons';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { MOBILE_DEPLOYMENT_FIELD_DOCS } from './mobile-deployment-field-guidance';

export function MobileDeploymentFieldHelp({ field }: { field: string }) {
  const t = useTranslations('mobile-deployment-settings');
  const doc = MOBILE_DEPLOYMENT_FIELD_DOCS[field];

  if (!doc) {
    return null;
  }

  type MessageKey = Parameters<typeof t>[0];
  const whatKey = `guidance.fields.${field}.what` as MessageKey;
  const whereKey = `guidance.fields.${field}.where` as MessageKey;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={t('guidance.ariaLabel', { field })}
            className="inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs space-y-1 text-left">
          <p className="font-medium text-sm">{t(whatKey)}</p>
          <p className="text-muted-foreground text-xs">{t(whereKey)}</p>
          {doc.url && (
            <p className="text-muted-foreground text-xs">
              {t('guidance.label')}:{' '}
              <a
                className="break-all text-primary hover:underline"
                href={doc.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                {doc.url}
              </a>
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
