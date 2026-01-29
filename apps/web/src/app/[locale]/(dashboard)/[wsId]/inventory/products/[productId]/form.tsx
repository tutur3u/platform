'use client';

import { Check, ChevronsUpDown, Plus, Trash } from '@tuturuuu/icons';
import type { ProductCategory } from '@tuturuuu/types/primitives/ProductCategory';
import type { ProductUnit } from '@tuturuuu/types/primitives/ProductUnit';
import type { ProductWarehouse } from '@tuturuuu/types/primitives/ProductWarehouse';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@tuturuuu/ui/command';
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useFieldArray, useForm } from '@tuturuuu/ui/hooks/use-form';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import * as z from 'zod';
import { ProductCategoryForm } from '../../categories/form';
import { ProductWarehouseForm } from '../../warehouses/form';

const InventorySchema = z.object({
  unit_id: z.string().min(1, 'Unit is required'),
  warehouse_id: z.string().min(1, 'Warehouse is required'),
  amount: z.coerce.number().min(0).nullable(),
  min_amount: z.coerce.number().min(0).nullable(),
  price: z.coerce.number().min(0),
});

const FormSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1).max(255),
    manufacturer: z.string().optional(),
    description: z.string().optional(),
    usage: z.string().optional(),
    category_id: z.string(),
    inventory: z.array(InventorySchema).optional(),
  })
  .superRefine((values, ctx) => {
    const inventory = values.inventory ?? [];
    const seen = new Set<string>();
    inventory.forEach((item, index) => {
      if (!item.unit_id || !item.warehouse_id) return;
      const key = `${item.warehouse_id}-${item.unit_id}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Warehouse and unit combination must be unique',
          path: ['inventory', index, 'unit_id'],
        });
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Warehouse and unit combination must be unique',
          path: ['inventory', index, 'warehouse_id'],
        });
      } else {
        seen.add(key);
      }
    });
  });

interface Props {
  wsId: string;
  data?: z.output<typeof FormSchema>;
  categories: ProductCategory[];
  warehouses: ProductWarehouse[];
  units: ProductUnit[];
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
  canCreateInventory?: boolean;
  canUpdateInventory?: boolean;
}

export function ProductForm({
  wsId,
  data,
  categories,
  warehouses,
  units,
  onFinish,
  canCreateInventory = false,
  canUpdateInventory = false,
}: Props) {
  const t = useTranslations();

  const [loading, setLoading] = useState(false);
  const [showCategoryDialog, setCategoryDialog] = useState(false);
  const [showWarehouseDialog, setWarehouseDialog] = useState(false);
  const [hasUnlimitedStock, setHasUnlimitedStock] = useState(
    (data?.inventory || []).some((item) => item.amount === null)
  );

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      ...data,
      manufacturer: data?.manufacturer ?? '',
      description: data?.description ?? '',
      usage: data?.usage ?? '',
      inventory:
        data?.inventory && data.inventory.length > 0
          ? data.inventory.map((item) => ({
              ...item,
              amount: item.amount ?? null,
            }))
          : [
              {
                unit_id: '',
                warehouse_id: '',
                min_amount: 0,
                amount: hasUnlimitedStock ? null : 0,
                price: 0,
              },
            ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    name: 'inventory',
    control: form.control,
  });

  function addStock() {
    append({
      unit_id: '',
      warehouse_id: '',
      min_amount: 0,
      amount: hasUnlimitedStock ? null : 0,
      price: 0,
    });
  }

  function removeStock(index: number) {
    remove(index);
  }

  function toggleUnlimitedStock(unlimited: boolean) {
    setHasUnlimitedStock(unlimited);
    const currentInventory = form.getValues('inventory') || [];

    if (unlimited) {
      // Set all inventory amounts to null when switching to unlimited
      const updatedInventory =
        currentInventory.length > 0
          ? currentInventory.map((item) => ({
              ...item,
              amount: null,
              min_amount: 0,
            }))
          : [
              {
                unit_id: '',
                warehouse_id: '',
                min_amount: 0,
                amount: null,
                price: 0,
              },
            ];
      form.setValue('inventory', updatedInventory, { shouldDirty: true });
    } else {
      // Set all inventory amounts to 0 when switching from unlimited
      const updatedInventory =
        currentInventory.length > 0
          ? currentInventory.map((item) => ({
              ...item,
              amount: item.amount === null ? 0 : item.amount,
            }))
          : [
              {
                unit_id: '',
                warehouse_id: '',
                min_amount: 0,
                amount: 0,
                price: 0,
              },
            ];
      form.setValue('inventory', updatedInventory, { shouldDirty: true });
    }
  }

  async function onSubmit(formData: z.infer<typeof FormSchema>) {
    setLoading(true);

    // Check permissions before proceeding
    if (!data?.id && !canCreateInventory) {
      toast.error(t('common.insufficient_permissions'));
      setLoading(false);
      return;
    }

    if (data?.id && !canUpdateInventory) {
      toast.error(t('common.insufficient_permissions'));
      setLoading(false);
      return;
    }

    try {
      // For new products, send all data
      let productPayload: any = {
        name: formData.name,
        manufacturer: formData.manufacturer,
        description: formData.description,
        usage: formData.usage,
        category_id: formData.category_id,
      };

      let inventoryPayload: any = formData.inventory || [];

      // For existing products, only send changed fields
      if (data?.id) {
        // Reset payloads to empty objects for existing products
        productPayload = {};
        let hasProductChanges = false;
        let hasInventoryChanges = false;

        // Compare product fields and only include if changed
        if (formData.name !== data.name) {
          productPayload.name = formData.name;
          hasProductChanges = true;
        }

        if (formData.manufacturer !== (data.manufacturer || '')) {
          productPayload.manufacturer = formData.manufacturer;
          hasProductChanges = true;
        }

        if (formData.description !== (data.description || '')) {
          productPayload.description = formData.description;
          hasProductChanges = true;
        }

        if (formData.usage !== (data.usage || '')) {
          productPayload.usage = formData.usage;
          hasProductChanges = true;
        }

        if (formData.category_id !== data.category_id) {
          productPayload.category_id = formData.category_id;
          hasProductChanges = true;
        }

        // Compare inventory arrays and only send changed items
        const originalInventory = data.inventory || [];
        const newInventory = formData.inventory || [];

        // Find inventory items that have actually changed
        const changedInventoryItems = newInventory.filter((newItem, index) => {
          const originalItem = originalInventory[index];
          if (!originalItem) return true; // New item

          // Compare each field individually
          return (
            newItem.unit_id !== originalItem.unit_id ||
            newItem.warehouse_id !== originalItem.warehouse_id ||
            newItem.amount !== (originalItem.amount ?? null) ||
            newItem.min_amount !== (originalItem.min_amount ?? null) ||
            newItem.price !== originalItem.price
          );
        });

        // Also check if any original items were removed
        const hasRemovedItems = originalInventory.length > newInventory.length;

        if (changedInventoryItems.length > 0 || hasRemovedItems) {
          inventoryPayload = newInventory; // Send the entire new inventory array
          hasInventoryChanges = true;
        }

        // If no fields have changed, don't make any API calls
        if (!hasProductChanges && !hasInventoryChanges) {
          setLoading(false);
          toast.info(t('ws-inventory-products.no_changes_detected'));
          return;
        }

        // Update product and inventory in one request if there are any changes
        if (hasProductChanges || hasInventoryChanges) {
          const updatePayload = {
            ...productPayload,
            ...(hasInventoryChanges && { inventory: inventoryPayload }),
          };

          const productRes = await fetch(
            `/api/v1/workspaces/${wsId}/products/${data.id}`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(updatePayload),
            }
          );

          if (!productRes.ok) {
            throw new Error('Failed to update product');
          }
        }
      } else {
        // For new products, create product and inventory in one request
        const createPayload = {
          ...productPayload,
          ...(inventoryPayload.length > 0 && { inventory: inventoryPayload }),
        };

        const productRes = await fetch(`/api/v1/workspaces/${wsId}/products`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(createPayload),
        });

        if (!productRes.ok) {
          throw new Error('Failed to create product');
        }
      }

      // Success - redirect to products list
      onFinish?.(formData);
      setLoading(false);
      toast.success(t('ws-inventory-products.product_saved_successfully'));

      // Clear form fields only for new products
      if (!data?.id) {
        form.reset({
          name: '',
          manufacturer: '',
          description: '',
          usage: '',
          category_id: '',
          inventory: [
            {
              unit_id: '',
              warehouse_id: '',
              min_amount: 0,
              amount: 0,
              price: 0,
            },
          ],
        });
        // Also reset the unlimited stock toggle for new products
        setHasUnlimitedStock(false);
      }
      // router.push('../products');
    } catch (error) {
      setLoading(false);
      console.error('Error saving product:', error);
      toast.error(t('ws-inventory-products.failed_save_product'));
    }
  }

  return (
    <>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4 lg:flex-row"
        >
          <div className="flex-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('ws-inventory-products.form.details')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t('ws-inventory-products.form.name')}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t('ws-inventory-products.form.name')}
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
                              'ws-inventory-products.form.manufacturer'
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
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t('ws-inventory-products.form.description')}
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder={t(
                              'ws-inventory-products.form.description'
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
                    name="usage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t('ws-inventory-products.form.usage')}
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder={t('ws-inventory-products.form.usage')}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row justify-between">
                <CardTitle>{t('ws-inventory-products.form.stock')}</CardTitle>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="unlimited-stock"
                    checked={hasUnlimitedStock}
                    onCheckedChange={toggleUnlimitedStock}
                  />
                  <label
                    htmlFor="unlimited-stock"
                    className="font-medium text-sm"
                  >
                    {t('ws-inventory-products.labels.unlimited_stock_label')}
                  </label>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  {fields.map((_, i) => (
                    <div key={i} className="grid gap-4">
                      <FormField
                        control={form.control}
                        name={`inventory.${i}.warehouse_id`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormLabel>
                              {t('ws-inventory-warehouses.singular')}
                            </FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    className="w-full justify-between"
                                  >
                                    {field.value
                                      ? warehouses.find(
                                          (warehouse) =>
                                            warehouse.id === field.value
                                        )?.name
                                      : t(
                                          'ws-inventory-warehouses.placeholder'
                                        )}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="p-0">
                                <Command>
                                  <CommandInput placeholder="Search warehouse..." />
                                  <CommandList>
                                    <CommandEmpty>
                                      Warehouse {field.value} not found.
                                    </CommandEmpty>
                                    <CommandGroup>
                                      <CommandItem
                                        onSelect={() =>
                                          setWarehouseDialog(true)
                                        }
                                      >
                                        <Plus className="mr-2 h-4 w-4" />
                                        Create new warehouse
                                      </CommandItem>
                                    </CommandGroup>
                                    <CommandSeparator />
                                    <CommandGroup>
                                      {warehouses.map((warehouse) => (
                                        <CommandItem
                                          value={warehouse.id}
                                          key={warehouse.id}
                                          onSelect={() => {
                                            form.setValue(
                                              `inventory.${i}.warehouse_id`,
                                              warehouse.id
                                            );
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              'mr-2 h-4 w-4',
                                              warehouse.id === field.value
                                                ? 'opacity-100'
                                                : 'opacity-0'
                                            )}
                                          />
                                          {warehouse.name}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`inventory.${i}.price`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormLabel>
                              {t('ws-inventory-products.form.price')}
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder={t(
                                  'ws-inventory-products.form.price'
                                )}
                                {...field}
                                value={String(field.value || '')}
                                onChange={(e) => field.onChange(e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-3 gap-4">
                        <FormField
                          control={form.control}
                          name={`inventory.${i}.min_amount`}
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormLabel>
                                {t('ws-inventory-products.form.min_amount')}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder={t(
                                    'ws-inventory-products.form.min_amount'
                                  )}
                                  {...field}
                                  value={String(field.value || '')}
                                  disabled={hasUnlimitedStock}
                                  aria-disabled={hasUnlimitedStock}
                                  onChange={(e) =>
                                    field.onChange(e.target.value)
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
                            <FormItem className="flex-1">
                              <FormLabel>
                                {t('ws-inventory-products.form.amount')}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder={
                                    hasUnlimitedStock
                                      ? t(
                                          'ws-inventory-products.labels.unlimited_stock'
                                        )
                                      : t('ws-inventory-products.form.amount')
                                  }
                                  {...field}
                                  value={String(field.value ?? '')}
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
                            <FormItem className="flex-1">
                              <FormLabel>
                                {t('ws-inventory-units.singular')}
                              </FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger
                                    id="status"
                                    aria-label={t(
                                      'ws-inventory-units.placeholder'
                                    )}
                                  >
                                    <SelectValue
                                      placeholder={t(
                                        'ws-inventory-units.placeholder'
                                      )}
                                    />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {units.map((unit) => (
                                    <SelectItem value={unit.id} key={unit.id}>
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
                            size="icon"
                            variant="destructive"
                            onClick={() => {
                              removeStock(i);
                            }}
                          >
                            <Trash />
                            <span className="sr-only">Remove stock option</span>
                          </Button>
                        </div>
                      )}

                      <Separator />
                    </div>
                  ))}

                  <Button
                    type="button"
                    className="w-full"
                    disabled={loading}
                    onClick={addStock}
                  >
                    Add stock
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="w-full shrink-0 space-y-4 lg:max-w-sm">
            <Card>
              <CardHeader>
                <CardTitle>
                  {t('ws-inventory-products.form.category')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  <FormField
                    control={form.control}
                    name="category_id"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel>
                          {t('ws-inventory-categories.singular')}
                        </FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                role="combobox"
                                className="w-full justify-between"
                              >
                                {field.value
                                  ? categories.find(
                                      (category) => category.id === field.value
                                    )?.name
                                  : t('ws-inventory-categories.placeholder')}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="p-0">
                            <Command>
                              <CommandInput placeholder="Search category..." />
                              <CommandList>
                                <CommandEmpty>
                                  Category {field.value} not found.
                                </CommandEmpty>
                                <CommandGroup>
                                  <CommandItem
                                    onSelect={() => setCategoryDialog(true)}
                                  >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Create new category
                                  </CommandItem>
                                </CommandGroup>
                                <CommandSeparator />
                                <CommandGroup>
                                  {categories.map((category) => (
                                    <CommandItem
                                      value={category.name}
                                      key={category.id}
                                      onSelect={() => {
                                        form.setValue(
                                          'category_id',
                                          category.id
                                        );
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          'mr-2 h-4 w-4',
                                          category.id === field.value
                                            ? 'opacity-100'
                                            : 'opacity-0'
                                        )}
                                      />
                                      {category.name}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !form.formState.isDirty}
            >
              {loading
                ? t('common.processing')
                : data?.id
                  ? t('common.edit')
                  : t('common.create')}
            </Button>
          </div>
        </form>
      </Form>

      <ModifiableDialogTrigger
        data={data}
        open={showCategoryDialog}
        title={t('ws-product-categories.create')}
        editDescription={t('ws-product-categories.create_description')}
        setOpen={setCategoryDialog}
        form={
          <ProductCategoryForm
            wsId={wsId}
            canCreateInventory={canCreateInventory}
            canUpdateInventory={canUpdateInventory}
          />
        }
      />

      <ModifiableDialogTrigger
        data={data}
        open={showWarehouseDialog}
        title={t('ws-product-warehouses.create')}
        editDescription={t('ws-product-warehouses.create_description')}
        setOpen={setWarehouseDialog}
        form={
          <ProductWarehouseForm
            wsId={wsId}
            canCreateInventory={canCreateInventory}
            canUpdateInventory={canUpdateInventory}
          />
        }
      />
    </>
  );
}
