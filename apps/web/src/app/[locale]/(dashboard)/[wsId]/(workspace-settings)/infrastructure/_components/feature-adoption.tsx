'use client';

import type { FeatureAdoption } from '@tuturuuu/types';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

interface Props {
  features: FeatureAdoption[];
}

export default function FeatureAdoptionComponent({ features }: Props) {
  const t = useTranslations('infrastructure-analytics');

  const chartConfig = {
    adoption_percentage: {
      label: t('features.adoption-percentage'),
      color: 'hsl(217, 91%, 60%)',
    },
  };

  return (
    <div>
      <h3 className="font-semibold text-lg">{t('features.adoption-title')}</h3>
      <p className="text-muted-foreground text-sm">
        {t('features.adoption-description')}
      </p>
      <ChartContainer config={chartConfig} className="mt-4 h-80 w-full">
        <BarChart
          data={features}
          margin={{ top: 10, right: 10, left: 0, bottom: 60 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="feature_name"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis tickLine={false} axisLine={false} tickMargin={8} unit="%" />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar
            dataKey="adoption_percentage"
            fill="var(--color-adoption_percentage)"
            radius={[8, 8, 0, 0]}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
