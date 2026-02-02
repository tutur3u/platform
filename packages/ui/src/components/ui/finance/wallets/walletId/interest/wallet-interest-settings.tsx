'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarIcon, Settings, TrendingUp } from '@tuturuuu/icons';
import type {
  ProviderDetectionResult,
  WalletInterestConfig,
  WalletInterestRate,
  ZaloPayTier,
} from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Calendar } from '@tuturuuu/ui/calendar';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import { format, parseISO } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { WalletInterestDisableDialog } from './wallet-interest-disable-dialog';
import { WalletInterestRateDialog } from './wallet-interest-rate-dialog';
import { WalletInterestSetupDialog } from './wallet-interest-setup-dialog';

interface WalletInterestSettingsProps {
  wsId: string;
  walletId: string;
  config: WalletInterestConfig | null;
  currentRate: WalletInterestRate | null;
  detection?: ProviderDetectionResult | null;
  onConfigChange?: () => void;
  /** When true, renders without card wrapper (for embedding in parent card) */
  embedded?: boolean;
}

/**
 * Settings component for enabling/configuring interest tracking.
 * Uses extracted dialog components for cleaner architecture.
 */
export function WalletInterestSettings({
  wsId,
  walletId,
  config,
  currentRate,
  detection,
  onConfigChange,
  embedded = false,
}: WalletInterestSettingsProps) {
  const t = useTranslations('wallet-interest');
  const queryClient = useQueryClient();

  // Dialog states
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isRateDialogOpen, setIsRateDialogOpen] = useState(false);
  const [isDisableDialogOpen, setIsDisableDialogOpen] = useState(false);

  // Create config mutation
  const createMutation = useMutation({
    mutationFn: async (data: {
      provider: string;
      tier: string | null;
      rate: number;
      trackingStartDate: string | null;
    }) => {
      const res = await fetch(
        `/api/workspaces/${wsId}/wallets/${walletId}/interest`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: data.provider,
            zalopay_tier: data.tier,
            initial_rate: data.rate,
            tracking_start_date: data.trackingStartDate,
          }),
        }
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to enable interest tracking');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(t('tracking_enabled'));
      queryClient.invalidateQueries({
        queryKey: ['wallet-interest', walletId],
      });
      setIsSetupOpen(false);
      onConfigChange?.();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Update config mutation (tier, enabled, dates)
  const updateMutation = useMutation({
    mutationFn: async (data: {
      zalopay_tier?: ZaloPayTier | null;
      enabled?: boolean;
      tracking_start_date?: string | null;
      tracking_end_date?: string | null;
    }) => {
      const res = await fetch(
        `/api/workspaces/${wsId}/wallets/${walletId}/interest/config`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to update settings');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(t('settings_updated'));
      queryClient.invalidateQueries({
        queryKey: ['wallet-interest', walletId],
      });
      onConfigChange?.();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Add rate mutation
  const addRateMutation = useMutation({
    mutationFn: async (rate: number) => {
      const res = await fetch(
        `/api/workspaces/${wsId}/wallets/${walletId}/interest/rates`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ annual_rate: rate }),
        }
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to update rate');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(t('rate_updated'));
      queryClient.invalidateQueries({
        queryKey: ['wallet-interest', walletId],
      });
      setIsRateDialogOpen(false);
      onConfigChange?.();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Delete config mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/workspaces/${wsId}/wallets/${walletId}/interest/config`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to disable tracking');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(t('tracking_disabled'));
      queryClient.invalidateQueries({
        queryKey: ['wallet-interest', walletId],
      });
      setIsDisableDialogOpen(false);
      onConfigChange?.();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // If no config, show setup button
  if (!config) {
    return (
      <>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5" />
              {t('interest_tracking')}
            </CardTitle>
            <CardDescription>
              {t('interest_tracking_description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setIsSetupOpen(true)}>
              {t('enable_tracking')}
            </Button>
          </CardContent>
        </Card>

        <WalletInterestSetupDialog
          open={isSetupOpen}
          onOpenChange={setIsSetupOpen}
          onSetup={(data) => createMutation.mutate(data)}
          isPending={createMutation.isPending}
          defaultProvider={detection?.provider || 'momo'}
          defaultTier={detection?.suggestedTier || 'standard'}
        />
      </>
    );
  }

  // Show settings for existing config
  const providerName = config.provider === 'momo' ? 'Momo' : 'ZaloPay';

  // Parse tracking dates
  const trackingStartDate = config.tracking_start_date
    ? parseISO(config.tracking_start_date)
    : undefined;
  const trackingEndDate = config.tracking_end_date
    ? parseISO(config.tracking_end_date)
    : undefined;

  const handleStartDateChange = (date: Date | undefined) => {
    updateMutation.mutate({
      tracking_start_date: date ? format(date, 'yyyy-MM-dd') : null,
    });
  };

  const handleEndDateChange = (date: Date | undefined) => {
    updateMutation.mutate({
      tracking_end_date: date ? format(date, 'yyyy-MM-dd') : null,
    });
  };

  const settingsBody = (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-muted-foreground text-xs">
            {t('provider')}
          </Label>
          <p className="font-medium">{providerName}</p>
        </div>
        {config.provider === 'zalopay' && config.zalopay_tier && (
          <div>
            <Label className="text-muted-foreground text-xs">{t('tier')}</Label>
            <Select
              value={config.zalopay_tier}
              onValueChange={(v) =>
                updateMutation.mutate({ zalopay_tier: v as ZaloPayTier })
              }
              disabled={updateMutation.isPending}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="gold">Gold</SelectItem>
                <SelectItem value="diamond">Diamond</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label className="text-muted-foreground text-xs">
            {t('current_rate')}
          </Label>
          <div className="flex items-center gap-2">
            <p className="font-medium">{currentRate?.annual_rate ?? 0}%</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setIsRateDialogOpen(true)}
            >
              {t('change')}
            </Button>
          </div>
        </div>
      </div>

      {/* Tracking Date Range */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs">
            {t('tracking_start_date')}
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'h-8 w-full justify-start text-left font-normal',
                  !trackingStartDate && 'text-muted-foreground'
                )}
                disabled={updateMutation.isPending}
              >
                <CalendarIcon className="mr-2 h-3 w-3" />
                {trackingStartDate ? (
                  format(trackingStartDate, 'PP')
                ) : (
                  <span className="text-xs">{t('set_start_date')}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={trackingStartDate}
                onSelect={handleStartDateChange}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs">
            {t('tracking_end_date')}
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'h-8 w-full justify-start text-left font-normal',
                  !trackingEndDate && 'text-muted-foreground'
                )}
                disabled={updateMutation.isPending}
              >
                <CalendarIcon className="mr-2 h-3 w-3" />
                {trackingEndDate ? (
                  format(trackingEndDate, 'PP')
                ) : (
                  <span className="text-xs">{t('no_end_date')}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="space-y-2 p-2">
                <Calendar
                  mode="single"
                  selected={trackingEndDate}
                  onSelect={handleEndDateChange}
                  initialFocus
                />
                {trackingEndDate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => handleEndDateChange(undefined)}
                  >
                    {t('clear_date')}
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Button
        variant="destructive"
        size="sm"
        onClick={() => setIsDisableDialogOpen(true)}
      >
        {t('disable_tracking')}
      </Button>
    </>
  );

  return (
    <>
      {embedded ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold">
              <Settings className="h-4 w-4" />
              {t('interest_settings')}
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="interest-enabled" className="text-sm">
                {t('enabled')}
              </Label>
              <Switch
                id="interest-enabled"
                checked={config.enabled}
                onCheckedChange={(enabled) =>
                  updateMutation.mutate({ enabled })
                }
                disabled={updateMutation.isPending}
              />
            </div>
          </div>
          {settingsBody}
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings className="h-5 w-5" />
                {t('interest_settings')}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Label htmlFor="interest-enabled" className="text-sm">
                  {t('enabled')}
                </Label>
                <Switch
                  id="interest-enabled"
                  checked={config.enabled}
                  onCheckedChange={(enabled) =>
                    updateMutation.mutate({ enabled })
                  }
                  disabled={updateMutation.isPending}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">{settingsBody}</CardContent>
        </Card>
      )}

      <WalletInterestRateDialog
        open={isRateDialogOpen}
        onOpenChange={setIsRateDialogOpen}
        onUpdateRate={(rate) => addRateMutation.mutate(rate)}
        isPending={addRateMutation.isPending}
        currentRate={currentRate?.annual_rate}
      />

      <WalletInterestDisableDialog
        open={isDisableDialogOpen}
        onOpenChange={setIsDisableDialogOpen}
        onConfirm={() => deleteMutation.mutate()}
        isPending={deleteMutation.isPending}
      />
    </>
  );
}
