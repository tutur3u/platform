'use client';

import {
  AlertTriangle,
  Copy,
  Loader2,
  Shield,
} from '@tuturuuu/icons/lucide-static';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { unblockBlockedIp } from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import {
  type RateLimitDebugDetails,
  setRateLimitDetailsHandler,
} from '@/lib/fetch-interceptor';
import {
  buildRateLimitDetailSections,
  buildRateLimitHeaderRows,
  formatDetailsForCopy,
  RateLimitDetailRows,
  RateLimitDetailSection,
} from './rate-limit-details-dialog-parts';

export function RateLimitDetailsDialog() {
  const t = useTranslations('common');
  const [details, setDetails] = useState<RateLimitDebugDetails | null>(null);
  const [isClearingIpBlock, setIsClearingIpBlock] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const openDetails = (nextDetails: RateLimitDebugDetails) => {
      setDetails(nextDetails);
      setOpen(true);
    };
    const listener = (event: Event) => {
      openDetails((event as CustomEvent<RateLimitDebugDetails>).detail);
    };

    setRateLimitDetailsHandler(openDetails);
    window.addEventListener('tuturuuu:rate-limit-details', listener);

    return () => {
      setRateLimitDetailsHandler(null);
      window.removeEventListener('tuturuuu:rate-limit-details', listener);
    };
  }, []);

  const sections = useMemo(
    () =>
      details
        ? buildRateLimitDetailSections(details, (key) => t(key as never))
        : [],
    [details, t]
  );
  const headerRows = useMemo(
    () => (details ? buildRateLimitHeaderRows(details) : []),
    [details]
  );
  const canClearIpBlock = useMemo(() => {
    if (!details?.clientIp) {
      return false;
    }

    const isStaffDebugBypass = details.debugBypass === 'tuturuuu-staff';
    const isTuturuuuStaffEmail = isExactTuturuuuDotComEmail(details.userEmail);

    return (
      details.headers['X-Proxy-Block-Reason'] === 'ip-already-blocked' &&
      (isStaffDebugBypass || isTuturuuuStaffEmail)
    );
  }, [details]);

  const copyDetails = async () => {
    if (!details) return;

    try {
      await navigator.clipboard.writeText(formatDetailsForCopy(details));
      toast.success(t('rate_limited_copied'));
    } catch {
      toast.error(t('rate_limited_copy_failed'));
    }
  };

  const clearIpBlock = async () => {
    if (!(details?.clientIp && canClearIpBlock) || isClearingIpBlock) {
      return;
    }

    const proxyBlockReason =
      details.headers['X-Proxy-Block-Reason'] || 'unknown';

    setIsClearingIpBlock(true);
    try {
      await unblockBlockedIp({
        ipAddress: details.clientIp,
        reason: `Cleared from rate-limit details (${proxyBlockReason}) for ${details.requestPath}`,
      });
      toast.success(t('rate_limited_clear_ip_block_success'), {
        description: details.clientIp,
      });
    } catch (error) {
      toast.error(t('rate_limited_clear_ip_block_failed'), {
        description:
          error instanceof InternalApiError
            ? error.message
            : t('rate_limited_clear_ip_block_failed_description'),
      });
    } finally {
      setIsClearingIpBlock(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="grid max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-border border-b px-4 py-4 sm:px-6">
          <DialogTitle>{t('rate_limited_details_title')}</DialogTitle>
          <DialogDescription>
            {t('rate_limited_details_description')}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          {details?.warning ? (
            <div
              className="mb-5 flex gap-3 rounded-md border border-border bg-muted/40 p-3"
              role="status"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 space-y-1">
                <p className="font-medium text-sm">
                  {t('rate_limited_debug_warning_title')}
                </p>
                <p className="text-muted-foreground text-sm">
                  {t('rate_limited_debug_warning_description')}
                </p>
              </div>
            </div>
          ) : null}

          <div className="space-y-5">
            {sections.map((section) => (
              <RateLimitDetailSection
                key={section.title}
                rows={section.rows}
                title={section.title}
              />
            ))}

            {headerRows.length > 0 ? (
              <details className="border-border border-t pt-5">
                <summary className="cursor-pointer font-medium text-sm">
                  {t('rate_limited_details_sections.headers')}
                </summary>
                <div className="pt-3 opacity-90">
                  <RateLimitDetailRows rows={headerRows} />
                </div>
              </details>
            ) : null}
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2 border-border border-t bg-background px-4 py-3 max-sm:gap-2 sm:px-6">
          {canClearIpBlock ? (
            <Button
              aria-label={t('rate_limited_clear_ip_block')}
              disabled={isClearingIpBlock}
              onClick={clearIpBlock}
              type="button"
              variant="secondary"
            >
              {isClearingIpBlock ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Shield className="h-4 w-4" />
              )}
              {isClearingIpBlock
                ? t('rate_limited_clear_ip_block_loading')
                : t('rate_limited_clear_ip_block')}
            </Button>
          ) : null}
          <Button
            aria-label={t('rate_limited_copy_details')}
            onClick={copyDetails}
            type="button"
          >
            <Copy className="h-4 w-4" />
            {t('rate_limited_copy_details')}
          </Button>
          <Button
            aria-label={t('close')}
            onClick={() => setOpen(false)}
            type="button"
            variant="outline"
          >
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
