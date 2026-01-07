'use client';

import {
  Edit,
  Eye,
  History,
  Loader2,
  Package,
  Plus,
  Save,
  ShoppingBag,
  Store,
  Trash,
} from '@tuturuuu/icons';
import type { Product } from '@tuturuuu/types/primitives/Product';
import type { ProductCategory } from '@tuturuuu/types/primitives/ProductCategory';
import type { ProductUnit } from '@tuturuuu/types/primitives/ProductUnit';
import type { ProductWarehouse } from '@tuturuuu/types/primitives/ProductWarehouse';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
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
import { Label } from '@tuturuuu/ui/label';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import * as z from 'zod';

const InventorySchema = z.object({
  unit_id: z.string(),
  warehouse_id: z.string(),
  amount: z.coerce.number(),
  min_amount: z.coerce.number(),
  price: z.coerce.number(),
});

const EditProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  manufacturer: z.string().optional(),
  description: z.string().optional(),
  usage: z.string().optional(),
  category_id: z.string().optional(),
  inventory: z.array(InventorySchema).optional(),
});

interface Props {
  product?: Product;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  wsId: string;
  categories: ProductCategory[];
  warehouses: ProductWarehouse[];
  units: ProductUnit[];
  canUpdateInventory: boolean;
  canDeleteInventory: boolean;
}

