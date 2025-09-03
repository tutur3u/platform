'use client';

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
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import {
  Edit,
  Eye,
  History,
  Loader2,
  Package,
  Save,
  ShoppingBag,
  Store,
  Trash,
  Warehouse,
} from '@tuturuuu/ui/icons';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import * as z from 'zod';

const AddStockSchema = z.object({
  warehouse_id: z.string().min(1, 'Please select a warehouse'),
  unit_id: z.string().min(1, 'Please select a unit'),
  amount: z.number().min(1, 'Amount must be greater than 0'),
  price: z.number().min(0, 'Price must be 0 or greater'),
  note: z.string().optional(),
});

const EditProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  manufacturer: z.string().optional(),
  description: z.string().optional(),
  usage: z.string().optional(),
  category_id: z.string().optional(),
});

interface Props {
  product?: Product;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  wsId: string;
  categories: ProductCategory[];
  warehouses: ProductWarehouse[];
  units: ProductUnit[];
}

export function ProductQuickDialog({
  product,
  isOpen,
  onOpenChange,
  wsId,
  categories,
  warehouses,
  units,
}: Props) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();
  const t = useTranslations();
  console.log(product);

  const editForm = useForm({
    resolver: zodResolver(EditProductSchema),
    defaultValues: {
      name: product?.name || '',
      manufacturer: product?.manufacturer || '',
      description: product?.description || '',
      usage: product?.usage || '',
      category_id: product?.category_id || '',
    },
  });

  useEffect(() => {
    if (product) {
      editForm.reset({
        name: product.name || '',
        manufacturer: product.manufacturer || '',
        description: product.description || '',
        usage: product.usage || '',
        category_id: product.category_id || '',
      });
    }
  }, [product, editForm]);

  const addStockForm = useForm({
    resolver: zodResolver(AddStockSchema),
    defaultValues: {
      warehouse_id: '',
      unit_id: '',
      amount: 0,
      price: 0,
      note: '',
    },
  });

  const handleEditSave = async (data: z.infer<typeof EditProductSchema>) => {
    if (!product?.id) return;

    // Only send fields that have changed
    const changedData: Partial<z.infer<typeof EditProductSchema>> = {};

    if (data.name !== (product.name || '')) {
      changedData.name = data.name;
    }
    if (data.manufacturer !== (product.manufacturer || '')) {
      changedData.manufacturer = data.manufacturer;
    }
    if (data.description !== (product.description || '')) {
      changedData.description = data.description;
    }
    if (data.usage !== (product.usage || '')) {
      changedData.usage = data.usage;
    }
    if (data.category_id !== (product.category_id || '')) {
      changedData.category_id = data.category_id;
    }

    // If no fields have changed, don't make the API call
    if (Object.keys(changedData).length === 0) {
      toast({
        title: t('common.error'),
        description: 'No changes to save',
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/products/${product.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(changedData),
        }
      );

      if (response.ok) {
        toast({
          title: t('common.success'),
          description: 'Product updated successfully',
        });
        setIsSaving(false);
        router.refresh();
      } else {
        const errorData = await response.json();
        toast({
          title: t('common.error'),
          description: errorData.message || 'Failed to update product',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: t('common.error'),
        description: 'Failed to update product',
        variant: 'destructive',
      });
    }
    setIsSaving(false);
  };

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };


  const handleAddStock = async (data: z.infer<typeof AddStockSchema>) => {
    if (!product?.id) return;

    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/products/${product.id}/inventory`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        }
      );

      if (response.ok) {
        toast({
          title: t('common.success'),
          description: 'Stock added successfully',
        });
        addStockForm.reset();
      } else {
        const errorData = await response.json();
        toast({
          title: t('common.error'),
          description: errorData.message || 'Failed to add stock',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: t('common.error'),
        description: 'Failed to add stock',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!product?.id) return;

    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/products/${product.id}`,
        {
          method: 'DELETE',
        }
      );

      if (res.ok) {
        toast({
          title: t('common.success'),
          description: 'Product deleted successfully',
        });
        setShowDeleteDialog(false);
        onOpenChange(false);
        router.refresh();
      } else {
        const data = await res.json();
        toast({
          title: t('common.error'),
          description: data.message || 'Failed to delete product',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: t('common.error'),
        description: 'Failed to delete product',
        variant: 'destructive',
      });
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
              Product information and management
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList
              className={`grid w-full ${product.stock != null ? 'grid-cols-4' : 'grid-cols-3'}`}
            >
              <TabsTrigger value="details" className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Details
              </TabsTrigger>
              {product.stock != null && (
                <TabsTrigger
                  value="inventory"
                  className="flex items-center gap-2"
                >
                  <Package className="h-4 w-4" />
                  Stock
                </TabsTrigger>
              )}
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                History
              </TabsTrigger>
              <TabsTrigger value="edit" className="flex items-center gap-2">
                <Edit className="h-4 w-4" />
                Edit
              </TabsTrigger>
            </TabsList>

            {/* Product Details Tab */}
            <TabsContent value="details" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Product Information</CardTitle>
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
                    {product.stock != null ? (
                      <div>
                        <Label className="font-medium text-muted-foreground text-sm">
                          Current Stock
                        </Label>
                        <p className="mt-1 text-sm">
                          {product.stock} {product.unit ?? 'units'}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <Label className="font-medium text-muted-foreground text-sm">
                          Current Stock
                        </Label>
                        <p className="mt-1 text-sm">Unlimited stock</p>
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
                          Created At
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

            {product.stock != null && (
              <TabsContent value="inventory" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">Current Stock</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    {product.stock} {product.unit ?? 'units'}
                  </div>
                  {product.min_amount != null && (
                    <div className="flex items-center gap-2">
                      <Store className="h-4 w-4" />
                      Min amount: {product.min_amount} {product.unit ?? 'units'}
                    </div>
                  )}
                  {product.warehouse && (
                    <div className="flex items-center gap-2">
                      <Warehouse className="h-4 w-4" />
                      {product.warehouse}
                    </div>
                  )}
                </div>
                <Card className="border-primary/20">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">Add Stock</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Form {...addStockForm}>
                      <form
                        onSubmit={addStockForm.handleSubmit(handleAddStock)}
                        className="space-y-4"
                      >
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <FormField
                            control={addStockForm.control}
                            name="warehouse_id"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Warehouse</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select warehouse" />
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
                            control={addStockForm.control}
                            name="unit_id"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Unit</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select unit" />
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
                          <FormField
                            control={addStockForm.control}
                            name="amount"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Amount</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    placeholder="Enter amount"
                                    {...field}
                                    onChange={(e) =>
                                      field.onChange(Number(e.target.value))
                                    }
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={addStockForm.control}
                            name="price"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Price per unit</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="Enter price"
                                    {...field}
                                    onChange={(e) =>
                                      field.onChange(Number(e.target.value))
                                    }
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <FormField
                          control={addStockForm.control}
                          name="note"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Note (optional)</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Add a note for this stock entry"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="flex gap-2">
                          <Button type="submit">Add Stock</Button>
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* History Tab */}
            <TabsContent value="history" className="space-y-4">
              <h3 className="font-semibold text-lg">Stock History</h3>

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
                                className={`inline-flex items-center rounded px-2 py-1 font-medium text-sm ${change.amount > 0
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
                                : 'Recently'}
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
                <h3 className="font-semibold text-lg">Edit Product</h3>
                <div className="flex gap-2">
                  <Link href={`./products/${product.id}`}>
                    <Button variant="outline" size="sm">
                      <Eye className="mr-2 h-4 w-4" />
                      View Full Details
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
                              <FormLabel>Product Name *</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Enter product name"
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
                              <FormLabel>Manufacturer</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Enter manufacturer"
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
                                    <SelectValue placeholder="Select category" />
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
                              <FormLabel>Description</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Enter product description"
                                  className="min-h-[80px]"
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
                              <FormLabel>Usage Instructions</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Enter usage instructions"
                                  className="min-h-[80px]"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="flex items-center justify-between pt-4">
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={handleDeleteClick}
                          className="flex items-center gap-2"
                        >
                          <Trash className="h-4 w-4" />
                          Delete Product
                        </Button>

                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            disabled={isSaving}
                            className="flex items-center gap-2"
                          >
                            {isSaving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Save className="h-4 w-4" />
                                Save Changes
                              </>
                            )}
                          </Button>
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
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{product.name}"? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

