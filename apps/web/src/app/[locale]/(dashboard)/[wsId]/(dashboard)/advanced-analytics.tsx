'use client';

import {
  fetchAuroraMLMetrics,
  fetchAuroraStatisticalMetrics,
} from '@/lib/aurora';
import type {
  AuroraMLMetrics,
  AuroraStatisticalMetrics,
} from '@tutur3u/types/db';
import { Alert, AlertDescription, AlertTitle } from '@tutur3u/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@tutur3u/ui/card';
import { useToast } from '@tutur3u/ui/hooks/use-toast';
import { Skeleton } from '@tutur3u/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tutur3u/ui/tabs';
import { AlertCircle } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const COLORS = {
  light: {
    primary: '#2563eb', // Blue 600
    success: '#16a34a', // Green 600
    warning: '#d97706', // Amber 600
    info: '#0891b2', // Cyan 600
    grid: '#e5e7eb', // Gray 200
    axis: '#4b5563', // Gray 600
    text: '#1f2937', // Gray 800
    confidence: 'rgba(37, 99, 235, 0.15)', // Blue 600 with opacity
    tooltip: {
      bg: '#ffffff',
      border: '#e5e7eb',
      text: '#1f2937',
    },
    gradient: {
      from: '#dbeafe', // Blue 100
      to: '#2563eb', // Blue 600
    },
  },
  dark: {
    primary: '#3b82f6', // Blue 500
    success: '#22c55e', // Green 500
    warning: '#f59e0b', // Amber 500
    info: '#06b6d4', // Cyan 500
    grid: '#374151', // Gray 700
    axis: '#9ca3af', // Gray 400
    text: '#f3f4f6', // Gray 100
    confidence: 'rgba(59, 130, 246, 0.15)', // Blue 500 with opacity
    tooltip: {
      bg: '#1f2937',
      border: '#374151',
      text: '#f3f4f6',
    },
    gradient: {
      from: '#1e3a8a', // Blue 900
      to: '#3b82f6', // Blue 500
    },
  },
};

const formatPercentage = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
};

type Translations = {
  advancedAnalytics: string;
  statisticalMetrics: string;
  mlMetrics: string;
  noScaling: string;
  withScaling: string;
  rmse: string;
  directionalAccuracy: string;
  turningPointAccuracy: string;
  weightedScore: string;
  error: string;
  tryAgain: string;
  loading: string;
  modelPerformance: string;
  modelAccuracy: string;
  modelComparison: string;
  bestPerforming: string;
  worstPerforming: string;
  averagePerformance: string;
  performanceMetrics: string;
  modelInsights: string;
  accuracyScore: string;
  consistencyScore: string;
  overallScore: string;
  statisticalModels: string;
  mlModels: string;
  performanceTrend: string;
  improving: string;
  stable: string;
  declining: string;
  modelStrengths: string;
  modelWeaknesses: string;
  comparisonInsights: string;
  highAccuracy: string;
  goodConsistency: string;
  lowError: string;
  needsImprovement: string;
  recommendations: string;
  scaledModel: string;
  scalingExplanation: string;
  metricExplanations: {
    rmse: string;
    directionalAccuracy: string;
    turningPointAccuracy: string;
    weightedScore: string;
  };
  performanceComparison: string;
  scalingImpact: string;
  improvement: string;
  degradation: string;
};

