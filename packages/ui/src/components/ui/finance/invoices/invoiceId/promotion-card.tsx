import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Percent, DollarSign } from '@tuturuuu/ui/icons';

interface PromotionCardProps {
  promotion: {
    name?: string | null;
    code: string;
    use_ratio: boolean;
    value: number;
  };
  locale: string;
}

export function PromotionCard({ promotion, locale }: PromotionCardProps) {
  const isPercentage = promotion.use_ratio;
  const displayName = promotion.name || promotion.code;
  const isHighValue = isPercentage
    ? promotion.value > 20
    : promotion.value > 100000;

  return (
    <Card className="bg-card border-border shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1">
            <div className="p-2 bg-accent/10 rounded-lg">
              {isPercentage ? (
                <Percent className="h-5 w-5 text-foreground" />
              ) : (
                <DollarSign className="h-5 w-5 text-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-card-foreground text-sm truncate">
                {displayName}
              </h4>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant={isPercentage ? 'default' : 'secondary'}
                  className="text-xs px-2 py-0.5"
                >
                  {isPercentage ? 'Percentage' : 'Fixed Amount'}
                </Badge>
                {isHighValue && (
                  <Badge variant="destructive" className="text-xs px-2 py-0.5">
                    High Value
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold text-lg text-foreground">
              {isPercentage
                ? `${promotion.value}%`
                : `-${Intl.NumberFormat(locale, {
                    style: 'currency',
                    currency: 'VND',
                  }).format(promotion.value)}`}
            </div>
            <div className="text-xs text-muted-foreground">
              {isPercentage ? 'Discount' : 'Off'}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
