'use client';

import {
  ArrowDown,
  ArrowUp,
  Calculator,
  CreditCard,
  FileText,
  Loader2,
} from '@tuturuuu/icons';
import type { Invoice } from '@tuturuuu/types/primitives/Invoice';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
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
import { Combobox, type ComboboxOptions } from '@tuturuuu/ui/custom/combobox';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AvailablePromotion } from './hooks';
import {
  useAvailablePromotions,
  useCategories,
  useProducts,
  useUserInvoices,
  useUserLinkedPromotions,
  useUserReferralDiscounts,
  useUsersWithSelectableGroups,
  useUserTransactions,
  useWallets,
} from './hooks';
import { ProductSelection } from './product-selection';
import type { SelectedProductItem } from './types';

interface Props {
  wsId: string;
  createMultipleInvoices: boolean;
  printAfterCreate?: boolean;
}

export function StandardInvoice({
  wsId,
  createMultipleInvoices,
  printAfterCreate = false,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read from URL params
  const selectedUserId = searchParams.get('user_id') || '';

  // Helper to update URL params
  const updateSearchParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams);
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [searchParams, router.replace]
  );

  // Data queries
  const { data: users = [], isLoading: usersLoading } =
    useUsersWithSelectableGroups(wsId);
  const { data: products = [], isLoading: productsLoading } = useProducts(wsId);
  const { data: availablePromotions = [], isLoading: promotionsLoading } =
    useAvailablePromotions(wsId, selectedUserId);
  const { data: linkedPromotions = [] } =
    useUserLinkedPromotions(selectedUserId);
  const { data: referralDiscountRows = [] } = useUserReferralDiscounts(
    wsId,
    selectedUserId
  );
  const { data: wallets = [], isLoading: walletsLoading } = useWallets(wsId);
  const { data: categories = [], isLoading: categoriesLoading } =
    useCategories(wsId);

  // State management
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
      : availablePromotions.find(
          (promotion: AvailablePromotion) =>
            promotion.id === selectedPromotionId
        );
  const isLoadingUserHistory = userTransactionsLoading || userInvoicesLoading;
  const isLoadingData =
    usersLoading ||
    productsLoading ||
    promotionsLoading ||
    walletsLoading ||
    categoriesLoading;

  const referralDiscountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of referralDiscountRows || []) {
      if (row?.promo_id) {
        map.set(row.promo_id, row.calculated_discount_value ?? 0);
      }
    }
    return map;
  }, [referralDiscountRows]);

  // Calculate totals
  const subtotal = useMemo(() => {
    return selectedProducts.reduce(
      (total, item) => total + item.inventory.price * item.quantity,
      0
    );
  }, [selectedProducts]);

  const discountAmount = useMemo(() => {
    if (!selectedPromotionId || selectedPromotionId === 'none') return 0;

    const referralPercent = referralDiscountMap.get(selectedPromotionId);
    if (referralPercent !== undefined) {
      return subtotal * ((referralPercent || 0) / 100);
    }

    if (selectedPromotion) {
      return selectedPromotion.use_ratio
        ? subtotal * (selectedPromotion.value / 100)
        : Math.min(selectedPromotion.value, subtotal);
    }

    return 0;
  }, [selectedPromotionId, selectedPromotion, subtotal, referralDiscountMap]);

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
        selectedProducts[0]?.product.name || t('ws-invoices.unknown_product');
      setInvoiceContent(t('ws-invoices.invoice_for_product', { productName }));
    } else {
      const firstProductName =
        selectedProducts[0]?.product.name || t('ws-invoices.unknown_product');
      const additionalCount = selectedProducts.length - 1;
      const translationKey =
        additionalCount > 1
          ? 'invoice_for_product_and_more_plural'
          : 'invoice_for_product_and_more';
      setInvoiceContent(
        t(`ws-invoices.${translationKey}`, {
          productName: firstProductName,
          count: additionalCount,
        })
      );
    }
  }, [selectedProducts, t]);

  // Auto-select user's best linked promotion based on current subtotal
  useEffect(() => {
    if (
      !selectedUserId ||
      !Array.isArray(linkedPromotions) ||
      linkedPromotions.length === 0 ||
      selectedPromotionId !== 'none' ||
      subtotal <= 0
    ) {
      return;
    }

    // Build candidate list from linked promotions directly (includes referral)
    const candidates = (linkedPromotions || [])
      .map((lp) => {
        const id = lp?.promo_id as string | undefined;
        const promoObj = lp?.workspace_promotions as
          | { value?: number | null; use_ratio?: boolean | null }
          | undefined;
        return id
          ? {
              id,
              use_ratio: !!promoObj?.use_ratio,
              value: Number(promoObj?.value ?? 0),
            }
          : null;
      })
      .filter(Boolean) as Array<{
      id: string;
      use_ratio: boolean;
      value: number;
    }>;

    if (candidates.length === 0) return;

    const computeDiscount = (id: string, use_ratio: boolean, value: number) => {
      const referralPercent = referralDiscountMap.get(id);
      if (referralPercent !== undefined) {
        return subtotal * ((referralPercent || 0) / 100);
      }
      return use_ratio ? subtotal * (value / 100) : Math.min(value, subtotal);
    };

    let best: { id: string } | null = null;
    let bestAmount = -1;
    for (const c of candidates) {
      const amount = computeDiscount(c.id, c.use_ratio, c.value);
      if (amount > bestAmount) {
        best = { id: c.id };
        bestAmount = amount;
      }
    }

    if (best?.id) {
      setSelectedPromotionId(best.id);
    }
  }, [
    selectedUserId,
    linkedPromotions,
    selectedPromotionId,
    subtotal,
    referralDiscountMap,
  ]);

  const handleCreateInvoice = async () => {
    if (
      !selectedUser ||
      selectedProducts.length === 0 ||
      !selectedWalletId ||
      !selectedCategoryId
    ) {
      toast(t('ws-invoices.create_invoice_validation'));
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
            ? ` | ${t('ws-invoices.rounding')}: ${Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND',
              }).format(calculated_values.rounding_applied)}`
            : '';

        toast(t('ws-invoices.invoice_created_recalculated'), {
          description: `${t('ws-invoices.server_calculated')}: ${Intl.NumberFormat(
            'vi-VN',
            {
              style: 'currency',
              currency: 'VND',
            }
          ).format(
            calculated_values.total
          )} | ${t('ws-invoices.frontend_calculated')}: ${Intl.NumberFormat(
            'vi-VN',
            {
              style: 'currency',
              currency: 'VND',
            }
          ).format(frontend_values?.total || 0)}${roundingInfo}`,
          duration: 5000,
        });
      } else {
        toast(
          t('ws-invoices.invoice_created_success', {
            invoiceId: result.invoice_id,
          })
        );
      }

      if (!createMultipleInvoices) {
        const query = printAfterCreate ? '?print=true' : '';
        router.push(`/${wsId}/finance/invoices/${result.invoice_id}${query}`);
      } else {
        // Reset form after successful creation
        setSelectedProducts([]);
        setSelectedPromotionId('none');
        setInvoiceContent('');
        setInvoiceNotes('');
        setRoundedTotal(0);
        updateSearchParam('user_id', '');
        setSelectedWalletId('');
        setSelectedCategoryId('');
      }
    } catch (error) {
      console.error('Error creating invoice:', error);

      // Show error message
      toast(
        t('ws-invoices.error_creating_invoice', {
          error:
            error instanceof Error
              ? error.message
              : t('ws-invoices.failed_to_create_invoice'),
        })
      );

      // You might want to show an error toast here
      // For example: toast.error(error.message || 'Failed to create invoice');
    } finally {
      setIsCreating(false);
    }
  };

  if (isLoadingData) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <p className="text-muted-foreground text-sm">
            {t('ws-invoices.loading')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Left Column - Customer and Products */}
      <div className="space-y-6">
        {/* Customer Selection */}
        <Card>
          <CardHeader>
            <CardTitle>{t('invoice-data-table.customer')}</CardTitle>
            <CardDescription>
              {t('ws-invoices.customer_selection_description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-2">
              <Label htmlFor="customer-select">
                {t('ws-invoices.customer')}
              </Label>
              <Combobox
                t={t}
                options={users.map(
                  (user): ComboboxOptions => ({
                    value: user.id,
                    label: `${user.full_name} ${user.display_name ? `(${user.display_name})` : ''} (${user.email || user.phone || '-'})`,
                  })
                )}
                selected={selectedUserId}
                onChange={(value) =>
                  updateSearchParam('user_id', value as string)
                }
                placeholder={t('ws-invoices.search_customers')}
              />
            </div>
            {/* Conditional User History Accordion */}
            {selectedUser && (
              <div className="mt-4">
                {isLoadingUserHistory ? (
                  <div className="py-4 text-center">
                    <p className="text-muted-foreground text-sm">
                      {t('ws-invoices.loading_user_history')}
                    </p>
                  </div>
                ) : userTransactions.length > 0 || userInvoices.length > 0 ? (
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
                                        t('ws-invoices.no_description')}
                                    </p>
                                    <p className="text-muted-foreground text-sm">
                                      {transaction.category ||
                                        t('ws-invoices.no_category')}{' '}
                                      •{' '}
                                      {transaction.wallet ||
                                        t('ws-invoices.no_wallet')}
                                    </p>
                                    <p className="text-muted-foreground text-xs">
                                      {transaction.taken_at
                                        ? new Date(
                                            transaction.taken_at
                                          ).toLocaleDateString()
                                        : t('ws-invoices.no_date')}
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
                                {t('ws-invoices.and_more_transactions', {
                                  count: userTransactions.length - 5,
                                })}
                              </p>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )}

                    {userInvoices && userInvoices.length > 0 && (
                      <AccordionItem value="invoices">
                        <AccordionTrigger>
                          {t('ws-invoices.plural')} ({userInvoices.length})
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
                                      {t('ws-invoices.invoice_id_short', {
                                        id: invoice.id.slice(-8),
                                      })}
                                    </p>
                                    <p className="text-muted-foreground text-sm">
                                      {t('ws-invoices.status')}:{' '}
                                      {invoice.completed_at
                                        ? t('ws-invoices.completed')
                                        : t('ws-invoices.pending')}
                                    </p>
                                    <p className="text-muted-foreground text-xs">
                                      {invoice.created_at
                                        ? new Date(
                                            invoice.created_at
                                          ).toLocaleDateString()
                                        : t('ws-invoices.no_date')}
                                    </p>
                                    {invoice.note && (
                                      <p className="truncate text-muted-foreground text-xs">
                                        {t('ws-invoices.note')}: {invoice.note}
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
                                          {t('ws-invoices.diff')}:{' '}
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
                                {t('ws-invoices.and_more_invoices', {
                                  count: userInvoices.length - 5,
                                })}
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
                      {t('ws-invoices.no_transaction_or_invoice_history')}
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

      {/* Right Column - Invoice Configuration */}
      <div className="space-y-6">
        {/* Invoice Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t('ws-invoices.invoice_configuration')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Invoice Content */}
            <div className="space-y-2">
              <Label htmlFor="invoice-content">
                {t('ws-invoices.content')}
              </Label>
              <Textarea
                id="invoice-content"
                placeholder={t('ws-invoices.content_placeholder')}
                className="min-h-20"
                value={invoiceContent}
                onChange={(e) => setInvoiceContent(e.target.value)}
              />
            </div>

            {/* Invoice Notes */}
            <div className="space-y-2">
              <Label htmlFor="invoice-notes">{t('ws-invoices.notes')}</Label>
              <Textarea
                id="invoice-notes"
                placeholder={t('ws-invoices.notes_placeholder')}
                className="min-h-15"
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Payment Settings and Checkout */}
        <Card>
          <CardHeader>
            <CardTitle>{t('ws-invoices.payment_and_checkout')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Payment Settings Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                <CreditCard className="h-4 w-4" />
                {t('ws-invoices.payment_settings')}
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
                    <SelectValue
                      placeholder={t('ws-invoices.select_wallet_required')}
                    />
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
                              {wallet.name || t('ws-invoices.unnamed_wallet')}
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
                  {t('ws-invoices.transaction_category')}{' '}
                  <span className="text-red-500">*</span>
                </Label>
                <Combobox
                  t={t}
                  options={categories.map(
                    (category): ComboboxOptions => ({
                      value: category.id || '',
                      label: category.name || t('ws-invoices.unnamed_category'),
                    })
                  )}
                  selected={selectedCategoryId}
                  onChange={(value) => setSelectedCategoryId(value as string)}
                  placeholder={t('ws-invoices.select_category_required')}
                />
              </div>

              {/* Promotion Selection */}
              <div className="space-y-2">
                <Label htmlFor="promotion-select">
                  {t('invoices.add_promotion')}
                </Label>
                <Combobox
                  t={t}
                  options={(() => {
                    const list: ComboboxOptions[] = [
                      { value: 'none', label: t('ws-invoices.no_promotion') },
                      ...availablePromotions.map(
                        (promotion: AvailablePromotion): ComboboxOptions => {
                          const referralPercent = referralDiscountMap.get(
                            promotion.id
                          );
                          const labelValue =
                            referralPercent !== undefined
                              ? `${referralPercent || 0}%`
                              : promotion.use_ratio
                                ? `${promotion.value}%`
                                : Intl.NumberFormat('vi-VN', {
                                    style: 'currency',
                                    currency: 'VND',
                                  }).format(promotion.value);
                          return {
                            value: promotion.id,
                            label: `${promotion.name || t('ws-invoices.unnamed_promotion')} (${labelValue})`,
                          } as ComboboxOptions;
                        }
                      ),
                    ];

                    // If auto-applied referral promotion isn't in the normal list, inject a synthetic item
                    if (
                      selectedPromotionId &&
                      selectedPromotionId !== 'none' &&
                      !availablePromotions.some(
                        (p: AvailablePromotion) => p.id === selectedPromotionId
                      )
                    ) {
                      const referralPercent =
                        referralDiscountMap.get(selectedPromotionId);
                      const referralName =
                        (linkedPromotions || []).find(
                          (lp) => lp.promo_id === selectedPromotionId
                        )?.workspace_promotions?.name ||
                        t('ws-invoices.unnamed_promotion');
                      list.splice(1, 0, {
                        value: selectedPromotionId,
                        label: `${referralName} (${referralPercent ?? 0}%)`,
                      } as ComboboxOptions);
                    }

                    return list;
                  })()}
                  selected={selectedPromotionId}
                  onChange={(value) => setSelectedPromotionId(value as string)}
                  placeholder={t('ws-invoices.search_promotions')}
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
                    {t('ws-invoices.checkout')}
                  </div>

                  {/* Summary */}
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t('ws-invoices.subtotal')}
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
                          {t('ws-invoices.discount')} (
                          {selectedPromotion.name ||
                            t('ws-invoices.unnamed_promotion')}
                          )
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
                      <span>{t('ws-invoices.total')}</span>
                      <span>
                        {Intl.NumberFormat('vi-VN', {
                          style: 'currency',
                          currency: 'VND',
                        }).format(roundedTotal)}
                      </span>
                    </div>

                    {Math.abs(roundedTotal - totalBeforeRounding) > 0.01 && (
                      <div className="flex justify-between text-muted-foreground text-sm">
                        <span>{t('ws-invoices.adjustment')}</span>
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
                    <Label>{t('ws-invoices.rounding_options')}</Label>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={roundUp}
                        className="flex-1"
                      >
                        <ArrowUp className="mr-1 h-4 w-4" />
                        {t('ws-invoices.round_up')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={roundDown}
                        className="flex-1"
                      >
                        <ArrowDown className="mr-1 h-4 w-4" />
                        {t('ws-invoices.round_down')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={resetRounding}
                        disabled={
                          Math.abs(roundedTotal - totalBeforeRounding) < 0.01
                        }
                      >
                        {t('ws-invoices.reset')}
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
                        {t('ws-invoices.creating_invoice')}
                      </>
                    ) : (
                      t('ws-invoices.create_invoice')
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