const translations: { en: Translations; vi: Partial<Translations> } = {
  en: {
    advancedAnalytics: 'Model Performance Analytics',
    statisticalMetrics: 'Statistical Models',
    mlMetrics: 'Machine Learning Models',
    noScaling: 'Without Scaling',
    withScaling: 'With Scaling',
    rmse: 'RMSE',
    directionalAccuracy: 'Directional Accuracy',
    turningPointAccuracy: 'Turning Point Accuracy',
    weightedScore: 'Weighted Score',
    error: 'Error',
    tryAgain: 'Try Again',
    loading: 'Loading analytics data...',
    modelPerformance: 'Model Performance',
    modelAccuracy: 'Model Accuracy',
    modelComparison: 'Model Performance Comparison',
    bestPerforming: 'Best Performing Model',
    worstPerforming: 'Worst Performing Model',
    averagePerformance: 'Average Performance',
    performanceMetrics: 'Performance Metrics',
    modelInsights: 'Model Insights',
    accuracyScore: 'Accuracy Score',
    consistencyScore: 'Consistency Score',
    overallScore: 'Overall Score',
    statisticalModels: 'Statistical Models',
    mlModels: 'ML Models',
    performanceTrend: 'Performance Trend',
    improving: 'Improving',
    stable: 'Stable',
    declining: 'Declining',
    modelStrengths: 'Model Strengths',
    modelWeaknesses: 'Model Weaknesses',
    comparisonInsights: 'Comparison Insights',
    highAccuracy: 'High Accuracy',
    goodConsistency: 'Good Consistency',
    lowError: 'Low Error Rate',
    needsImprovement: 'Needs Improvement',
    recommendations: 'Recommendations',
    scaledModel: '(Scaled)',
    scalingExplanation:
      'Scaling helps normalize data for better model comparison',
    metricExplanations: {
      rmse: 'Root Mean Square Error - Lower is better',
      directionalAccuracy:
        'Ability to predict price direction - Higher is better',
      turningPointAccuracy:
        'Ability to predict trend changes - Higher is better',
      weightedScore: 'Overall weighted performance - Higher is better',
    },
    performanceComparison: 'Performance Comparison',
    scalingImpact: 'Impact of Scaling',
    improvement: 'Improvement',
    degradation: 'Degradation',
  },
  vi: {
    // ... existing translations
  },
};

