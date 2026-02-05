'use client';

import { ChevronDown, RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
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
  scoreCalculationMethod = 'LATEST',
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
    // For existing reports — enrich with vital names when available
    return (scores || []).map((score, idx) => ({
      score,
      vital: healthcareVitals[idx] ?? undefined,
      isFromVital: idx < healthcareVitals.length,
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

  const methodLabel =
    scoreCalculationMethod === 'LATEST'
      ? t('ws-reports.latest')
      : t('ws-reports.average');

  const isLatest = scoreCalculationMethod === 'LATEST';

  return (
    <div className="space-y-3">
      {/* Header with Fetch New Scores button for existing reports */}
      <div className="flex items-center justify-between">
        <div className="font-semibold text-lg">{t('ws-reports.user_data')}</div>
        {fetchButton}
      </div>

      {confirmEmptyDialog}

      {/* Representative Score Bar */}
      <div className="rounded-lg bg-muted/50 px-4 py-3">
        <div className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {t('ws-reports.representative_score')}
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-muted-foreground text-sm">
            {methodLabel} · {individualScoresWithMetadata.length}{' '}
            {t('ws-reports.scores').toLowerCase()}
          </span>
          <span className="font-bold text-2xl tabular-nums">
            {representativeScore?.toFixed(1) ?? '-'}
          </span>
        </div>
      </div>

      {/* Score Breakdown Grid */}
      {individualScoresWithMetadata.length > 0 && (
        <ScoreBreakdownGrid
          scores={individualScoresWithMetadata}
          reportId={reportId}
          isLatest={isLatest}
          factorEnabled={factorEnabled}
          t={t}
        />
      )}
    </div>
  );
}

interface ScoreWithMetadata {
  score: number;
  vital?: HealthcareVital;
  isFromVital: boolean;
}

function ScoreCard({
  scoreData,
  idx,
  reportId,
  isLastScore,
  factorEnabled,
}: {
  scoreData: ScoreWithMetadata;
  idx: number;
  reportId?: string;
  isLastScore: boolean;
  factorEnabled: boolean;
}) {
  const t = useTranslations();
  const displayName =
    scoreData.isFromVital && scoreData.vital
      ? scoreData.vital.name
      : `Score #${idx + 1}`;

  return (
    <Tooltip key={`report-${reportId}-score-${idx}`}>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'flex cursor-help flex-col items-center rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-accent/50',
            isLastScore && 'border-dynamic-blue/30 ring-2 ring-dynamic-blue'
          )}
        >
          <span className="w-full truncate text-center text-muted-foreground text-xs">
            {displayName}
          </span>
          <span className="font-semibold text-lg tabular-nums">
            {scoreData.score}
          </span>
          {isLastScore && (
            <span className="font-medium text-[10px] text-dynamic-blue uppercase">
              {t('ws-reports.latest')}
            </span>
          )}
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
  );
}

function ScoreBreakdownGrid({
  scores,
  reportId,
  isLatest,
  factorEnabled,
  t,
}: {
  scores: ScoreWithMetadata[];
  reportId?: string;
  isLatest: boolean;
  factorEnabled: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const [emptyOpen, setEmptyOpen] = useState(false);

  const filledScores: Array<{ data: ScoreWithMetadata; originalIdx: number }> =
    [];
  const emptyScores: Array<{ data: ScoreWithMetadata; originalIdx: number }> =
    [];

  scores.forEach((scoreData, idx) => {
    const isEmpty =
      !scoreData.score ||
      (scoreData.isFromVital &&
        scoreData.vital &&
        (scoreData.vital.value === null ||
          scoreData.vital.value === undefined));
    if (isEmpty) {
      emptyScores.push({ data: scoreData, originalIdx: idx });
    } else {
      filledScores.push({ data: scoreData, originalIdx: idx });
    }
  });

  const lastFilledIdx =
    filledScores.length > 0
      ? filledScores[filledScores.length - 1]!.originalIdx
      : -1;

  return (
    <div className="space-y-3">
      {filledScores.length > 0 && (
        <div>
          <div className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
            {t('ws-reports.score_breakdown')}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {filledScores.map(({ data, originalIdx }) => (
              <ScoreCard
                key={`report-${reportId}-score-${originalIdx}`}
                scoreData={data}
                idx={originalIdx}
                reportId={reportId}
                isLastScore={isLatest && originalIdx === lastFilledIdx}
                factorEnabled={factorEnabled}
              />
            ))}
          </div>
        </div>
      )}

      {emptyScores.length > 0 && (
        <Collapsible open={emptyOpen} onOpenChange={setEmptyOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="flex w-full items-center justify-between"
            >
              <span className="text-muted-foreground text-xs uppercase tracking-wider">
                {t('ws-reports.empty_scores')} ({emptyScores.length})
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${emptyOpen ? 'rotate-180' : ''}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {emptyScores.map(({ data, originalIdx }) => (
                <ScoreCard
                  key={`report-${reportId}-score-${originalIdx}`}
                  scoreData={data}
                  idx={originalIdx}
                  reportId={reportId}
                  isLastScore={false}
                  factorEnabled={factorEnabled}
                />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
