import type { Product } from '@tuturuuu/types/primitives/Product';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Label } from '@tuturuuu/ui/label';
import { useFormatter, useTranslations } from 'next-intl';

interface Props {
  product: Product;
  hasUnlimitedStock: boolean;
}

export function ProductDetailsTab({ product, hasUnlimitedStock }: Props) {
  const t = useTranslations();
  const { dateTime } = useFormatter();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('ws-inventory-products.sections.product_information')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label className="font-medium text-muted-foreground text-sm">
              {t('ws-inventory-products.form.name')}
            </Label>
            <p className="mt-1 text-sm">{product.name || '-'}</p>
          </div>
          {product.manufacturer && (
            <div>
              <Label className="font-medium text-muted-foreground text-sm">
                {t('ws-inventory-products.form.manufacturer')}
              </Label>
              <p className="mt-1 text-sm">{product.manufacturer}</p>
            </div>
          )}
          {product.category && (
            <div>
              <Label className="font-medium text-muted-foreground text-sm">
                {t('ws-inventory-products.form.category')}
              </Label>
              <p className="mt-1 text-sm">{product.category}</p>
            </div>
          )}
          {hasUnlimitedStock && (
            <div>
              <Label className="font-medium text-muted-foreground text-sm">
                {t('ws-inventory-products.form.stock')}
              </Label>
              <p className="mt-1 text-sm">
                {t('ws-inventory-products.labels.unlimited_stock')}
              </p>
            </div>
          )}
          {product.description && (
            <div className="md:col-span-2">
              <Label className="font-medium text-muted-foreground text-sm">
                {t('ws-inventory-products.form.description')}
              </Label>
              <p className="mt-1 text-sm">{product.description}</p>
            </div>
          )}
          {product.usage && (
            <div className="md:col-span-2">
              <Label className="font-medium text-muted-foreground text-sm">
                {t('ws-inventory-products.form.usage')}
              </Label>
              <p className="mt-1 text-sm">{product.usage}</p>
            </div>
          )}
          {product.created_at && (
            <div>
              <Label className="font-medium text-muted-foreground text-sm">
                {t('ws-inventory-products.labels.created_at')}
              </Label>
              <p className="mt-1 text-sm">
                {dateTime(new Date(product.created_at), {
                  dateStyle: 'medium',
                })}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
