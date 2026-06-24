import {
  AlertCircle,
  CheckCircle2,
  FileJson,
  Languages,
} from '@tuturuuu/icons';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import type { TranslationStats } from './types';

type TranslationSummaryProps = {
  labels: {
    complete: string;
    missingEn: string;
    missingVi: string;
    total: string;
  };
  stats: TranslationStats;
};

export function TranslationSummary({ labels, stats }: TranslationSummaryProps) {
  const cards = [
    {
      icon: Languages,
      label: labels.total,
      value: stats.total,
    },
    {
      icon: CheckCircle2,
      label: labels.complete,
      value: stats.complete,
    },
    {
      icon: AlertCircle,
      label: labels.missingVi,
      value: stats.missingVi,
    },
    {
      icon: FileJson,
      label: labels.missingEn,
      value: stats.missingEn,
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              {card.label}
            </CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">
              {card.value.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
