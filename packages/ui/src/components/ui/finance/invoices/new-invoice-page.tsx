'use client';

import type { Invoice } from '@tuturuuu/types/primitives/Invoice';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import {
  CreditCard,
  FileText,
  ArrowUp,
  ArrowDown,
  Calculator,
  Loader2,
} from '@tuturuuu/ui/icons';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Combobox, type ComboboxOptions } from '@tuturuuu/ui/custom/combobox';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { ProductSelection } from './product-selection';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { Info } from '@tuturuuu/ui/icons';
import { useRouter } from 'next/navigation';

interface ProductInventory {
  unit_id: string;
  warehouse_id: string;
  amount: number | null;
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

interface SelectedProductItem {
  product: Product;
  inventory: ProductInventory;
  quantity: number;
}

interface Promotion {
  id: string;
  name: string | null;
  code: string | null;
  value: number;
  use_ratio: boolean;
  ws_id: string;
  created_at: string;
  creator_id: string | null;
  description: string | null;
}

interface Props {
  wsId: string;
}

// React Query hooks for data fetching
const useUsers = (wsId: string) => {
  return useQuery({
    queryKey: ['users', wsId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('workspace_users')
        .select('*')
        .eq('ws_id', wsId)
        .order('full_name', { ascending: true });

      if (error) throw error;
      return data as WorkspaceUser[];
    },
  });
};

const useProducts = (wsId: string) => {
  return useQuery({
    queryKey: ['products', wsId],
    queryFn: async () => {
      const supabase = createClient();
      const { data: rawData, error } = await supabase
        .from('workspace_products')
        .select(
          '*, product_categories(name), inventory_products!inventory_products_product_id_fkey(amount, min_amount, price, unit_id, warehouse_id, inventory_warehouses!inventory_products_warehouse_id_fkey(name), inventory_units!inventory_products_unit_id_fkey(name))'
        )
        .eq('ws_id', wsId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const data = rawData.map((item) => ({
        id: item.id,
        name: item.name,
        manufacturer: item.manufacturer,
        description: item.description,
        usage: item.usage,
        category: item.product_categories?.name,
        category_id: item.category_id,
        ws_id: item.ws_id,
        created_at: item.created_at,
        inventory: (item.inventory_products || []).map((inventory) => ({
          unit_id: inventory.unit_id,
          warehouse_id: inventory.warehouse_id,
          amount: inventory.amount,
          min_amount: inventory.min_amount || 0,
          price: inventory.price || 0,
          unit_name: inventory.inventory_units?.name || null,
          warehouse_name: inventory.inventory_warehouses?.name || null,
        })),
      }));

      return data as Product[];
    },
  });
};

const usePromotions = (wsId: string) => {
  return useQuery({
    queryKey: ['promotions', wsId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('workspace_promotions')
        .select('*')
        .eq('ws_id', wsId)
        .order('code', { ascending: true });

      if (error) throw error;
      return data as Promotion[];
    },
  });
};

const useWallets = (wsId: string) => {
  return useQuery({
    queryKey: ['wallets', wsId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('workspace_wallets')
        .select('*')
        .eq('ws_id', wsId)
        .order('name', { ascending: true });

      if (error) throw error;
      return data as Wallet[];
    },
  });
};

const useCategories = (wsId: string) => {
  return useQuery({
    queryKey: ['categories', wsId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('transaction_categories')
        .select('*')
        .eq('ws_id', wsId)
        .order('name', { ascending: true });

      if (error) throw error;
      return data as TransactionCategory[];
    },
  });
};

const useUserTransactions = (wsId: string, userId: string) => {
  return useQuery({
    queryKey: ['user-transactions', wsId, userId],
    queryFn: async () => {
      const supabase = createClient();
      const { data: rawData, error } = await supabase
        .from('wallet_transactions')
        .select(
          `*, workspace_wallets!inner(name, ws_id), transaction_categories(name)`
        )
        .eq('workspace_wallets.ws_id', wsId)
        .eq('creator_id', userId)
        .order('taken_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      const data =
        rawData?.map(
          ({ workspace_wallets, transaction_categories, ...rest }) => ({
            ...rest,
            wallet: workspace_wallets?.name,
            category: transaction_categories?.name,
          })
        ) || [];

      return data as Transaction[];
    },
    enabled: !!userId,
  });
};

const useUserInvoices = (wsId: string, userId: string) => {
  return useQuery({
    queryKey: ['user-invoices', wsId, userId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('finance_invoices')
        .select('*')
        .eq('ws_id', wsId)
        .eq('customer_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Invoice[];
    },
    enabled: !!userId,
  });
};

export default function NewInvoicePage({ wsId }: Props) {
  const t = useTranslations();
  const router = useRouter();
  // Data queries
  const { data: users = [], isLoading: usersLoading } = useUsers(wsId);
  const { data: products = [], isLoading: productsLoading } = useProducts(wsId);
  const { data: promotions = [], isLoading: promotionsLoading } =
    usePromotions(wsId);
  const { data: wallets = [], isLoading: walletsLoading } = useWallets(wsId);
  const { data: categories = [], isLoading: categoriesLoading } =
    useCategories(wsId);

  // State management
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedProducts, setSelectedProducts] = useState<
    SelectedProductItem[]
  >([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const [selectedPromotionId, setSelectedPromotionId] =
    useState<string>('none');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [invoiceContent, setInvoiceContent] = useState<string>('');
  const [invoiceNotes, setInvoiceNotes] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [createMultipleInvoices, setCreateMultipleInvoices] = useState(false);
  // User history queries
  const { data: userTransactions = [], isLoading: userTransactionsLoading } =
    useUserTransactions(wsId, selectedUserId);
  const { data: userInvoices = [], isLoading: userInvoicesLoading } =
    useUserInvoices(wsId, selectedUserId);

  const selectedUser = users.find(
    (user: WorkspaceUser) => user.id === selectedUserId
  );
  const selectedPromotion =
    selectedPromotionId === 'none'
      ? null
      : promotions.find(
          (promotion: Promotion) => promotion.id === selectedPromotionId
        );
  const isLoadingUserHistory = userTransactionsLoading || userInvoicesLoading;
  const isLoadingData =
    usersLoading ||
    productsLoading ||
    promotionsLoading ||
    walletsLoading ||
    categoriesLoading;

  // Calculate totals
  const subtotal = useMemo(() => {
    return selectedProducts.reduce(
      (total, item) => total + item.inventory.price * item.quantity,
      0
    );
  }, [selectedProducts]);

  const discountAmount = useMemo(() => {
    if (!selectedPromotion) return 0;

    if (selectedPromotion.use_ratio) {
      return subtotal * (selectedPromotion.value / 100);
    } else {
      return Math.min(selectedPromotion.value, subtotal);
    }
  }, [selectedPromotion, subtotal]);

  const totalBeforeRounding = subtotal - discountAmount;
  const [roundedTotal, setRoundedTotal] = useState(totalBeforeRounding);

  useEffect(() => {
    setRoundedTotal(totalBeforeRounding);
  }, [totalBeforeRounding]);

  const roundUp = () => {
    setRoundedTotal(Math.ceil(totalBeforeRounding / 1000) * 1000);
  };

  const roundDown = () => {
    setRoundedTotal(Math.floor(totalBeforeRounding / 1000) * 1000);
  };

  const resetRounding = () => {
    setRoundedTotal(totalBeforeRounding);
  };

  // Auto-generate invoice content based on selected products
  useEffect(() => {
    if (selectedProducts.length === 0) {
      setInvoiceContent('');
      return;
    }

    if (selectedProducts.length === 1) {
      const productName =
        selectedProducts[0]?.product.name || 'Unknown Product';
      setInvoiceContent(`Invoice for ${productName}`);
    } else {
      const firstProductName =
        selectedProducts[0]?.product.name || 'Unknown Product';
      const additionalCount = selectedProducts.length - 1;
      setInvoiceContent(
        `Invoice for ${firstProductName} and ${additionalCount} more product${additionalCount > 1 ? 's' : ''}`
      );
    }
  }, [selectedProducts]);

  const handleCreateInvoice = async () => {
    if (
      !selectedUser ||
      selectedProducts.length === 0 ||
      !selectedWalletId ||
      !selectedCategoryId
    ) {
      toast(
        'Please select a customer, add products, choose a wallet, and select a transaction category before creating the invoice.'
      );
      return;
    }

    setIsCreating(true);
    try {
      // Prepare the request payload
      const requestPayload = {
        customer_id: selectedUserId,
        content: invoiceContent,
        notes: invoiceNotes,
        wallet_id: selectedWalletId,
        promotion_id:
          selectedPromotionId !== 'none' ? selectedPromotionId : undefined,
        products: selectedProducts.map((item) => ({
          product_id: item.product.id,
          unit_id: item.inventory.unit_id,
          warehouse_id: item.inventory.warehouse_id,
          quantity: item.quantity,
          price: item.inventory.price,
          category_id: item.product.category_id,
        })),
        category_id: selectedCategoryId,
        // Send frontend calculated values for comparison (optional)
        frontend_subtotal: subtotal,
        frontend_discount_amount: discountAmount,
        frontend_total: roundedTotal,
      };

      // Call the API endpoint
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/finance/invoices`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestPayload),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to create invoice');
      }

      // Show notification if values were recalculated
      if (result.data?.values_recalculated) {
        const { calculated_values, frontend_values } = result.data;
        const roundingInfo =
          calculated_values.rounding_applied !== 0
            ? ` | Rounding: ${Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND',
              }).format(calculated_values.rounding_applied)}`
            : '';

        toast(
          `Invoice created successfully! Values were recalculated on the server.`,
          {
            description: `Server calculated: ${Intl.NumberFormat('vi-VN', {
              style: 'currency',
              currency: 'VND',
            }).format(
              calculated_values.total
            )} | Frontend calculated: ${Intl.NumberFormat('vi-VN', {
              style: 'currency',
              currency: 'VND',
            }).format(frontend_values?.total || 0)}${roundingInfo}`,
            duration: 5000,
          }
        );
      } else {
        toast(`Invoice ${result.invoice_id} created successfully`);
      }

      // Reset form after successful creation
      setSelectedProducts([]);
      setSelectedPromotionId('none');
      setInvoiceContent('');
      setInvoiceNotes('');
      setRoundedTotal(0);
      setSelectedUserId('');
      setSelectedWalletId('');
      setSelectedCategoryId('');

      if (!createMultipleInvoices) {
        router.push(`/${wsId}/finance/invoices/${result.invoice_id}`);
      }
    } catch (error: any) {
      console.error('Error creating invoice:', error);

      // Show error message
      toast(
        `Error creating invoice: ${error.message || 'Failed to create invoice'}`
      );

      // You might want to show an error toast here
      // For example: toast.error(error.message || 'Failed to create invoice');
    } finally {
      setIsCreating(false);
    }
  };

  if (isLoadingData) {
    return (
      <>
        <FeatureSummary
          pluralTitle={t('ws-invoices.new_invoice')}
          singularTitle={t('ws-invoices.new_invoice')}
        />
        <Separator className="my-4" />
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-muted-foreground">Loading invoice data...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-invoices.new_invoice')}
        singularTitle={t('ws-invoices.new_invoice')}
      />
      <Separator className="my-4" />
      <Tabs defaultValue="standard" className="w-full">
        <div className="flex justify-between">
          <TabsList className="grid w-fit grid-cols-2">
            <TabsTrigger value="standard">
              {t('ws-invoices.standard')}
            </TabsTrigger>
            <TabsTrigger value="subscription">
              {t('ws-invoices.subscription')}
            </TabsTrigger>
          </TabsList>
          {/* Create multiple invoices */}
          <div className="flex items-center gap-2">
            <Label htmlFor="create-multiple-invoices">
              Create multiple invoices
            </Label>
            <Switch
              checked={createMultipleInvoices}
              onCheckedChange={setCreateMultipleInvoices}
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    You can create multiple invoices at once by selecting this
                    option.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <TabsContent value="standard" className="w-full">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Left Column - Customer Information and Products */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('invoice-data-table.customer')}</CardTitle>
                  <CardDescription>
                    Select the customer for this invoice.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="space-y-2">
                    <Label htmlFor="customer-select">Customer</Label>
                    <Combobox
                      t={t}
                      options={users.map(
                        (user): ComboboxOptions => ({
                          value: user.id,
                          label: `${user.display_name || user.full_name || 'No name'} (${user.email || user.phone || '-'})`,
                        })
                      )}
                      selected={selectedUserId}
                      onChange={(value) => setSelectedUserId(value as string)}
                      placeholder="Search customers..."
                    />
                  </div>

                  {/* Conditional User History Accordion */}
                  {selectedUser && (
                    <div className="mt-4">
                      {isLoadingUserHistory ? (
                        <div className="py-4 text-center">
                          <p className="text-muted-foreground text-sm">
                            Loading user history...
                          </p>
                        </div>
                      ) : userTransactions.length > 0 ||
                        userInvoices.length > 0 ? (
                        <Accordion type="single" collapsible className="w-full">
                          {userTransactions && userTransactions.length > 0 && (
                            <AccordionItem value="transactions">
                              <AccordionTrigger>
                                {t('ws-transactions.plural')} (
                                {userTransactions.length})
                              </AccordionTrigger>
                              <AccordionContent>
                                <div className="space-y-3">
                                  {userTransactions
                                    .slice(0, 5)
                                    .map((transaction: Transaction) => (
                                      <div
                                        key={transaction.id}
                                        className="flex items-center justify-between rounded-lg border p-3"
                                      >
                                        <div className="flex-1">
                                          <p className="font-medium">
                                            {transaction.description ||
                                              'No description'}
                                          </p>
                                          <p className="text-muted-foreground text-sm">
                                            {transaction.category ||
                                              'No category'}{' '}
                                            •{' '}
                                            {transaction.wallet || 'No wallet'}
                                          </p>
                                          <p className="text-muted-foreground text-xs">
                                            {transaction.taken_at
                                              ? new Date(
                                                  transaction.taken_at
                                                ).toLocaleDateString()
                                              : 'No date'}
                                          </p>
                                        </div>
                                        <div className="text-right">
                                          <p
                                            className={`font-semibold ${
                                              (transaction.amount || 0) >= 0
                                                ? 'text-green-600'
                                                : 'text-red-600'
                                            }`}
                                          >
                                            {transaction.amount !== undefined
                                              ? Intl.NumberFormat('vi-VN', {
                                                  style: 'currency',
                                                  currency: 'VND',
                                                }).format(transaction.amount)
                                              : '-'}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  {userTransactions.length > 5 && (
                                    <p className="text-center text-muted-foreground text-sm">
                                      And {userTransactions.length - 5} more
                                      transactions...
                                    </p>
                                  )}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          )}

                          {userInvoices && userInvoices.length > 0 && (
                            <AccordionItem value="invoices">
                              <AccordionTrigger>
                                {t('ws-invoices.plural')} ({userInvoices.length}
                                )
                              </AccordionTrigger>
                              <AccordionContent>
                                <div className="space-y-3">
                                  {userInvoices
                                    .slice(0, 5)
                                    .map((invoice: Invoice) => (
                                      <div
                                        key={invoice.id}
                                        className="flex items-center justify-between rounded-lg border p-3"
                                      >
                                        <div className="flex-1">
                                          <p className="font-medium">
                                            Invoice #{invoice.id.slice(-8)}
                                          </p>
                                          <p className="text-muted-foreground text-sm">
                                            Status:{' '}
                                            {invoice.completed_at
                                              ? 'Completed'
                                              : 'Pending'}
                                          </p>
                                          <p className="text-muted-foreground text-xs">
                                            {invoice.created_at
                                              ? new Date(
                                                  invoice.created_at
                                                ).toLocaleDateString()
                                              : 'No date'}
                                          </p>
                                          {invoice.note && (
                                            <p className="truncate text-muted-foreground text-xs">
                                              Note: {invoice.note}
                                            </p>
                                          )}
                                        </div>
                                        <div className="text-right">
                                          <p className="font-semibold text-blue-600">
                                            {invoice.price !== undefined
                                              ? Intl.NumberFormat('vi-VN', {
                                                  style: 'currency',
                                                  currency: 'VND',
                                                }).format(invoice.price)
                                              : '-'}
                                          </p>
                                          {invoice.total_diff !== undefined &&
                                            invoice.total_diff !== 0 && (
                                              <p className="text-muted-foreground text-xs">
                                                Diff:{' '}
                                                {Intl.NumberFormat('vi-VN', {
                                                  style: 'currency',
                                                  currency: 'VND',
                                                }).format(invoice.total_diff)}
                                              </p>
                                            )}
                                        </div>
                                      </div>
                                    ))}
                                  {userInvoices.length > 5 && (
                                    <p className="text-center text-muted-foreground text-sm">
                                      And {userInvoices.length - 5} more
                                      invoices...
                                    </p>
                                  )}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          )}
                        </Accordion>
                      ) : (
                        <div className="py-4 text-center">
                          <p className="text-muted-foreground text-sm">
                            No transaction or invoice history found for this
                            user.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Products Section */}
              <ProductSelection
                products={products}
                selectedProducts={selectedProducts}
                onSelectedProductsChange={setSelectedProducts}
              />
            </div>

            {/* Right Column - Invoice Information and Checkout */}
            <div className="space-y-6">
              {/* Unified Invoice Configuration Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Invoice Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure invoice details, payment settings, and review
                    totals.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Invoice Information Section */}
                  <div className="space-y-4">
                    {/* Invoice Content */}
                    <div className="space-y-2">
                      <Label htmlFor="invoice-content">
                        {t('ws-invoices.content')}
                      </Label>
                      <Textarea
                        id="invoice-content"
                        placeholder={t('ws-invoices.content_placeholder')}
                        className="min-h-[80px]"
                        value={invoiceContent}
                        onChange={(e) => setInvoiceContent(e.target.value)}
                      />
                    </div>

                    {/* Invoice Notes */}
                    <div className="space-y-2">
                      <Label htmlFor="invoice-notes">
                        {t('ws-invoices.notes')}
                      </Label>
                      <Textarea
                        id="invoice-notes"
                        placeholder={t('ws-invoices.notes_placeholder')}
                        className="min-h-[60px]"
                        value={invoiceNotes}
                        onChange={(e) => setInvoiceNotes(e.target.value)}
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Payment Settings Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                      <CreditCard className="h-4 w-4" />
                      Payment Settings
                    </div>

                    {/* Wallet Selection */}
                    <div className="space-y-2">
                      <Label htmlFor="wallet-select">
                        {t('ws-wallets.wallet')}{' '}
                        <span className="text-red-500">*</span>
                      </Label>
                      <Select
                        value={selectedWalletId}
                        onValueChange={setSelectedWalletId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a wallet (required)..." />
                        </SelectTrigger>
                        <SelectContent>
                          {wallets.map((wallet) => (
                            <SelectItem
                              key={wallet.id}
                              value={wallet.id || 'invalid'}
                            >
                              <div className="flex items-center gap-2">
                                <CreditCard className="h-4 w-4" />
                                <div className="flex flex-row gap-2">
                                  <p className="font-medium">
                                    {wallet.name || 'Unnamed Wallet'}
                                  </p>
                                  <p className="text-muted-foreground text-sm">
                                    {wallet.type || 'STANDARD'} -{' '}
                                    {wallet.currency || 'VND'}
                                  </p>
                                </div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Transaction Category Selection */}
                    <div className="space-y-2">
                      <Label htmlFor="category-select">
                        Transaction Category{' '}
                        <span className="text-red-500">*</span>
                      </Label>
                      <Combobox
                        t={t}
                        options={categories.map(
                          (category): ComboboxOptions => ({
                            value: category.id || '',
                            label: category.name || 'Unnamed Category',
                          })
                        )}
                        selected={selectedCategoryId}
                        onChange={(value) =>
                          setSelectedCategoryId(value as string)
                        }
                        placeholder="Select a category (required)..."
                      />
                    </div>

                    {/* Promotion Selection */}
                    <div className="space-y-2">
                      <Label htmlFor="promotion-select">
                        {t('invoices.add_promotion')}
                      </Label>
                      <Combobox
                        t={t}
                        options={[
                          { value: 'none', label: 'No promotion' },
                          ...promotions.map(
                            (promotion): ComboboxOptions => ({
                              value: promotion.id,
                              label: `${promotion.name || 'Unnamed Promotion'} (${
                                promotion.use_ratio
                                  ? `${promotion.value}%`
                                  : Intl.NumberFormat('vi-VN', {
                                      style: 'currency',
                                      currency: 'VND',
                                    }).format(promotion.value)
                              })`,
                            })
                          ),
                        ]}
                        selected={selectedPromotionId}
                        onChange={(value) =>
                          setSelectedPromotionId(value as string)
                        }
                        placeholder="Search promotions..."
                      />
                    </div>
                  </div>

                  {/* Checkout Section */}
                  {selectedProducts.length > 0 && (
                    <>
                      <Separator />

                      <div className="space-y-4">
                        <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                          <Calculator className="h-4 w-4" />
                          Checkout
                        </div>

                        {/* Summary */}
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              Subtotal
                            </span>
                            <span>
                              {Intl.NumberFormat('vi-VN', {
                                style: 'currency',
                                currency: 'VND',
                              }).format(subtotal)}
                            </span>
                          </div>

                          {selectedPromotion && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Discount (
                                {selectedPromotion.name || 'Unnamed Promotion'})
                              </span>
                              <span className="text-green-600">
                                -
                                {Intl.NumberFormat('vi-VN', {
                                  style: 'currency',
                                  currency: 'VND',
                                }).format(discountAmount)}
                              </span>
                            </div>
                          )}

                          <Separator />

                          <div className="flex justify-between font-semibold">
                            <span>Total</span>
                            <span>
                              {Intl.NumberFormat('vi-VN', {
                                style: 'currency',
                                currency: 'VND',
                              }).format(roundedTotal)}
                            </span>
                          </div>

                          {Math.abs(roundedTotal - totalBeforeRounding) >
                            0.01 && (
                            <div className="flex justify-between text-muted-foreground text-sm">
                              <span>Adjustment</span>
                              <span>
                                {roundedTotal > totalBeforeRounding ? '+' : ''}
                                {Intl.NumberFormat('vi-VN', {
                                  style: 'currency',
                                  currency: 'VND',
                                }).format(roundedTotal - totalBeforeRounding)}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Rounding Controls */}
                        <div className="space-y-2">
                          <Label>Rounding Options</Label>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={roundUp}
                              className="flex-1"
                            >
                              <ArrowUp className="mr-1 h-4 w-4" />
                              Round Up
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={roundDown}
                              className="flex-1"
                            >
                              <ArrowDown className="mr-1 h-4 w-4" />
                              Round Down
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={resetRounding}
                              disabled={
                                Math.abs(roundedTotal - totalBeforeRounding) <
                                0.01
                              }
                            >
                              Reset
                            </Button>
                          </div>
                        </div>

                        {/* Create Invoice Button */}
                        <Button
                          className="w-full"
                          onClick={handleCreateInvoice}
                          disabled={
                            !selectedUser ||
                            selectedProducts.length === 0 ||
                            !selectedWalletId ||
                            !selectedCategoryId ||
                            isCreating
                          }
                        >
                          {isCreating ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Creating Invoice...
                            </>
                          ) : (
                            'Create Invoice'
                          )}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
