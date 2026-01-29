import { Eye, Loader2, Save, Trash } from '@tuturuuu/icons';
import type { Product } from '@tuturuuu/types/primitives/Product';
import type { ProductCategory } from '@tuturuuu/types/primitives/ProductCategory';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { UseFormReturn } from 'react-hook-form';
import type { EditProductFormValues } from './schema';

interface Props {
  product: Product;
  form: UseFormReturn<EditProductFormValues>;
  categories: ProductCategory[];
  hasUnlimitedStock: boolean;
  onToggleUnlimitedStock: (unlimited: boolean) => void;
  onSave: (data: EditProductFormValues) => void;
  onDelete: () => void;
  isSaving: boolean;
  canUpdateInventory: boolean;
  canDeleteInventory: boolean;
  onCancel: () => void;
}

export function ProductEditTab({
  product,
  form,
  categories,
  hasUnlimitedStock,
  onToggleUnlimitedStock,
  onSave,
  onDelete,
  isSaving,
  canUpdateInventory,
  canDeleteInventory,
  onCancel,
}: Props) {
  const t = useTranslations();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">
          {t('ws-inventory-products.sections.edit_product')}
        </h3>
        <div className="flex gap-2">
          <Link href={`./products/${product.id}`}>
            <Button variant="outline" size="sm">
              <Eye className="mr-2 h-4 w-4" />
              {t('ws-inventory-products.buttons.view_full_details')}
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Form {...form}>
            <form
              onSubmit={(e) => {
                if (!canUpdateInventory) {
                  e.preventDefault();
                  return;
                }
                form.handleSubmit(onSave)(e);
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('ws-inventory-products.form.name')} *
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t(
                            'ws-inventory-products.placeholders.enter_product_name'
                          )}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="manufacturer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('ws-inventory-products.form.manufacturer')}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t(
                            'ws-inventory-products.placeholders.enter_manufacturer'
                          )}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="category_id"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>
                        {t('ws-inventory-products.form.category')}
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={t(
                                'ws-inventory-products.placeholders.select_category'
                              )}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>
                        {t('ws-inventory-products.form.description')}
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t(
                            'ws-inventory-products.placeholders.enter_product_description'
                          )}
                          className="min-h-20"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="usage"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>
                        {t('ws-inventory-products.labels.usage_instructions')}
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t(
                            'ws-inventory-products.placeholders.enter_usage_instructions'
                          )}
                          className="min-h-20"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-lg">
                    {t('ws-inventory-products.sections.stock_management')}
                  </h4>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="unlimited-stock"
                      checked={hasUnlimitedStock}
                      onCheckedChange={onToggleUnlimitedStock}
                    />
                    <label
                      htmlFor="unlimited-stock"
                      className="font-medium text-sm"
                    >
                      {t('ws-inventory-products.labels.unlimited_stock_label')}
                    </label>
                  </div>
                </div>

                {hasUnlimitedStock ? (
                  <div className="text-muted-foreground text-sm">
                    {t(
                      'ws-inventory-products.messages.unlimited_stock_available'
                    )}
                  </div>
                ) : (
                  <div className="text-muted-foreground text-sm">
                    {t('ws-inventory-products.messages.manage_tracked_stock')}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4">
                {canDeleteInventory && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={onDelete}
                    className="flex items-center gap-2"
                  >
                    <Trash className="h-4 w-4" />
                    {t('ws-inventory-products.buttons.delete_product')}
                  </Button>
                )}

                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={onCancel}>
                    {t('ws-inventory-products.buttons.cancel')}
                  </Button>
                  {canUpdateInventory && (
                    <Button
                      type="submit"
                      disabled={isSaving || !form.formState.isDirty}
                      className="flex items-center gap-2"
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          {t('ws-inventory-products.buttons.save_changes')}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
