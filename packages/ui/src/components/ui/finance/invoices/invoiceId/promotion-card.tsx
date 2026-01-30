import { DollarSign, Percent } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent } from '@tuturuuu/ui/card';

interface PromotionCardProps {
  promotion: {
    name?: string | null;
    code: string;
    use_ratio: boolean;
    value: number;
  };
  locale: string;
  currency?: string;
}

export function PromotionCard({
  promotion,
  locale,
  currency = 'USD',
}: PromotionCardProps) {
  const isPercentage = promotion.use_ratio;
  const displayName = promotion.name || promotion.code;
  const isHighValue = isPercentage
    ? promotion.value > 20
    : promotion.value > 100000;

  return (
    <Card className="border-border bg-card shadow-sm transition-shadow duration-200 hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-1 items-center gap-3">
            <div className="rounded-lg bg-accent/10 p-2">
              {isPercentage ? (
                <Percent className="h-5 w-5 text-foreground" />
              ) : (
                <DollarSign className="h-5 w-5 text-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="truncate font-semibold text-card-foreground text-sm">
                {displayName}
              </h4>
              <div className="mt-1 flex items-center gap-2">
                <Badge
                  variant={isPercentage ? 'default' : 'secondary'}
                  className="px-2 py-0.5 text-xs"
                >
                  {isPercentage ? 'Percentage' : 'Fixed Amount'}
                </Badge>
                {isHighValue && (
                  <Badge variant="destructive" className="px-2 py-0.5 text-xs">
                    High Value
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold text-foreground text-lg">
              {isPercentage
                ? `${promotion.value}%`
                : `-${Intl.NumberFormat(locale, {
                    style: 'currency',
                    currency,
                  }).format(promotion.value)}`}
            </div>
            <div className="text-muted-foreground text-xs">
              {isPercentage ? 'Discount' : 'Off'}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