const AdvancedAnalytics = () => {
  const { resolvedTheme } = useTheme();
  const colors = resolvedTheme === 'dark' ? COLORS.dark : COLORS.light;
  const [statisticalMetrics, setStatisticalMetrics] = useState<
    AuroraStatisticalMetrics[]
  >([]);
  const [mlMetrics, setMLMetrics] = useState<AuroraMLMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [statistical, ml] = await Promise.all([
          fetchAuroraStatisticalMetrics(),
          fetchAuroraMLMetrics(),
        ]);
        setStatisticalMetrics(statistical);
        setMLMetrics(ml);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to fetch metrics data';
        setError(message);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: message,
        });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [toast]);

  const t = translations['en'];

  const calculateModelScores = (metrics: any[]) => {
    if (!metrics.length) return null;

    const scores = metrics.map((metric) => ({
      model: metric.model,
      accuracyScore: calculateAccuracyScore(metric),
      consistencyScore: calculateConsistencyScore(metric),
      overallScore: calculateOverallScore(metric),
    }));

    const sortedScores = [...scores].sort(
      (a, b) => b.overallScore - a.overallScore
    );
    const bestModel = sortedScores[0];
    const worstModel = sortedScores[sortedScores.length - 1];
    const averageScore =
      scores.reduce((acc, curr) => acc + curr.overallScore, 0) / scores.length;

    return {
      scores,
      bestModel,
      worstModel,
      averageScore,
    };
  };

  const calculateAccuracyScore = (metric: any) => {
    const rmseWeight = 0.4;
    const daWeight = 0.3;
    const tpaWeight = 0.3;

    // Normalize RMSE (lower is better)
    const normalizedRMSE = 1 - Math.min(metric.rmse / 100, 1);

    // Directional accuracy and turning point accuracy are already percentages
    return (
      (normalizedRMSE * rmseWeight +
        (metric.directional_accuracy / 100) * daWeight +
        (metric.turning_point_accuracy / 100) * tpaWeight) *
      100
    );
  };

  const calculateConsistencyScore = (metric: any) => {
    // Assuming weighted_score represents consistency
    return metric.weighted_score;
  };

  const calculateOverallScore = (metric: any) => {
    const accuracyWeight = 0.6;
    const consistencyWeight = 0.4;

    const accuracyScore = calculateAccuracyScore(metric);
    const consistencyScore = calculateConsistencyScore(metric);

    return (
      accuracyScore * accuracyWeight + consistencyScore * consistencyWeight
    );
  };

  const statisticalScores = calculateModelScores(
    statisticalMetrics.filter((m) => !m.no_scaling)
  );
  const mlScores = calculateModelScores(mlMetrics);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Skeleton className="h-6 w-[200px]" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-[60px] w-full" />
            <Skeleton className="h-[400px] w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.advancedAnalytics}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t.error}</AlertTitle>
            <AlertDescription className="flex flex-col gap-2">
              {error}
              <button
                onClick={() => window.location.reload()}
                className="w-fit rounded-md bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20"
              >
                {t.tryAgain}
              </button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const statisticalData = statisticalMetrics
    .filter((metric) => metric.no_scaling)
    .map((metric) => ({
      model: metric.model,
      rmse: metric.rmse,
      directionalAccuracy: metric.directional_accuracy,
      turningPointAccuracy: metric.turning_point_accuracy,
      weightedScore: metric.weighted_score,
    }));

  const statisticalScaledData = statisticalMetrics
    .filter((metric) => !metric.no_scaling)
    .map((metric) => ({
      model: metric.model,
      rmse: metric.rmse,
      directionalAccuracy: metric.directional_accuracy,
      turningPointAccuracy: metric.turning_point_accuracy,
      weightedScore: metric.weighted_score,
    }));

  const mlData = mlMetrics.map((metric) => ({
    model: metric.model,
    rmse: metric.rmse,
    directionalAccuracy: metric.directional_accuracy,
    turningPointAccuracy: metric.turning_point_accuracy,
    weightedScore: metric.weighted_score,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.modelPerformance}</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="statistical">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="statistical">{t.statisticalModels}</TabsTrigger>
            <TabsTrigger value="ml">{t.mlModels}</TabsTrigger>
          </TabsList>

          <TabsContent value="statistical" className="space-y-4">
            {statisticalScores && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <ModelScoreCard
                  title={t.bestPerforming}
                  model={statisticalScores.bestModel}
                  color={colors.success}
                  previousScore={statisticalScores.scores[0]?.overallScore}
                  translations={t}
                />
                <ModelScoreCard
                  title={t.averagePerformance}
                  score={statisticalScores.averageScore}
                  color={colors.primary}
                  previousScore={statisticalScores.scores[0]?.overallScore}
                  translations={t}
                />
                <ModelScoreCard
                  title={t.worstPerforming}
                  model={statisticalScores.worstModel}
                  color={colors.warning}
                  previousScore={statisticalScores.scores[0]?.overallScore}
                  translations={t}
                />
              </div>
            )}

            <MetricsChart
              data={[
                ...statisticalData,
                ...statisticalScaledData.map((d) => ({
                  ...d,
                  model: `${d.model} ${t.scaledModel}`,
                })),
              ]}
              scores={statisticalScores?.scores}
            />

            {statisticalScores && (
              <ModelInsightsSection
                scores={statisticalScores.scores}
                translations={t}
              />
            )}
          </TabsContent>

          <TabsContent value="ml">
            {mlScores && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <ModelScoreCard
                  title={t.bestPerforming}
                  model={mlScores.bestModel}
                  color={colors.success}
                  previousScore={mlScores.scores[0]?.overallScore}
                  translations={t}
                />
                <ModelScoreCard
                  title={t.averagePerformance}
                  score={mlScores.averageScore}
                  color={colors.primary}
                  previousScore={mlScores.scores[0]?.overallScore}
                  translations={t}
                />
                <ModelScoreCard
                  title={t.worstPerforming}
                  model={mlScores.worstModel}
                  color={colors.warning}
                  previousScore={mlScores.scores[0]?.overallScore}
                  translations={t}
                />
              </div>
            )}
            <MetricsChart data={mlData} scores={mlScores?.scores} />
            {mlScores && (
              <ModelInsightsSection scores={mlScores.scores} translations={t} />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

const ModelScoreCard = ({
  title,
  model,
  score,
  color,
  previousScore,
  translations,
}: {
  title: string;
  model?: {
    model: string;
    accuracyScore: number;
    consistencyScore: number;
    overallScore: number;
  };
  score?: number;
  color: string;
  previousScore?: number;
  translations: Translations;
}) => {
  const { resolvedTheme } = useTheme();
  const colors = resolvedTheme === 'dark' ? COLORS.dark : COLORS.light;

  const getTrendIndicator = (current: number, previous?: number) => {
    if (!previous) return null;
    const diff = current - previous;
    const threshold = 1; // 1% threshold for significant change

    if (Math.abs(diff) < threshold) {
      return { icon: '→', label: translations.stable, color: colors.text };
    }
    return diff > 0
      ? { icon: '↗', label: translations.improving, color: colors.success }
      : { icon: '↘', label: translations.declining, color: colors.warning };
  };

  const trend = model
    ? getTrendIndicator(model.overallScore, previousScore)
    : getTrendIndicator(score || 0, previousScore);

  return (
    <Card className="transition-all duration-200 hover:shadow-md">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
          {trend && (
            <div
              className="flex items-center gap-1 text-sm font-medium"
              style={{ color: trend.color }}
            >
              {trend.icon} {trend.label}
            </div>
          )}
        </div>
        {model ? (
          <div className="mt-4 space-y-4">
            <div className="text-2xl font-bold" style={{ color }}>
              {model.model}
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Accuracy
                  </span>
                  <span className="font-medium">
                    {formatPercentage(model.accuracyScore)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted/20">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${model.accuracyScore}%`,
                      background: `linear-gradient(90deg, ${colors.gradient.from}, ${colors.gradient.to})`,
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Consistency
                  </span>
                  <span className="font-medium">
                    {formatPercentage(model.consistencyScore)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted/20">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${model.consistencyScore}%`,
                      background: `linear-gradient(90deg, ${colors.gradient.from}, ${colors.gradient.to})`,
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Overall</span>
                  <span className="font-medium">
                    {formatPercentage(model.overallScore)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted/20">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${model.overallScore}%`,
                      background: `linear-gradient(90deg, ${colors.gradient.from}, ${colors.gradient.to})`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <div className="text-2xl font-bold" style={{ color }}>
              {formatPercentage(score || 0)}
            </div>
            <div className="mt-2">
              <div className="h-2 overflow-hidden rounded-full bg-muted/20">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${score}%`,
                    background: `linear-gradient(90deg, ${colors.gradient.from}, ${colors.gradient.to})`,
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const ModelInsightsSection = ({
  scores,
  translations,
}: {
  scores?: {
    model: string;
    accuracyScore: number;
    consistencyScore: number;
    overallScore: number;
  }[];
  translations: Translations;
}) => {
  if (!scores || scores.length === 0) return null;

  const getModelStrengths = (score: (typeof scores)[0]) => {
    const strengths = [];
    if (score.accuracyScore >= 85) strengths.push(translations.highAccuracy);
    if (score.consistencyScore >= 80)
      strengths.push(translations.goodConsistency);
    if (score.overallScore >= 85) strengths.push(translations.lowError);
    return strengths;
  };

  const getModelWeaknesses = (score: (typeof scores)[0]) => {
    const weaknesses = [];
    if (score.accuracyScore < 70) weaknesses.push('Accuracy');
    if (score.consistencyScore < 70) weaknesses.push('Consistency');
    if (score.overallScore < 70) weaknesses.push('Overall Performance');
    return weaknesses;
  };

  const sortedScores = [...scores].sort(
    (a, b) => b.overallScore - a.overallScore
  );
  const bestModel = sortedScores[0];
  const worstModel = sortedScores[sortedScores.length - 1];

  if (!bestModel || !worstModel) return null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>{translations.comparisonInsights}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h4 className="mb-4 text-lg font-medium">{bestModel.model}</h4>
            <div className="space-y-4">
              <div>
                <h5 className="text-success mb-2 font-medium">
                  {translations.modelStrengths}
                </h5>
                <ul className="space-y-1">
                  {getModelStrengths(bestModel).map((strength) => (
                    <li
                      key={strength}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="text-success">✓</span> {strength}
                    </li>
                  ))}
                </ul>
              </div>
              {getModelWeaknesses(bestModel).length > 0 && (
                <div>
                  <h5 className="text-warning mb-2 font-medium">
                    {translations.needsImprovement}
                  </h5>
                  <ul className="space-y-1">
                    {getModelWeaknesses(bestModel).map((weakness) => (
                      <li
                        key={weakness}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span className="text-warning">!</span> {weakness}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div>
            <h4 className="mb-4 text-lg font-medium">
              {translations.recommendations}
            </h4>
            <div className="space-y-2">
              {bestModel.accuracyScore - worstModel.accuracyScore > 15 && (
                <p className="text-sm">
                  Consider analyzing the features and training approach of{' '}
                  {bestModel.model} to improve {worstModel.model}'s accuracy.
                </p>
              )}
              {bestModel.consistencyScore - worstModel.consistencyScore >
                15 && (
                <p className="text-sm">
                  Investigate the stability factors in {bestModel.model} to
                  enhance {worstModel.model}'s consistency.
                </p>
              )}
              <p className="text-sm">
                Regular model retraining and validation can help maintain and
                improve performance across all metrics.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const MetricsChart = ({
  data,
  scores,
}: {
  data: any[];
  scores?: {
    model: string;
    accuracyScore: number;
    consistencyScore: number;
    overallScore: number;
  }[];
}) => {
  const { resolvedTheme } = useTheme();
  const colors = resolvedTheme === 'dark' ? COLORS.dark : COLORS.light;

  return (
    <div className="space-y-6">
      <div className="h-[400px] pt-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis
              dataKey="model"
              stroke={colors.axis}
              tick={{ fill: colors.axis, fontSize: 12 }}
              tickMargin={10}
            />
            <YAxis
              stroke={colors.axis}
              tick={{ fill: colors.axis, fontSize: 12 }}
              tickMargin={10}
              tickFormatter={(value) => value.toFixed(3)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: colors.tooltip.bg,
                border: `1px solid ${colors.tooltip.border}`,
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                borderRadius: '8px',
                padding: '12px 16px',
              }}
              formatter={(value: number, name: string) => [
                value.toFixed(3),
                name === 'rmse'
                  ? 'RMSE'
                  : name === 'directional_accuracy'
                    ? 'Directional Accuracy'
                    : name === 'turning_point_accuracy'
                      ? 'Turning Point Accuracy'
                      : 'Weighted Score',
              ]}
              labelStyle={{
                color: colors.tooltip.text,
                fontWeight: 'bold',
                marginBottom: '8px',
              }}
            />
            <Legend
              wrapperStyle={{
                paddingTop: '20px',
              }}
              formatter={(value) => (
                <span style={{ color: colors.text, fontSize: '14px' }}>
                  {value === 'rmse'
                    ? 'RMSE'
                    : value === 'directional_accuracy'
                      ? 'Directional Accuracy'
                      : value === 'turning_point_accuracy'
                        ? 'Turning Point Accuracy'
                        : 'Weighted Score'}
                </span>
              )}
            />
            <Bar
              dataKey="rmse"
              fill={colors.primary}
              name="RMSE"
              animationDuration={300}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="directional_accuracy"
              fill={colors.success}
              name="Directional Accuracy"
              animationDuration={300}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="turning_point_accuracy"
              fill={colors.warning}
              name="Turning Point Accuracy"
              animationDuration={300}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="weighted_score"
              fill={colors.info}
              name="Weighted Score"
              animationDuration={300}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {scores && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {scores.map((score) => (
            <Card
              key={score.model}
              className="transition-all duration-200 hover:shadow-md"
            >
              <CardContent className="pt-6">
                <h3 className="text-base font-medium">{score.model}</h3>
                <div className="mt-4 space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Accuracy
                      </span>
                      <span className="font-medium">
                        {formatPercentage(score.accuracyScore)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted/20">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${score.accuracyScore}%`,
                          background: `linear-gradient(90deg, ${colors.gradient.from}, ${colors.gradient.to})`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Consistency
                      </span>
                      <span className="font-medium">
                        {formatPercentage(score.consistencyScore)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted/20">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${score.consistencyScore}%`,
                          background: `linear-gradient(90deg, ${colors.gradient.from}, ${colors.gradient.to})`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Overall
                      </span>
                      <span className="font-medium">
                        {formatPercentage(score.overallScore)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted/20">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${score.overallScore}%`,
                          background: `linear-gradient(90deg, ${colors.gradient.from}, ${colors.gradient.to})`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdvancedAnalytics;
