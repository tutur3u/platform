'use client';

import { useTranslations } from 'next-intl';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { Button } from '@tuturuuu/ui/button';
import { RefreshCw } from '@tuturuuu/ui/icons';


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
  onFetchNewScores?: () => void;
  isFetchingNewScores?: boolean;
  factorEnabled?: boolean;
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
}: ScoreDisplayProps) {

    const t = useTranslations();
  // Calculate average score from healthcare vitals
  const calculateAverageFromVitals = (vitals: HealthcareVital[]): number | null => {
    const validVitals = vitals.filter((vital) => vital.value !== null && vital.value !== undefined);
    if (validVitals.length === 0) return null;
    
    const totalScore = validVitals
      .map((vital) => {
        const baseValue = vital.value ?? 0;
        // Apply factor only if feature flag is enabled
        return factorEnabled ? baseValue * (vital.factor ?? 1) : baseValue;
      })
      .reduce((a, b) => a + b, 0);
    
    return totalScore / validVitals.length;
  };

  // Calculate average score from existing scores
  const calculateAverageFromScores = (scores: number[] | null): number | null => {
    if (!scores || scores.length === 0) return null;
    
    const totalScore = scores.reduce((a, b) => a + b, 0);
    return totalScore / scores.length;
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
          const calculatedScore = factorEnabled ? baseValue * (vital.factor ?? 1) : baseValue;
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

  // Get average score
  const getAverageScore = (): number | null => {
    if (isNew && healthcareVitals.length > 0) {
      return calculateAverageFromVitals(healthcareVitals);
    }
    return calculateAverageFromScores(scores);
  };

  const averageScore = getAverageScore();
  const individualScoresWithMetadata = getIndividualScoresWithMetadata();

  // Loading state
  if (isNew && healthcareVitalsLoading) {
    return (
      <div className="text-sm text-muted-foreground">
        {t('common.loading')}...
      </div>
    );
  }

  // No data state
  if ((isNew && healthcareVitals.length === 0) || (!isNew && (!scores || scores.length === 0))) {
    return (
      <div className="text-dynamic-red">
        {isNew ? 'No healthcare vitals available' : t('ws-reports.no_scores')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header with Fetch New Scores button for existing reports */}
      <div className="flex items-center justify-between">
        <div className="font-semibold text-lg">
          {t('ws-reports.user_data')}
        </div>
        {!isNew && onFetchNewScores && (
          <Button
            size="sm"
            variant="outline"
            onClick={onFetchNewScores}
            disabled={isFetchingNewScores}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isFetchingNewScores ? 'animate-spin' : ''}`} />
            {isFetchingNewScores ? t('common.loading') : t('ws-reports.fetch_new_scores')}
          </Button>
        )}
      </div>

      {/* Average Score Display */}
      <div className="flex items-center gap-1">
        {t('ws-reports.average_score')}:
        <div className="flex flex-wrap gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex min-w-8 h-8 items-center justify-center rounded bg-foreground px-2 font-semibold text-background cursor-help">
                {averageScore?.toFixed(1) || '-'}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-1">
                <div className="font-semibold">{t('ws-reports.average_score')}</div>
                <div className="text-xs text-muted-foreground">
                  {individualScoresWithMetadata.length} {t('ws-reports.scores')}
                </div>
                {isNew && healthcareVitals.length > 0 ? (
                  <div className="text-xs">
                    Calculated from healthcare vitals
                    {factorEnabled ? ' (with factors)' : ' (raw values)'}
                  </div>
                ) : (
                  <div className="text-xs">
                    Calculated from stored scores
                  </div>
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
                <div className="flex min-w-8 h-8 items-center justify-center rounded bg-foreground px-2 font-semibold text-background cursor-help">
                  {scoreData.score}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {scoreData.isFromVital && scoreData.vital ? (
                  <div className="space-y-1">
                    <div className="font-semibold">{scoreData.vital.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Unit: {scoreData.vital.unit}
                    </div>
                    <div className="text-xs">
                      {factorEnabled ? (
                        <>Calculation: {scoreData.vital.value} × {scoreData.vital.factor} = {scoreData.score}</>
                      ) : (
                        <>Value: {scoreData.vital.value} (factor disabled)</>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs">
                    Stored score: {scoreData.score}
                  </div>
                )}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  );
}
