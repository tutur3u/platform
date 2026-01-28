import { Loader2, ShoppingBag, Store } from '@tuturuuu/icons';
import type { Product } from '@tuturuuu/types/primitives/Product';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';

interface Props {
  product: Product;
  isLoading?: boolean;
}

export function ProductHistoryTab({ product, isLoading }: Props) {
  const t = useTranslations();

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">
        {t('ws-inventory-products.sections.stock_history')}
      </h3>

      {product.stock_changes && product.stock_changes.length > 0 ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {product.stock_changes.map((change, index) => (
              <Card
                key={`${product.id}-change-${index}-${change.amount}-${change.creator.email}`}
              >
                <CardContent className="flex flex-col gap-2 p-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Store className="h-4 w-4 shrink-0" />
                      <p className="wrap-break-word min-w-0 flex-1 text-balance font-medium text-sm text-white">
                        {change.creator.full_name || change.creator.email}
                      </p>{' '}
                      <span
                        className={`inline-flex shrink-0 items-center rounded px-2 py-1 font-medium text-sm ${
                          change.amount > 0
                            ? 'border border-green-800 bg-green-900/50 text-green-400'
                            : 'border border-red-800 bg-red-900/50 text-red-400'
                        }`}
                      >
                        {change.amount > 0 ? '+' : ''}
                        {change.amount}
                      </span>
                    </div>
                    <p className="text-slate-400 text-xs">
                      {change.created_at
                        ? new Date(change.created_at).toLocaleDateString()
                        : t('ws-inventory-products.messages.recently')}
                    </p>
                  </div>

                  {change.beneficiary && (
                    <div className="flex items-center gap-2 rounded bg-slate-800/50 p-2">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-dynamic-blue">
                        <ShoppingBag className="h-4 w-4" />
                      </div>
                      <span className="wrap-break-word min-w-0 flex-1 text-balance text-blue-400 text-sm">
                        {change.beneficiary.full_name ||
                          change.beneficiary.email}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
