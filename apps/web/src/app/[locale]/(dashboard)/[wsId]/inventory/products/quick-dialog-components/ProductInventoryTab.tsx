import { Loader2, Plus, Save, Trash } from '@tuturuuu/icons';
import type { ProductUnit } from '@tuturuuu/types/primitives/ProductUnit';
import type { ProductWarehouse } from '@tuturuuu/types/primitives/ProductWarehouse';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useFieldArray } from '@tuturuuu/ui/hooks/use-form';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import type { UseFormReturn } from 'react-hook-form';
import type { EditProductFormValues } from './schema';

interface Props {
  form: UseFormReturn<EditProductFormValues>;
  warehouses: ProductWarehouse[];
  units: ProductUnit[];
  isSaving: boolean;
  isLoading?: boolean;
  onSave: () => void;
  canUpdateInventory: boolean;
  hasUnlimitedStock: boolean;
  onToggleUnlimitedStock: (unlimited: boolean) => void;
}

export function ProductInventoryTab({
  form,
  warehouses,
  units,
  isSaving,
  isLoading,
  onSave,
  canUpdateInventory,
  hasUnlimitedStock,
  onToggleUnlimitedStock,
}: Props) {
  const t = useTranslations();
  const { fields, append, remove } = useFieldArray({
    name: 'inventory',
    control: form.control,
  });

  const addStock = () => {
    append({
      unit_id: '',
      warehouse_id: '',
      min_amount: 0,
      amount: hasUnlimitedStock ? null : 0,
      price: 0,
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">
          {t('ws-inventory-products.sections.current_stock')}
        </h3>
      </div>

      <Card className="border-primary/20">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {t('ws-inventory-products.sections.manage_inventory')}
            </CardTitle>
            <div className="flex items-center space-x-2">
              <Switch
                id="unlimited-stock"
                checked={hasUnlimitedStock}
                onCheckedChange={onToggleUnlimitedStock}
              />
              <label htmlFor="unlimited-stock" className="font-medium text-sm">
                {t('ws-inventory-products.labels.unlimited_stock_label')}
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!canUpdateInventory) return;
                onSave();
              }}
              className="space-y-4"
            >
              {fields.map((field, i) => (
                <div key={field.id} className="space-y-4 rounded-lg border p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name={`inventory.${i}.warehouse_id`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t('ws-inventory-products.labels.warehouse')}
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={t(
                                    'ws-inventory-products.placeholders.select_warehouse'
                                  )}
                                />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {warehouses.map((warehouse) => (
                                <SelectItem
                                  key={warehouse.id}
                                  value={warehouse.id}
                                >
                                  {warehouse.name}
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
                      name={`inventory.${i}.price`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t('ws-inventory-products.labels.price_per_unit')}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder={t(
                                'ws-inventory-products.placeholders.enter_price'
                              )}
                              value={field.value ?? ''}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value === ''
                                    ? 0
                                    : Number(e.target.value)
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name={`inventory.${i}.min_amount`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t('ws-inventory-products.labels.min_amount')}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder={t(
                                'ws-inventory-products.placeholders.enter_min_amount'
                              )}
                              value={field.value ?? ''}
                              disabled={hasUnlimitedStock}
                              aria-disabled={hasUnlimitedStock}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value === ''
                                    ? 0
                                    : Number(e.target.value)
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`inventory.${i}.amount`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t('ws-inventory-products.labels.current_amount')}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder={
                                hasUnlimitedStock
                                  ? t(
                                      'ws-inventory-products.labels.unlimited_stock'
                                    )
                                  : t(
                                      'ws-inventory-products.placeholders.enter_current_amount'
                                    )
                              }
                              value={field.value ?? ''}
                              disabled={hasUnlimitedStock}
                              aria-disabled={hasUnlimitedStock}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value === ''
                                    ? 0
                                    : Number(e.target.value)
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`inventory.${i}.unit_id`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t('ws-inventory-products.labels.unit')}
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={t(
                                    'ws-inventory-products.placeholders.select_unit'
                                  )}
                                />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {units.map((unit) => (
                                <SelectItem key={unit.id} value={unit.id}>
                                  {unit.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {fields.length > 1 && (
                    <div className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => remove(i)}
                      >
                        <Trash className="h-4 w-4" />
                        {t('ws-inventory-products.buttons.remove')}
                      </Button>
                    </div>
                  )}
                </div>
              ))}

              {canUpdateInventory && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addStock}
                    className="w-full"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t('ws-inventory-products.buttons.add_stock_entry')}
                  </Button>
                  <Button
                    type="button"
                    onClick={onSave}
                    disabled={isSaving}
                    className="w-full"
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        {t(
                          'ws-inventory-products.buttons.save_inventory_changes'
                        )}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
