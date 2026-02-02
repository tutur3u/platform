import { Box, Edit } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent } from '@tuturuuu/ui/card';
import Link from 'next/link';

interface ProductCardProps {
  product: {
    product_name: string;
    amount: number;
    product_unit: string;
    price: number;
    product_id?: string | null;
  };
  locale: string;
  workspaceId?: string;
  currency?: string;
}

export function ProductCard({
  product,
  locale,
  workspaceId,
  currency = 'USD',
}: ProductCardProps) {
  const totalPrice = product.amount * product.price;
  const isHighQuantity = product.amount > 10;

  const cardContent = (
    <Card className="group cursor-pointer border-border bg-card shadow-sm transition-all duration-300 ease-in-out hover:scale-[1.02] hover:shadow-lg">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-1 items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 transition-colors duration-200 group-hover:bg-primary/20">
              <Box className="h-5 w-5 text-primary transition-transform duration-200 group-hover:scale-110" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="truncate font-semibold text-card-foreground text-sm transition-colors duration-200 group-hover:text-primary">
                {product.product_name}
              </h4>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-muted-foreground text-xs">
                  {product.amount} {product.product_unit}
                </span>
                {isHighQuantity && (
                  <Badge
                    variant="secondary"
                    className="px-2 py-0.5 text-xs transition-colors duration-200 group-hover:bg-primary/20"
                  >
                    Bulk
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-semibold text-card-foreground text-sm transition-colors duration-200 group-hover:text-primary">
              {Intl.NumberFormat(locale, {
                style: 'currency',
                currency,
              }).format(totalPrice)}
            </div>
            <div className="text-muted-foreground text-xs">
              {Intl.NumberFormat(locale, {
                style: 'currency',
                currency,
              }).format(product.price)}{' '}
              each
            </div>
          </div>
          {product.product_id && workspaceId && (
            <div className="ml-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <div className="rounded-md bg-primary/10 p-1.5 transition-colors duration-200 group-hover:bg-primary/20">
                <Edit className="h-4 w-4 text-primary" />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  // If product has an ID and workspaceId, wrap in Link
  if (product.product_id && workspaceId) {
    return (
      <Link href={`/${workspaceId}/inventory/products/${product.product_id}`}>
        {cardContent}
      </Link>
    );
  }

  // Otherwise, return the card without link
  return cardContent;
}