export function ProductQuickDialog({
  product,
  isOpen,
  onOpenChange,
  wsId,
  categories,
  warehouses,
  units,
  canUpdateInventory,
  canDeleteInventory,
}: Props) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [isSaving, setIsSaving] = useState(false);
  const computeUnlimitedStock = useCallback(
    (p?: Product) =>
      !p?.stock ||
      p.stock.length === 0 ||
      p.stock.some((s) => s.amount == null),
    []
  );
  const [hasUnlimitedStock, setHasUnlimitedStock] = useState(
    computeUnlimitedStock(product)
  );
  const router = useRouter();
  const t = useTranslations();

  const editForm = useForm({
    resolver: zodResolver(EditProductSchema),
    defaultValues: {
      name: product?.name || '',
      manufacturer: product?.manufacturer || '',
      description: product?.description || '',
      usage: product?.usage || '',
      category_id: product?.category_id || '',
      inventory: hasUnlimitedStock
        ? []
        : product?.inventory && product.inventory.length > 0
          ? product.inventory
          : [
              {
                unit_id: '',
                warehouse_id: '',
                min_amount: product?.min_amount || 0,
                amount: 0,
                price: 0,
              },
            ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    name: 'inventory',
    control: editForm.control,
  });

  useEffect(() => {
    if (product) {
      const isUnlimited = computeUnlimitedStock(product);
      setHasUnlimitedStock(isUnlimited);
      editForm.reset({
        name: product.name || '',
        manufacturer: product.manufacturer || '',
        description: product.description || '',
        usage: product.usage || '',
        category_id: product.category_id || '',
        inventory: isUnlimited
          ? []
          : product.inventory && product.inventory.length > 0
            ? product.inventory
            : [
                {
                  unit_id: '',
                  warehouse_id: '',
                  min_amount: product.min_amount || 0,
                  amount: 0,
                  price: 0,
                },
              ],
      });
    }
  }, [product, editForm, computeUnlimitedStock]);

  function addStock() {
    append({
      unit_id: '',
      warehouse_id: '',
      min_amount: 0,
      amount: 0,
      price: 0,
    });
  }

  function removeStock(index: number) {
    remove(index);
  }

  function toggleUnlimitedStock(unlimited: boolean) {
    setHasUnlimitedStock(unlimited);
    if (unlimited) {
      // Clear all inventory when switching to unlimited
      editForm.setValue('inventory', [], { shouldDirty: true });
    } else {
      // Add default inventory when switching from unlimited
      const currentValues = editForm.getValues();
      const newValues = {
        ...currentValues,
        inventory: [
          {
            unit_id: '',
            warehouse_id: '',
            min_amount: product?.min_amount || 0,
            amount: 0,
            price: 0,
          },
        ],
      };

      // Reset the form with the new values to properly clear dirty state
      editForm.reset(newValues);
    }
  }

  const handleEditSave = async (data: z.infer<typeof EditProductSchema>) => {
    if (!product?.id) return;

    if (!canUpdateInventory) {
      toast.error(t('ws-roles.inventory_products_access_denied_description'));
      return;
    }

    setIsSaving(true);

    try {
      // Reset payloads to empty objects for existing products
      const productPayload: any = {};
      let hasProductChanges = false;
      let hasInventoryChanges = false;

      // Compare product fields and only include if changed
      if (data.name !== (product.name || '')) {
        productPayload.name = data.name;
        hasProductChanges = true;
      }

      if (data.manufacturer !== (product.manufacturer || '')) {
        productPayload.manufacturer = data.manufacturer;
        hasProductChanges = true;
      }

      if (data.description !== (product.description || '')) {
        productPayload.description = data.description;
        hasProductChanges = true;
      }

      if (data.usage !== (product.usage || '')) {
        productPayload.usage = data.usage;
        hasProductChanges = true;
      }

      if (data.category_id !== (product.category_id || '')) {
        productPayload.category_id = data.category_id;
        hasProductChanges = true;
      }

      // Check for inventory changes by comparing with original inventory
      const originalInventory = (product as any).inventory || [];
      const newInventory = data.inventory || [];

      // Detect toggle between unlimited and tracked stock
      const originalIsUnlimited =
        originalInventory.length === 0 || computeUnlimitedStock(product);
      const newIsUnlimited = newInventory.length === 0;
      if (originalIsUnlimited !== newIsUnlimited) {
        hasInventoryChanges = true;
      }

      // Compare arrays item-by-item for field changes
      const changedInventoryItems = newInventory.filter((newItem, index) => {
        const originalItem = originalInventory[index];
        if (!originalItem) return true; // new item added
        return (
          newItem.unit_id !== originalItem.unit_id ||
          newItem.warehouse_id !== originalItem.warehouse_id ||
          Number(newItem.amount) !== Number(originalItem.amount) ||
          Number(newItem.min_amount) !== Number(originalItem.min_amount) ||
          Number(newItem.price) !== Number(originalItem.price)
        );
      });
      const hasRemovedItems = originalInventory.length > newInventory.length;
      if (changedInventoryItems.length > 0 || hasRemovedItems) {
        hasInventoryChanges = true;
      }

      // If no fields have changed, don't make any API calls
      if (!hasProductChanges && !hasInventoryChanges) {
        setIsSaving(false);
        toast.info(t('ws-inventory-products.messages.no_changes_to_save'));
        return;
      }

      // Update product details if there are changes
      if (hasProductChanges) {
        const productRes = await fetch(
          `/api/v1/workspaces/${wsId}/products/${product.id}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(productPayload),
          }
        );

        if (!productRes.ok) {
          throw new Error(
            t('ws-inventory-products.messages.failed_update_details')
          );
        }
      }

      // Update inventory if there are changes
      if (hasInventoryChanges) {
        const inventoryRes = await fetch(
          `/api/v1/workspaces/${wsId}/products/${product.id}/inventory`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ inventory: newInventory }),
          }
        );

        if (!inventoryRes.ok) {
          const errText = await inventoryRes.text();
          throw new Error(`Failed to update product inventory: ${errText}`);
        }
      }

      // Success
      setIsSaving(false);
      toast.success(
        t('ws-inventory-products.messages.product_updated_successfully')
      );
      router.refresh();
    } catch (error) {
      setIsSaving(false);
      console.error('Error updating product:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : t('ws-inventory-products.messages.failed_update_product')
      );
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleDelete = async () => {
    if (!product?.id) return;

    if (!canDeleteInventory) {
      toast.error(t('ws-inventory-products.messages.no_delete_permission'));
      setShowDeleteDialog(false);
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/products/${product.id}`,
        {
          method: 'DELETE',
        }
      );

      if (res.ok) {
        toast.success(
          t('ws-inventory-products.messages.product_deleted_successfully')
        );
        setShowDeleteDialog(false);
        onOpenChange(false);
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(
          data.message ||
            t('ws-inventory-products.messages.failed_delete_product')
        );
      }
    } catch {
      toast.error(t('ws-inventory-products.messages.failed_delete_product'));
    }
    setIsDeleting(false);
  };

  if (!product) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[80vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {product.name || t('ws-inventory-products.singular')}
            </DialogTitle>
            <DialogDescription>
              {t('ws-inventory-products.dialog.description')}
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList
              className={`grid w-full ${hasUnlimitedStock ? 'grid-cols-3' : 'grid-cols-4'}`}
            >
              <TabsTrigger value="details" className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                {t('ws-inventory-products.tabs.details')}
              </TabsTrigger>
              {!hasUnlimitedStock && (
                <TabsTrigger
                  value="inventory"
                  className="flex items-center gap-2"
                >
                  <Package className="h-4 w-4" />
                  {t('ws-inventory-products.tabs.stock')}
                </TabsTrigger>
              )}
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                {t('ws-inventory-products.tabs.history')}
              </TabsTrigger>
              {canUpdateInventory && (
                <TabsTrigger value="edit" className="flex items-center gap-2">
                  <Edit className="h-4 w-4" />
                  {t('ws-inventory-products.tabs.edit')}
                </TabsTrigger>
              )}
            </TabsList>

            {/* Product Details Tab */}
            <TabsContent value="details" className="space-y-4">
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
                          Stock
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
                          Usage
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
                          {new Date(product.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {!hasUnlimitedStock && (
              <TabsContent value="inventory" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">
                    {t('ws-inventory-products.sections.current_stock')}
                  </h3>
                </div>

                {/* Inventory Management (for tracked stock) */}
                <Card className="border-primary/20">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">
                        {t('ws-inventory-products.sections.manage_inventory')}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Form {...editForm}>
                      <div className="space-y-4">
                        {fields.map((_, i) => (
                          <div
                            key={i}
                            className="space-y-4 rounded-lg border p-4"
                          >
                            <div className="grid grid-cols-2 gap-4">
                              <FormField
                                control={editForm.control}
                                name={`inventory.${i}.warehouse_id`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>
                                      {t(
                                        'ws-inventory-products.labels.warehouse'
                                      )}
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
                                control={editForm.control}
                                name={`inventory.${i}.price`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>
                                      {t(
                                        'ws-inventory-products.labels.price_per_unit'
                                      )}
                                    </FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        placeholder={t(
                                          'ws-inventory-products.placeholders.enter_price'
                                        )}
                                        {...field}
                                        value={String(field.value || '')}
                                        onChange={(e) =>
                                          field.onChange(e.target.value)
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
                                control={editForm.control}
                                name={`inventory.${i}.min_amount`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>
                                      {t(
                                        'ws-inventory-products.labels.min_amount'
                                      )}
                                    </FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        placeholder="Min amount"
                                        {...field}
                                        value={String(field.value || '')}
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
                                control={editForm.control}
                                name={`inventory.${i}.amount`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>
                                      {t(
                                        'ws-inventory-products.labels.current_amount'
                                      )}
                                    </FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        placeholder="Current amount"
                                        {...field}
                                        value={String(field.value || '')}
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
                                control={editForm.control}
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
                                          <SelectItem
                                            key={unit.id}
                                            value={unit.id}
                                          >
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
                                  onClick={() => removeStock(i)}
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
                              {t(
                                'ws-inventory-products.buttons.add_stock_entry'
                              )}
                            </Button>
                            <Button
                              type="button"
                              onClick={editForm.handleSubmit(handleEditSave)}
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
                      </div>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* History Tab */}
            <TabsContent value="history" className="space-y-4">
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
                          {/* Creator and timestamp */}
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <Store className="h-4 w-4" />
                              <p className="font-medium text-sm text-white">
                                {change.creator.full_name ||
                                  change.creator.email}
                              </p>{' '}
                              <span
                                className={`inline-flex items-center rounded px-2 py-1 font-medium text-sm ${
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
                                ? new Date(
                                    change.created_at
                                  ).toLocaleDateString()
                                : t('ws-inventory-products.messages.recently')}
                            </p>
                          </div>

                          {/* Beneficiary section */}
                          {change.beneficiary && (
                            <div className="flex items-center gap-2 rounded bg-slate-800/50 p-2">
                              <div className="flex h-6 w-6 items-center justify-center rounded bg-dynamic-blue">
                                <ShoppingBag className="h-4 w-4" />
                              </div>
                              <span className="text-blue-400 text-sm">
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
            </TabsContent>

            <TabsContent value="edit" className="space-y-4">
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
                  <Form {...editForm}>
                    <form
                      onSubmit={editForm.handleSubmit(handleEditSave)}
                      className="space-y-4"
                    >
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <FormField
                          control={editForm.control}
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
                          control={editForm.control}
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
                          control={editForm.control}
                          name="category_id"
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>Category</FormLabel>
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
                                    <SelectItem
                                      key={category.id}
                                      value={category.id}
                                    >
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
                          control={editForm.control}
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
                          control={editForm.control}
                          name="usage"
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>
                                {t(
                                  'ws-inventory-products.labels.usage_instructions'
                                )}
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

                      {/* Stock Management Section */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-lg">
                            {t(
                              'ws-inventory-products.sections.stock_management'
                            )}
                          </h4>
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
                              {t(
                                'ws-inventory-products.labels.unlimited_stock_label'
                              )}
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
                            {t(
                              'ws-inventory-products.messages.manage_tracked_stock'
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-4">
                        {canDeleteInventory && (
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={handleDeleteClick}
                            className="flex items-center gap-2"
                          >
                            <Trash className="h-4 w-4" />
                            {t('ws-inventory-products.buttons.delete_product')}
                          </Button>
                        )}

                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                          >
                            {t('ws-inventory-products.buttons.cancel')}
                          </Button>
                          {canUpdateInventory && (
                            <Button
                              type="submit"
                              disabled={isSaving || !editForm.formState.isDirty}
                              className="flex items-center gap-2"
                            >
                              {isSaving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Save className="h-4 w-4" />
                                  {t(
                                    'ws-inventory-products.buttons.save_changes'
                                  )}
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
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('ws-inventory-products.buttons.delete_product')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('ws-inventory-products.messages.delete_confirmation', {
                name: product.name ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting
                ? t('ws-inventory-products.messages.deleting')
                : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
