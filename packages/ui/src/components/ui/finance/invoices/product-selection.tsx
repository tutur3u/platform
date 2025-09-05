'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Building, Minus, Package, Plus } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Combobox, type ComboboxOptions } from '@tuturuuu/ui/custom/combobox';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface ProductInventory {
  unit_id: string;
  warehouse_id: string;
  amount: number | null; // null means unlimited stock
  min_amount: number;
  price: number;
  unit_name: string | null;
  warehouse_name: string | null;
}

interface Product {
  id: string;
  name: string | null;
  manufacturer: string | null;
  description: string | null;
  usage: string | null;
  category: string | null;
  category_id: string;
  ws_id: string;
  created_at: string | null;
  inventory: ProductInventory[];
}

export interface SelectedProductItem {
  product: Product;
  inventory: ProductInventory;
  quantity: number;
}

interface Props {
  products: Product[];
  selectedProducts: SelectedProductItem[];
  onSelectedProductsChange: (products: SelectedProductItem[]) => void;
}

export function ProductSelection({
  products,
  selectedProducts,
  onSelectedProductsChange,
}: Props) {
  const t = useTranslations();
  const [selectedProductId, setSelectedProductId] = useState<string>('');

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const availableInventory =
    selectedProduct?.inventory.filter((inv) => inv.amount !== 0) || [];

  const addProductToInvoice = (
    inventory: ProductInventory,
    quantity: number
  ) => {
    if (!selectedProduct || quantity <= 0) return;

    // Check if quantity exceeds available stock (only if stock is limited)
    if (inventory.amount !== null && quantity > inventory.amount) return;

    const existingIndex = selectedProducts.findIndex(
      (item) =>
        item.product.id === selectedProduct.id &&
        item.inventory.warehouse_id === inventory.warehouse_id &&
        item.inventory.unit_id === inventory.unit_id
    );

    if (existingIndex >= 0) {
      // Update existing item
      const updated = [...selectedProducts];
      const existingItem = updated[existingIndex];
      if (existingItem) {
        existingItem.quantity =
          inventory.amount === null
            ? existingItem.quantity + quantity
            : Math.min(existingItem.quantity + quantity, inventory.amount);
        onSelectedProductsChange(updated);
      }
    } else {
      // Add new item
      onSelectedProductsChange([
        ...selectedProducts,
        {
          product: selectedProduct,
          inventory,
          quantity,
        },
      ]);
    }
  };

  const removeProductFromInvoice = (index: number) => {
    onSelectedProductsChange(selectedProducts.filter((_, i) => i !== index));
  };

  const updateQuantity = (index: number, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeProductFromInvoice(index);
      return;
    }

    const updated = [...selectedProducts];
    const item = updated[index];
    if (item) {
      item.quantity =
        item.inventory.amount === null
          ? newQuantity
          : Math.min(newQuantity, item.inventory.amount);
      onSelectedProductsChange(updated);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t('invoices.products')}</CardTitle>
          <CardDescription>
            Select products and specify quantities for the invoice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Product Selection */}
          <div className="space-y-2">
            <Label htmlFor="product-select">Select Product</Label>
            <Combobox
              t={t}
              options={products.map(
                (product): ComboboxOptions => ({
                  value: product.id,
                  label: `${product.name || 'No name'}${product.category ? ` (${product.category})` : ''}${product.manufacturer ? ` - ${product.manufacturer}` : ''}`,
                })
              )}
              selected={selectedProductId}
              onChange={(value) => setSelectedProductId(value as string)}
              placeholder="Search products..."
            />
          </div>

          {/* Stock Selection */}
          {selectedProduct && availableInventory.length > 0 && (
            <div className="space-y-3">
              <Label>Available Stock</Label>
              <div className="grid gap-3">
                {availableInventory.map((inventory, index) => (
                  <StockItem
                    key={`${inventory.warehouse_id}-${inventory.unit_id}`}
                    inventory={inventory}
                    onAdd={(quantity) =>
                      addProductToInvoice(inventory, quantity)
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {selectedProduct && availableInventory.length === 0 && (
            <div className="py-4 text-center text-muted-foreground">
              <Package className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p>No stock available for this product</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Products */}
      {selectedProducts.length > 0 && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Invoice Items</CardTitle>
            <CardDescription>
              Review and adjust quantities for selected products.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {selectedProducts.map((item, index) => (
                <div
                  key={`${item.product.id}-${item.inventory.warehouse_id}-${item.inventory.unit_id}-${index}`}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex-1">
                    <p className="font-medium">{item.product.name}</p>
                    <p className="text-muted-foreground text-sm">
                      {item.inventory.warehouse_name} •{' '}
                      {item.inventory.unit_name}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      Available:{' '}
                      {item.inventory.amount === null
                        ? 'Unlimited'
                        : item.inventory.amount}{' '}
                      • Price:{' '}
                      {Intl.NumberFormat('vi-VN', {
                        style: 'currency',
                        currency: 'VND',
                      }).format(item.inventory.price)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateQuantity(index, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) =>
                        updateQuantity(index, parseInt(e.target.value) || 0)
                      }
                      className="w-20 text-center"
                      min="1"
                      {...(item.inventory.amount !== null && {
                        max: item.inventory.amount,
                      })}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateQuantity(index, item.quantity + 1)}
                      disabled={
                        item.inventory.amount !== null &&
                        item.quantity >= item.inventory.amount
                      }
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => removeProductFromInvoice(index)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
              <div className="border-t pt-3">
                <div className="flex items-center justify-between font-semibold">
                  <span>Subtotal:</span>
                  <span>
                    {Intl.NumberFormat('vi-VN', {
                      style: 'currency',
                      currency: 'VND',
                    }).format(
                      selectedProducts.reduce(
                        (total, item) =>
                          total + item.inventory.price * item.quantity,
                        0
                      )
                    )}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface StockItemProps {
  inventory: ProductInventory;
  onAdd: (quantity: number) => void;
}

function StockItem({ inventory, onAdd }: StockItemProps) {
  const [quantity, setQuantity] = useState(1);

  const handleAdd = () => {
    if (
      quantity > 0 &&
      (inventory.amount === null || quantity <= inventory.amount)
    ) {
      onAdd(quantity);
      setQuantity(1); // Reset quantity after adding
    }
  };

  return (
    <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-3">
      <div className="flex items-center gap-3">
        <Building className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="font-medium">{inventory.warehouse_name}</p>
          <p className="text-muted-foreground text-sm">
            Available:{' '}
            {inventory.amount === null ? 'Unlimited' : inventory.amount}{' '}
            {inventory.unit_name} •{' '}
            {Intl.NumberFormat('vi-VN', {
              style: 'currency',
              currency: 'VND',
            }).format(inventory.price)}{' '}
            each
          </p>
          {inventory.amount !== null &&
            inventory.amount <= inventory.min_amount && (
              <Badge variant="destructive" className="text-xs">
                Low Stock
              </Badge>
            )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
          className="w-20 text-center"
          min="1"
          {...(inventory.amount !== null && { max: inventory.amount })}
        />
        <Button
          onClick={handleAdd}
          disabled={
            (inventory.amount !== null && quantity > inventory.amount) ||
            quantity <= 0
          }
        >
          Add
        </Button>
      </div>
    </div>
  );
}
