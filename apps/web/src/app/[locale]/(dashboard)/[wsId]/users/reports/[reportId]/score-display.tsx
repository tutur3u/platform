'use client';

import { RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface HealthcareVital {
  id: string;
  name: string;
  unit: string;
  factor: number;
  value: number | null;
}

interface ScoreDisplayProps {
  // For new reports with healthcare vitals
  healthcareVitals?: HealthcareVital[];
  healthcareVitalsLoading?: boolean;
  isNew?: boolean;
  // For existing reports
  scores?: number[] | null;
  // Report ID for unique keys
  reportId?: string;
  // For fetching new scores
  onFetchNewScores?: (options?: { force?: boolean }) => Promise<any>;
  isFetchingNewScores?: boolean;
  factorEnabled?: boolean;
  scoreCalculationMethod?: 'AVERAGE' | 'LATEST';
}

export default function ScoreDisplay({
  healthcareVitals = [],
  healthcareVitalsLoading = false,
  isNew = false,
  scores = [],
  reportId,
  onFetchNewScores,
  isFetchingNewScores = false,
  factorEnabled = false,
  scoreCalculationMethod = 'AVERAGE',
}: ScoreDisplayProps) {
  const t = useTranslations();

  const [showConfirmEmptyDialog, setShowConfirmEmptyDialog] = useState(false);

  const handleFetch = async (options?: { force?: boolean }) => {
    if (!onFetchNewScores) return;
    try {
      const result = await onFetchNewScores(options);
      if (result?.needsConfirmation) {
        setShowConfirmEmptyDialog(true);
      }
    } catch (error) {
      console.error('Failed to fetch new scores:', error);
    }
  };

  // Get individual scores with metadata for display
  const getIndividualScoresWithMetadata = (): Array<{
    score: number;
    vital?: HealthcareVital;
    isFromVital: boolean;
  }> => {
    if (isNew && healthcareVitals.length > 0) {
      return healthcareVitals
        .filter((vital) => vital.value !== null && vital.value !== undefined)
        .map((vital) => {
          const baseValue = vital.value ?? 0;
          // Apply factor only if feature flag is enabled
          const calculatedScore = factorEnabled
            ? baseValue * (vital.factor ?? 1)
            : baseValue;
          return {
            score: calculatedScore,
            vital,
            isFromVital: true,
          };
        });
    }
    return (scores || []).map((score) => ({
      score,
      isFromVital: false,
    }));
  };

  // Get representative score
  const getRepresentativeScore = (): number | null => {
    const currentScores =
      isNew && healthcareVitals.length > 0
        ? healthcareVitals
            .filter(
              (vital) => vital.value !== null && vital.value !== undefined
            )
            .map((vital) => {
              const baseValue = vital.value ?? 0;
              return factorEnabled
                ? baseValue * (vital.factor ?? 1)
                : baseValue;
            })
        : scores || [];

    if (currentScores.length === 0) return null;

    if (scoreCalculationMethod === 'LATEST') {
      const lastScore = currentScores[currentScores.length - 1];
      return lastScore !== undefined ? lastScore : null;
    }

    const totalScore = currentScores.reduce((a, b) => a + b, 0);
    return totalScore / currentScores.length;
  };

  const representativeScore = getRepresentativeScore();
  const individualScoresWithMetadata = getIndividualScoresWithMetadata();

  // Loading state
  if (isNew && healthcareVitalsLoading) {
    return (
      <div className="text-muted-foreground text-sm">
        {t('common.loading')}...
      </div>
    );
  }

  const fetchButton = !isNew && onFetchNewScores && (
    <Button
      size="sm"
      variant="outline"
      onClick={() => handleFetch()}
      disabled={isFetchingNewScores}
      className="gap-2"
    >
      <RefreshCw
        className={`h-4 w-4 ${isFetchingNewScores ? 'animate-spin' : ''}`}
      />
      {isFetchingNewScores
        ? t('common.loading')
        : t('ws-reports.fetch_new_scores')}
    </Button>
  );

  const confirmEmptyDialog = (
    <Dialog
      open={showConfirmEmptyDialog}
      onOpenChange={setShowConfirmEmptyDialog}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('ws-reports.no_scores_fetched_title')}</DialogTitle>
          <DialogDescription>
            {t('ws-reports.no_scores_fetched_confirm')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setShowConfirmEmptyDialog(false)}
          >
            {t('ws-reports.keep_old_scores')}
          </Button>
          <Button
            onClick={() => {
              handleFetch({ force: true });
              setShowConfirmEmptyDialog(false);
            }}
          >
            {t('ws-reports.use_empty_data')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // No data state
  if (
    (isNew && healthcareVitals.length === 0) ||
    (!isNew && (!scores || scores.length === 0))
  ) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-lg">
            {t('ws-reports.user_data')}
          </div>
          {fetchButton}
        </div>
        <div className="text-dynamic-red">{t('ws-reports.no_scores')}</div>
        {confirmEmptyDialog}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header with Fetch New Scores button for existing reports */}
      <div className="flex items-center justify-between">
        <div className="font-semibold text-lg">{t('ws-reports.user_data')}</div>
        {fetchButton}
      </div>

      {confirmEmptyDialog}

      {/* Representative Score Display */}
      <div className="flex items-center gap-1">
        {t('ws-reports.representative_score')}:
        <div className="flex flex-wrap gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex h-8 min-w-8 cursor-help items-center justify-center rounded bg-foreground px-2 font-semibold text-background">
                {representativeScore?.toFixed(1) || '-'}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-1">
                <div className="font-semibold">
                  {scoreCalculationMethod === 'LATEST'
                    ? t('ws-reports.latest')
                    : t('ws-reports.average')}
                </div>
                <div className="text-muted-foreground text-xs">
                  {individualScoresWithMetadata.length} {t('ws-reports.scores')}
                </div>
                {isNew && healthcareVitals.length > 0 ? (
                  <div className="text-xs">
                    Calculated from healthcare vitals
                    {factorEnabled ? ' (with factors)' : ' (raw values)'}
                  </div>
                ) : (
                  <div className="text-xs">Calculated from stored scores</div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Individual Scores Display - Unified UI */}
      <div className="flex items-center gap-1">
        {t('ws-reports.scores')}:
        <div className="flex flex-wrap gap-1">
          {individualScoresWithMetadata.map((scoreData, idx) => (
            <Tooltip key={`report-${reportId}-score-${idx}`}>
              <TooltipTrigger asChild>
                <div className="flex h-8 min-w-8 cursor-help items-center justify-center rounded bg-foreground px-2 font-semibold text-background">
                  {scoreData.score}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {scoreData.isFromVital && scoreData.vital ? (
                  <div className="space-y-1">
                    <div className="font-semibold">{scoreData.vital.name}</div>
                    <div className="text-muted-foreground text-xs">
                      Unit: {scoreData.vital.unit}
                    </div>
                    <div className="text-xs">
                      {factorEnabled ? (
                        <>
                          Calculation: {scoreData.vital.value} ×{' '}
                          {scoreData.vital.factor} = {scoreData.score}
                        </>
                      ) : (
                        <>Value: {scoreData.vital.value} (factor disabled)</>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs">Stored score: {scoreData.score}</div>
                )}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  );
}
