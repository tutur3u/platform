'use client';

import type {
  AuroraMLMetrics,
  AuroraStatisticalMetrics,
} from '@tuturuuu/types/db';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
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

const AdvancedAnalytics = ({
  mlMetrics,
  statisticalMetrics,
}: {
  mlMetrics: AuroraMLMetrics[];
  statisticalMetrics: AuroraStatisticalMetrics[];
}) => {
  const t = useTranslations();

  const { resolvedTheme } = useTheme();
  const colors = resolvedTheme === 'dark' ? COLORS.dark : COLORS.light;

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
        <CardTitle>{t('aurora.model_performance')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="statistical">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="statistical">
              {t('aurora.statistical_models')}
            </TabsTrigger>
            <TabsTrigger value="ml">{t('aurora.ml_models')}</TabsTrigger>
          </TabsList>

          <TabsContent value="statistical" className="space-y-4">
            {statisticalScores && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <ModelScoreCard
                  title={t('aurora.best_performing')}
                  model={statisticalScores.bestModel}
                  color={colors.success}
                  previousScore={statisticalScores.scores[0]?.overallScore}
                  t={t}
                />
                <ModelScoreCard
                  title={t('aurora.average_performance')}
                  score={statisticalScores.averageScore}
                  color={colors.primary}
                  previousScore={statisticalScores.scores[0]?.overallScore}
                  t={t}
                />
                <ModelScoreCard
                  title={t('aurora.worst_performing')}
                  model={statisticalScores.worstModel}
                  color={colors.warning}
                  previousScore={statisticalScores.scores[0]?.overallScore}
                  t={t}
                />
              </div>
            )}

            <MetricsChart
              t={t}
              tag="statistical"
              data={[
                ...statisticalData,
                ...statisticalScaledData.map((d) => ({
                  ...d,
                  model: `${d.model} ${t('aurora.scaled_model')}`,
                })),
              ]}
              scores={statisticalScores?.scores}
            />
          </TabsContent>

          <TabsContent value="ml">
            {mlScores && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <ModelScoreCard
                  title={t('aurora.best_performing')}
                  model={mlScores.bestModel}
                  color={colors.success}
                  previousScore={mlScores.scores[0]?.overallScore}
                  t={t}
                />
                <ModelScoreCard
                  title={t('aurora.average_performance')}
                  score={mlScores.averageScore}
                  color={colors.primary}
                  previousScore={mlScores.scores[0]?.overallScore}
                  t={t}
                />
                <ModelScoreCard
                  title={t('aurora.worst_performing')}
                  model={mlScores.worstModel}
                  color={colors.warning}
                  previousScore={mlScores.scores[0]?.overallScore}
                  t={t}
                />
              </div>
            )}
            <MetricsChart
              t={t}
              tag="ml"
              data={mlData}
              scores={mlScores?.scores}
            />
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
  t,
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
  t: any;
}) => {
  const { resolvedTheme } = useTheme();
  const colors = resolvedTheme === 'dark' ? COLORS.dark : COLORS.light;

  const getTrendIndicator = (current: number, previous?: number) => {
    if (!previous) return null;
    const diff = current - previous;
    const threshold = 1; // 1% threshold for significant change

    if (Math.abs(diff) < threshold) {
      return { icon: '→', label: t('aurora.stable') };
    }
    return diff > 0
      ? { icon: '↗', label: t('aurora.improving'), color: colors.success }
      : { icon: '↘', label: t('aurora.declining'), color: colors.warning };
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
              {/* <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t('aurora.accuracy')}
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
              </div> */}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t('aurora.consistency')}
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
                  <span className="text-sm text-muted-foreground">
                    {t('aurora.overall')}
                  </span>
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

const MetricsChart = ({
  t,
  tag,
  data,
  scores,
}: {
  t: any;
  tag: string;
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
            {/* Added secondary YAxis for percentage metrics */}
            <YAxis
              yAxisId="percent"
              orientation="right"
              stroke={colors.axis}
              tick={{ fill: colors.axis, fontSize: 12 }}
              tickMargin={10}
              tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
            />
            <Tooltip
              cursor={{ fill: colors.confidence }}
              contentStyle={{
                backgroundColor: colors.tooltip.bg,
                border: `1px solid ${colors.tooltip.border}`,
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                borderRadius: '8px',
                padding: '12px 16px',
              }}
              formatter={(value: number, name: string) => [
                name === 'directionalAccuracy' ||
                name === 'turningPointAccuracy'
                  ? (value * 100).toFixed(3)
                  : value.toFixed(3),
                name === 'rmse'
                  ? 'RMSE'
                  : name === 'directionalAccuracy'
                    ? t('aurora.directional_accuracy')
                    : name === 'turningPointAccuracy'
                      ? t('aurora.turning_point_accuracy')
                      : t('aurora.weighted_score'),
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
                <span style={{ fontSize: '14px' }}>
                  {value === 'rmse'
                    ? 'RMSE'
                    : value === 'directionalAccuracy'
                      ? t('aurora.directional_accuracy')
                      : value === 'turningPointAccuracy'
                        ? t('aurora.turning_point_accuracy')
                        : t('aurora.weighted_score')}
                </span>
              )}
            />
            <Bar
              dataKey="rmse"
              fill={colors.primary}
              name="rmse"
              animationDuration={300}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="directionalAccuracy"
              fill={colors.success}
              name="directionalAccuracy"
              animationDuration={300}
              radius={[4, 4, 0, 0]}
              yAxisId="percent"
            />
            <Bar
              dataKey="turningPointAccuracy"
              fill={colors.warning}
              name="turningPointAccuracy"
              animationDuration={300}
              radius={[4, 4, 0, 0]}
              yAxisId="percent"
            />
            <Bar
              dataKey="weightedScore"
              fill={colors.info}
              name="weightedScore"
              animationDuration={300}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Rest of the component remains the same */}
      {scores && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {scores
            .filter(
              (score, index, self) =>
                self.findIndex((s) => s.model === score.model) === index
            )
            .map((score) => (
              <Card
                key={`${tag}-${score.model}`}
                className="transition-all duration-200 hover:shadow-md"
              >
                <CardContent className="pt-6">
                  <h3 className="text-base font-medium">{score.model}</h3>
                  <div className="mt-4 space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          {t('aurora.consistency')}
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
                          {t('aurora.overall')}
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
