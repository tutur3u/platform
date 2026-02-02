'use client';

import { CalendarIcon } from '@tuturuuu/icons';
import type { WalletInterestProvider, ZaloPayTier } from '@tuturuuu/types';
import { getDefaultRate, MOMO_RATE, ZALOPAY_RATES } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Calendar } from '@tuturuuu/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface WalletInterestSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSetup: (data: {
    provider: WalletInterestProvider;
    tier: ZaloPayTier | null;
    rate: number;
    trackingStartDate: string | null;
  }) => void;
  isPending: boolean;
  defaultProvider?: WalletInterestProvider;
  defaultTier?: ZaloPayTier;
}

/**
 * Dialog for initial interest tracking setup.
 * Allows selecting provider, tier (for ZaloPay), and initial rate.
 */
export function WalletInterestSetupDialog({
  open,
  onOpenChange,
  onSetup,
  isPending,
  defaultProvider = 'momo',
  defaultTier = 'standard',
}: WalletInterestSetupDialogProps) {
  const t = useTranslations('wallet-interest');

  const [provider, setProvider] =
    useState<WalletInterestProvider>(defaultProvider);
  const [tier, setTier] = useState<ZaloPayTier>(defaultTier);
  const [rate, setRate] = useState<string>(
    getDefaultRate(defaultProvider, defaultTier).toString()
  );
  const [trackingStartDate, setTrackingStartDate] = useState<Date | undefined>(
    new Date()
  );

  const handleProviderChange = (newProvider: WalletInterestProvider) => {
    setProvider(newProvider);
    setRate(getDefaultRate(newProvider, tier).toString());
  };

  const handleTierChange = (newTier: ZaloPayTier) => {
    setTier(newTier);
    setRate(getDefaultRate(provider, newTier).toString());
  };

  const handleSubmit = () => {
    onSetup({
      provider,
      tier: provider === 'zalopay' ? tier : null,
      rate: parseFloat(rate),
      trackingStartDate: trackingStartDate
        ? format(trackingStartDate, 'yyyy-MM-dd')
        : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('setup_title')}</DialogTitle>
          <DialogDescription>{t('setup_description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t('provider')}</Label>
            <Select
              value={provider}
              onValueChange={(v) =>
                handleProviderChange(v as WalletInterestProvider)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="momo">Momo ({MOMO_RATE}%)</SelectItem>
                <SelectItem value="zalopay">ZaloPay</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {provider === 'zalopay' && (
            <div className="space-y-2">
              <Label>{t('zalopay_tier')}</Label>
              <Select
                value={tier}
                onValueChange={(v) => handleTierChange(v as ZaloPayTier)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">
                    Standard ({ZALOPAY_RATES.standard}%)
                  </SelectItem>
                  <SelectItem value="gold">
                    Gold ({ZALOPAY_RATES.gold}%)
                  </SelectItem>
                  <SelectItem value="diamond">
                    Diamond ({ZALOPAY_RATES.diamond}%)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>{t('annual_rate')}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="w-24"
              />
              <span className="text-muted-foreground">%</span>
            </div>
            <p className="text-muted-foreground text-xs">{t('rate_hint')}</p>
          </div>

          <div className="space-y-2">
            <Label>{t('tracking_start_date')}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !trackingStartDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {trackingStartDate ? (
                    format(trackingStartDate, 'PPP')
                  ) : (
                    <span>{t('set_start_date')}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={trackingStartDate}
                  onSelect={setTrackingStartDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <p className="text-muted-foreground text-xs">
              {t('tracking_start_date_description')}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? t('enabling') : t('enable')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
