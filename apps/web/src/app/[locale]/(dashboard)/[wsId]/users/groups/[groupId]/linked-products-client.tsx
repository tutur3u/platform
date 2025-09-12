'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@tuturuuu/ui/select';
import { Combobox, type ComboboxOptions } from '@tuturuuu/ui/custom/combobox';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Box, MoreHorizontal, Pencil, ShoppingCart, Trash2 } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';


interface LinkedProduct {
    id: string;
    name: string | null;
    description: string | null;
    warehouse_id?: string | null;
    unit_id?: string | null;
}

interface WorkspaceProduct {
    id: string;
    name: string | null;
    description: string | null;
    manufacturer: string | null;
    category_id: string;
    inventory_products: Array<{
        unit_id: string;
        warehouse_id: string;
        inventory_units: {
            name: string | null;
        } | null;
    }>;
}

interface WarehouseOption {
    id: string;
    name: string | null;
}

interface LinkedProductsClientProps {
    wsId: string;
    groupId: string;
    initialLinkedProducts: LinkedProduct[];
    initialCount: number;
}

export const useProducts = (wsId: string) => {
    return useQuery({
        queryKey: ['products', wsId],
        queryFn: async () => {
            const supabase = createClient();
            const { data, error } = await supabase
                .from('workspace_products')
                .select(`id, name, description, manufacturer,category_id, inventory_products!inventory_products_product_id_fkey(unit_id, warehouse_id, inventory_units!inventory_products_unit_id_fkey(name))`)
                .eq('ws_id', wsId)
                .order('name');

            if (error) {
                toast(error instanceof Error ? error.message : 'Failed to fetch available products');
                return;
            }
            return data as WorkspaceProduct[];
        }
    })
};

export const useWarehouses = (wsId: string) => {
    return useQuery({
        queryKey: ['warehouses', wsId],
        queryFn: async () => {
            const supabase = createClient();
            const { data, error } = await supabase
                .from('inventory_warehouses')
                .select('id, name')
                .eq('ws_id', wsId)
                .order('name');

            if (error) {
                toast(error instanceof Error ? error.message : 'Failed to fetch warehouses');
                return;
            }
            return data as WarehouseOption[];
        }
    })
}

