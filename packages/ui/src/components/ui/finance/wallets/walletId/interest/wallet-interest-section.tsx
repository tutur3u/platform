'use client';

import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from '@tuturuuu/icons';
import type {
  InterestSummary,
  ProviderDetectionResult,
  Wallet,
} from '@tuturuuu/types';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { useInterestPreferences } from '@tuturuuu/ui/hooks/use-interest-preferences';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { Separator } from '@tuturuuu/ui/separator';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { WalletInterestChart } from './wallet-interest-chart';
import { WalletInterestDetectionBanner } from './wallet-interest-detection-banner';
import { WalletInterestHero } from './wallet-interest-hero';
import { WalletInterestPendingDeposits } from './wallet-interest-pending-deposits';
import { WalletInterestRateHistory } from './wallet-interest-rate-history';
import { WalletInterestSettings } from './wallet-interest-settings';
import { WalletInterestTransparency } from './wallet-interest-transparency';

interface WalletInterestSectionProps {
  wsId: string;
  wallet: Wallet;
}

/**
 * Main component that integrates all wallet interest features.
 * Redesigned with hero card, interactive chart, and transparent calculation details.
 */
export function WalletInterestSection({
  wsId,
  wallet,
}: WalletInterestSectionProps) {
  const t = useTranslations('wallet-interest');
  const [showSetup, setShowSetup] = useState(false);

  // User preferences for display
  const { preferences, updatePreference } = useInterestPreferences(
    wallet.id || ''
  );

  const { data: experimentalConfig } = useWorkspaceConfig(
    wsId,
    'ENABLE_EXPERIMENTAL_FINANCE',
    'false'
  );
  const experimentalEnabled = experimentalConfig === 'true';

  // Expanded state (starts based on user preference)
  const [showDetails, setShowDetails] = useState(preferences.expandByDefault);

  // Fetch interest data
  const {
    data: interestData,
    isLoading,
    error,
    refetch,
  } = useQuery<InterestSummary | { enabled: false; config?: null }>({
    queryKey: ['wallet-interest', wallet.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/workspaces/${wsId}/wallets/${wallet.id}/interest`
      );
      if (!res.ok) {
        if (res.status === 404) return { enabled: false };
        throw new Error('Failed to fetch interest data');
      }
      return res.json();
    },
    staleTime: 30000, // 30 seconds
  });

  const handleEnableClick = useCallback(
    (_detection: ProviderDetectionResult) => {
      setShowSetup(true);
    },
    []
  );

  const handleConfigChange = useCallback(() => {
    refetch();
    setShowSetup(false);
  }, [refetch]);

  const handleToggleDetails = useCallback(() => {
    setShowDetails((prev) => !prev);
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <>
        <Card>
          <CardHeader className="pb-2">
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-24" />
            <div className="grid gap-4 md:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          </CardContent>
        </Card>
        <Separator className="my-4" />
      </>
    );
  }

  // Error state - silently fail since interest is optional
  if (error) {
    return null;
  }

  const hasConfig =
    interestData && 'config' in interestData && interestData.config != null;
  const isEnabled =
    hasConfig && (interestData as InterestSummary).config?.enabled;

  // If no config and not setting up, show detection banner
  if (!hasConfig && !showSetup) {
    if (!experimentalEnabled) return null;

    return (
      <WalletInterestDetectionBanner
        wallet={wallet}
        hasInterestConfig={false}
        onEnableClick={handleEnableClick}
      />
    );
  }

  // If setting up (from banner click), show settings
  if (showSetup && !hasConfig) {
    return (
      <>
        <WalletInterestSettings
          wsId={wsId}
          walletId={wallet.id!}
          config={null}
          currentRate={null}
          onConfigChange={handleConfigChange}
        />
        <Separator className="my-4" />
      </>
    );
  }

  // Cast to InterestSummary now that we know it has config
  const summary = interestData as InterestSummary;

  // If config exists but disabled, show compact view with settings
  if (hasConfig && !isEnabled) {
    return (
      <>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5" />
              {t('interest_tracking')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-muted-foreground text-sm">
              {t('tracking_paused')}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <WalletInterestSettings
                wsId={wsId}
                walletId={wallet.id!}
                config={summary.config}
                currentRate={summary.currentRate}
                onConfigChange={handleConfigChange}
                embedded
              />
              <WalletInterestRateHistory
                rates={summary.rateHistory || []}
                embedded
              />
            </div>
          </CardContent>
        </Card>
        <Separator className="my-4" />
      </>
    );
  }

  // Full interest UI for enabled configs
  const hasProjections =
    summary.projections &&
    (summary.projections.week?.length > 0 ||
      summary.projections.month?.length > 0);

  const currency = wallet.currency ?? 'VND';

  return (
    <>
      <div className="space-y-4">
        {/* Always visible hero card */}
        <WalletInterestHero
          summary={summary}
          currency={currency}
          expanded={showDetails}
          onToggle={handleToggleDetails}
        />

        {/* Expandable details section */}
        {showDetails && (
          <div className="space-y-4">
            {/* Interactive chart */}
            {hasProjections && preferences.showChart && (
              <WalletInterestChart
                projections={summary.projections}
                currency={currency}
                currentBalance={wallet.balance ?? 0}
                defaultPeriod={preferences.chartPeriod}
                showProjections={preferences.showProjections}
                onPeriodChange={(period) =>
                  updatePreference('chartPeriod', period)
                }
                onShowProjectionsChange={(show) =>
                  updatePreference('showProjections', show)
                }
              />
            )}

            {/* Pending deposits */}
            {summary.pendingDeposits.length > 0 && (
              <WalletInterestPendingDeposits
                deposits={summary.pendingDeposits}
                currency={currency}
              />
            )}

            {/* Transparency and Settings Grid */}
            <div className="grid gap-4 md:grid-cols-2">
              <WalletInterestTransparency
                rate={summary.currentRate?.annual_rate ?? 0}
                rateHistory={summary.rateHistory || []}
                provider={summary.config.provider}
                currency={currency}
              />
              <WalletInterestSettings
                wsId={wsId}
                walletId={wallet.id!}
                config={summary.config}
                currentRate={summary.currentRate}
                onConfigChange={handleConfigChange}
                embedded
              />
            </div>
          </div>
        )}
      </div>
      <Separator className="my-4" />
    </>
  );
}