export default function LinkedProductsClient({
    wsId,
    groupId,
    initialLinkedProducts,
    initialCount,
}: LinkedProductsClientProps) {
    const t = useTranslations();
    const [linkedProducts, setLinkedProducts] = useState(initialLinkedProducts);
    const [count, setCount] = useState(initialCount);
    const { data: workspaceProducts } = useProducts(wsId);
    const { data: warehouses } = useWarehouses(wsId);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<string>('');
    const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
    const [selectedUnit, setSelectedUnit] = useState<string>('');
    const [deletingProduct, setDeletingProduct] = useState<LinkedProduct | null>(null);
    const [editingProduct, setEditingProduct] = useState<LinkedProduct | null>(null);
    const [loading, setLoading] = useState(false);


    // Get available units for selected product
    const getAvailableUnits = (productId: string, warehouseId: string) => {
        const product = workspaceProducts?.find(p => p.id === productId);
        const list = product?.inventory_products || [];
        if (!warehouseId) return [] as WorkspaceProduct['inventory_products'];
        return list.filter((ip) => ip.warehouse_id === warehouseId);
    };

    const getWarehouseName = (warehouseId?: string | null) => {
        if (!warehouseId) return null;
        const wh = (warehouses ?? []).find((w) => w.id === warehouseId);
        return wh?.name ?? null;
    };

    const getUnitName = (productId?: string, warehouseId?: string | null, unitId?: string | null) => {
        if (!productId || !warehouseId || !unitId) return null;
        const unit = getAvailableUnits(productId, warehouseId).find((u) => u.unit_id === unitId);
        return unit?.inventory_units?.name ?? null;
    };

    // Add linked product
    const handleAddProduct = async () => {
        if (!selectedProduct || !selectedWarehouse || !selectedUnit) {
            toast('Please select product, warehouse, and unit');
            return;
        }

        setLoading(true);
        const supabase = createClient();

        const { error } = await supabase
            .from('user_group_linked_products')
            .insert({
                group_id: groupId,
                product_id: selectedProduct,
                warehouse_id: selectedWarehouse,
                unit_id: selectedUnit,
            });

        if (error) {
            toast(error instanceof Error ? error.message : 'Failed to add linked product');
            setLoading(false);
            return;
        }

        // Refresh the data
        await refreshLinkedProducts();
        setIsAddDialogOpen(false);
        setSelectedProduct('');
        setSelectedWarehouse('');
        setSelectedUnit('');
        setLoading(false);

        toast('Linked product added successfully');
    };

    // Delete linked product
    const handleDeleteProduct = async () => {
        if (!deletingProduct) return;

        setLoading(true);
        const supabase = createClient();

        const { error } = await supabase
            .from('user_group_linked_products')
            .delete()
            .eq('group_id', groupId)
            .eq('product_id', deletingProduct.id);

        if (error) {
            toast(error instanceof Error ? error.message : 'Failed to delete linked product');
            setLoading(false);
            return;
        }

        // Refresh the data
        await refreshLinkedProducts();
        setIsDeleteDialogOpen(false);
        setDeletingProduct(null);
        setLoading(false);

        toast('Linked product removed successfully');
    }


    // Refresh linked products data
    const refreshLinkedProducts = async () => {
        const supabase = createClient();
        const { data, error, count: newCount } = await supabase
            .from('user_group_linked_products')
            .select('warehouse_id, unit_id, ...workspace_products(id, name, description)', { count: 'exact' })
            .eq('group_id', groupId)
            .order('created_at', { ascending: false });

        if (error) {
            toast(error instanceof Error ? error.message : 'Failed to refresh linked products');
            return;
        }

        setLinkedProducts(data || []);
        setCount(newCount || 0);
    };

    // Edit linked product (update warehouse and unit)
    const openEditDialog = (product: LinkedProduct) => {
        setEditingProduct(product);
        setSelectedProduct(product.id);
        setSelectedWarehouse(product.warehouse_id || '');
        setSelectedUnit(product.unit_id || '');
        setIsEditDialogOpen(true);
    };

    const handleEditProduct = async () => {
        if (!editingProduct) return;
        if (!selectedWarehouse || !selectedUnit) {
            toast('Please select warehouse and unit');
            return;
        }

        setLoading(true);
        const supabase = createClient();

        const { error } = await supabase
            .from('user_group_linked_products')
            .update({
                warehouse_id: selectedWarehouse,
                unit_id: selectedUnit,
            })
            .eq('group_id', groupId)
            .eq('product_id', editingProduct.id);

        if (error) {
            toast(error instanceof Error ? error.message : 'Failed to update linked product');
            setLoading(false);
            return;
        }

        await refreshLinkedProducts();
        setIsEditDialogOpen(false);
        setEditingProduct(null);
        setSelectedProduct('');
        setSelectedWarehouse('');
        setSelectedUnit('');
        setLoading(false);
        toast('Linked product updated successfully');
    };

    // Get available products for selection (excluding already linked ones)
    const availableProducts = workspaceProducts?.filter(
        product => !linkedProducts.some(linked => linked.id === product.id)
    ) || [];

    return (
        <div className="flex flex-col rounded-lg border border-border bg-foreground/5 p-4">
            <div className="mb-4 flex items-center justify-between">
                <div className="font-semibold text-xl">
                    {t('user-data-table.linked_products')}
                    {!!count && ` (${count})`}
                </div>
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                            <ShoppingCart className="mr-2 h-4 w-4" />
                            Add Product
                        </Button>
                    </DialogTrigger>
                    <DialogContent onWheel={(e) => e.stopPropagation()}>
                        <DialogHeader>
                            <DialogTitle>Add Linked Product</DialogTitle>
                            <DialogDescription>
                                Select a product and unit to link to this group.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="product-select">
                                    Product
                                </Label>
                                <Combobox
                                    t={t}
                                    options={availableProducts.map(
                                        (product): ComboboxOptions => ({
                                            value: product.id,
                                            label: `${product.name || 'Unnamed Product'}${product.manufacturer ? ` - ${product.manufacturer}` : ''}${product.description ? ` (${product.description})` : ''}`,
                                        })
                                    )}
                                    selected={selectedProduct}
                                    onChange={(value) => setSelectedProduct(value as string)}
                                    placeholder="Search products..."
                                />
                            </div>
                            {selectedProduct && (
                                <div className="space-y-2">
                                    <Label htmlFor="warehouse-select">
                                        Warehouse
                                    </Label>
                                    <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a warehouse" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {((warehouses ?? []) as WarehouseOption[]).map((wh) => (
                                                <SelectItem key={wh.id} value={wh.id}>
                                                    {wh.name || 'Unnamed Warehouse'}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                            {selectedProduct && selectedWarehouse && (
                                <div className="space-y-2">
                                    <Label htmlFor="unit-select">
                                        Unit
                                    </Label>
                                    <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a unit" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {getAvailableUnits(selectedProduct, selectedWarehouse).map((inventory) => (
                                                <SelectItem key={inventory.unit_id} value={inventory.unit_id}>
                                                    {inventory.inventory_units?.name || 'Unnamed Unit'}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setIsAddDialogOpen(false)}
                                disabled={loading}
                            >
                                Cancel
                            </Button>
                            <Button onClick={handleAddProduct} disabled={loading || !selectedProduct || !selectedWarehouse || !selectedUnit}>
                                {loading ? 'Adding...' : 'Add Product'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {count > 0 ? (
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                    {linkedProducts.map((product) => {
                        const missingWarehouse = !product.warehouse_id;
                        const missingUnit = !product.unit_id;
                        const hasMissing = missingWarehouse || missingUnit;
                        const warehouseName = getWarehouseName(product.warehouse_id);
                        const unitName = getUnitName(product.id, product.warehouse_id, product.unit_id);
                        return (
                            <div
                                key={product.id}
                                className="flex items-center justify-between rounded-lg border bg-background p-2 md:p-4"
                            >
                                <div className="flex items-center">
                                    <Box className="mr-2 h-8 w-8" />
                                    <div>
                                        <div className="font-semibold text-lg">{product.name}</div>
                                        {product.description && (
                                            <div className="text-sm">{product.description}</div>
                                        )}
                                        {hasMissing && (
                                            <div className="mt-1 text-xs text-dynamic-red">
                                                {missingWarehouse && 'Missing warehouse'}{missingWarehouse && missingUnit ? ' • ' : ''}{missingUnit && 'Missing unit'}
                                            </div>
                                        )}
                                        {!hasMissing && (warehouseName || unitName) && (
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                {warehouseName && <span>Warehouse: {warehouseName}</span>}
                                                {warehouseName && unitName && <span> • </span>}
                                                {unitName && <span>Unit: {unitName}</span>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm">
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                            onClick={() => openEditDialog(product)}
                                        >
                                            <Pencil className="mr-2 h-4 w-4" />
                                            Edit
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => {
                                                setDeletingProduct(product);
                                                setIsDeleteDialogOpen(true);
                                            }}
                                            className="text-dynamic-red"
                                        >
                                            <Trash2 className="mr-2 h-4 w-4 text-dynamic-red" />
                                            Remove
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Box className="mb-4 h-12 w-12 text-muted-foreground" />
                    <div className="font-medium text-muted-foreground">No linked products</div>
                    <div className="text-sm text-muted-foreground">
                        Add products to link them to this group
                    </div>
                </div>
            )}

            {/* Delete Confirmation Dialog */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Remove Linked Product</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to remove "{deletingProduct?.name}" from this group?
                            This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsDeleteDialogOpen(false)}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteProduct}
                            disabled={loading}
                        >
                            {loading ? 'Removing...' : 'Remove'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Linked Product Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent onWheel={(e) => e.stopPropagation()}>
                    <DialogHeader>
                        <DialogTitle>Edit Linked Product</DialogTitle>
                        <DialogDescription>
                            Update the warehouse and unit for this linked product.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>
                                Product
                            </Label>
                            <div className="text-sm">
                                {editingProduct?.name}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-warehouse-select">
                                Warehouse
                            </Label>
                            <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a warehouse" />
                                </SelectTrigger>
                                <SelectContent>
                                    {((warehouses ?? []) as WarehouseOption[]).map((wh) => (
                                        <SelectItem key={wh.id} value={wh.id}>
                                            {wh.name || 'Unnamed Warehouse'}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {selectedWarehouse && editingProduct && (
                            <div className="space-y-2">
                                <Label htmlFor="edit-unit-select">
                                    Unit
                                </Label>
                                <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a unit" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {getAvailableUnits(editingProduct.id, selectedWarehouse).map((inventory) => (
                                            <SelectItem key={inventory.unit_id} value={inventory.unit_id}>
                                                {inventory.inventory_units?.name || 'Unnamed Unit'}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsEditDialogOpen(false)}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleEditProduct} disabled={loading || !selectedWarehouse || !selectedUnit}>
                            {loading ? 'Saving...' : 'Save'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
