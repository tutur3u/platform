'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Calculator, Loader2, Plus } from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { InvoiceBlockedState } from './components/invoice-blocked-state';
import { InvoiceCheckoutSummary } from './components/invoice-checkout-summary';
import { InvoiceContentEditor } from './components/invoice-content-editor';
import { InvoiceCustomerSelectCard } from './components/invoice-customer-select-card';
import { InvoicePaymentSettings } from './components/invoice-payment-settings';
import { InvoiceUserHistoryAccordion } from './components/invoice-user-history-accordion';
import { CreatePromotionDialog } from './create-promotion-dialog';
import type { AvailablePromotion } from './hooks';
import {
  useAvailablePromotions,
  useCategories,
  useInvoiceBlockedGroups,
  useInvoicePromotionConfig,
  useProducts,
  useUserGroups,
  useUserLinkedPromotions,
  useUserReferralDiscounts,
  useUsersWithSelectableGroups,
  useWallets,
} from './hooks';
import { useBestPromotionSelection } from './hooks/use-best-promotion-selection';
import { useInvoiceRounding } from './hooks/use-invoice-rounding';
import { useInvoiceSubtotal } from './hooks/use-invoice-subtotal';
import { ProductSelection } from './product-selection';
import type { SelectedProductItem } from './types';

interface Props {
  wsId: string;
  createMultipleInvoices: boolean;
  printAfterCreate?: boolean;
  downloadImageAfterCreate?: boolean;
  defaultWalletId?: string;
  defaultCurrency?: 'VND' | 'USD';
}

export function StandardInvoice({
  wsId,
  createMultipleInvoices,
  printAfterCreate = false,
  downloadImageAfterCreate = false,
  defaultWalletId,
  defaultCurrency = 'USD',
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // Compute locale based on currency
  const currencyLocale = defaultCurrency === 'VND' ? 'vi-VN' : 'en-US';

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
  const { data: promotionsAllowed = true } = useInvoicePromotionConfig(wsId);
  const { data: linkedPromotions = [] } =
    useUserLinkedPromotions(selectedUserId);
  const { data: referralDiscountRows = [] } = useUserReferralDiscounts(
    wsId,
    selectedUserId
  );
  const { data: wallets = [], isLoading: walletsLoading } = useWallets(wsId);
  const { data: categories = [], isLoading: categoriesLoading } =
    useCategories(wsId);

  // Blocked groups check
  const { data: blockedGroupIds = [] } = useInvoiceBlockedGroups(wsId);
  const { data: userGroups = [], isLoading: userGroupsLoading } =
    useUserGroups(selectedUserId);

  const isBlocked = useMemo(() => {
    if (
      !selectedUserId ||
      blockedGroupIds.length === 0 ||
      userGroups.length === 0
    )
      return false;

    return userGroups.some(
      (group) =>
        group.workspace_user_groups?.id &&
        blockedGroupIds.includes(group.workspace_user_groups.id)
    );
  }, [selectedUserId, blockedGroupIds, userGroups]);

  // State management
  const [selectedProducts, setSelectedProducts] = useState<
    SelectedProductItem[]
  >([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string>(
    defaultWalletId || ''
  );

  useEffect(() => {
    if (defaultWalletId) {
      setSelectedWalletId(defaultWalletId);
    }
  }, [defaultWalletId]);
  const [selectedPromotionId, setSelectedPromotionId] =
    useState<string>('none');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [invoiceContent, setInvoiceContent] = useState<string>('');
  const [invoiceNotes, setInvoiceNotes] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [createPromotionOpen, setCreatePromotionOpen] = useState(false);

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
  const isLoadingData =
    usersLoading ||
    productsLoading ||
    promotionsLoading ||
    walletsLoading ||
    categoriesLoading ||
    userGroupsLoading;

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
  const subtotal = useInvoiceSubtotal(selectedProducts);

  const discountAmount = useMemo(() => {
    if (
      !promotionsAllowed ||
      !selectedPromotionId ||
      selectedPromotionId === 'none'
    )
      return 0;

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
  }, [
    selectedPromotionId,
    selectedPromotion,
    subtotal,
    referralDiscountMap,
    promotionsAllowed,
  ]);

  const totalBeforeRounding = subtotal - discountAmount;
  const { roundedTotal, roundUp, roundDown, resetRounding } =
    useInvoiceRounding(totalBeforeRounding);

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

  // Reset promotion when user is cleared
  useEffect(() => {
    if (!selectedUserId) {
      setSelectedPromotionId('none');
    }
  }, [selectedUserId]);

  useBestPromotionSelection({
    enabled: promotionsAllowed,
    selectedUserId,
    linkedPromotions,
    selectedPromotionId,
    subtotal,
    referralDiscountMap,
    onSelectPromotion: setSelectedPromotionId,
  });

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
            ? ` | ${t('ws-invoices.rounding')}: ${Intl.NumberFormat(
                currencyLocale,
                {
                  style: 'currency',
                  currency: defaultCurrency,
                }
              ).format(calculated_values.rounding_applied)}`
            : '';

        toast(t('ws-invoices.invoice_created_recalculated'), {
          description: `${t('ws-invoices.server_calculated')}: ${Intl.NumberFormat(
            currencyLocale,
            {
              style: 'currency',
              currency: defaultCurrency,
            }
          ).format(
            calculated_values.total
          )} | ${t('ws-invoices.frontend_calculated')}: ${Intl.NumberFormat(
            currencyLocale,
            {
              style: 'currency',
              currency: defaultCurrency,
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
        const queryParams = new URLSearchParams();
        if (printAfterCreate) queryParams.set('print', 'true');
        if (downloadImageAfterCreate) queryParams.set('image', 'true');

        const queryString = queryParams.toString();
        const query = queryString ? `?${queryString}` : '';

        router.push(`/${wsId}/finance/invoices/${result.invoice_id}${query}`);
      } else {
        // Reset form after successful creation
        setSelectedProducts([]);
        setSelectedPromotionId('none');
        setInvoiceContent('');
        setInvoiceNotes('');
        resetRounding();
        updateSearchParam('user_id', '');
        setSelectedWalletId('');
        setSelectedCategoryId('');
      }
    } catch (error) {
      console.error('Error creating invoice:', error);

      // Show error message
      const rawMessage = error instanceof Error ? error.message : '';
      const friendlyMessage = rawMessage
        .toLowerCase()
        .includes('promotion usage limit reached')
        ? t('ws-invoices.promotion_limit_reached')
        : rawMessage || t('ws-invoices.failed_to_create_invoice');
      toast(
        t('ws-invoices.error_creating_invoice', {
          error: friendlyMessage,
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
        <InvoiceCustomerSelectCard
          title={t('invoice-data-table.customer')}
          description={t('ws-invoices.customer_selection_description')}
          customers={users}
          selectedUserId={selectedUserId}
          onSelect={(value) => updateSearchParam('user_id', value)}
          selectedUser={selectedUser}
          showUserPreview
        >
          {/* Conditional User History Accordion */}
          {selectedUser && (
            <InvoiceUserHistoryAccordion wsId={wsId} userId={selectedUser.id} />
          )}
        </InvoiceCustomerSelectCard>

        {!isBlocked && (
          <ProductSelection
            products={products}
            selectedProducts={selectedProducts}
            onSelectedProductsChange={setSelectedProducts}
            currency={defaultCurrency}
          />
        )}
      </div>
      <div className="space-y-6">
        {isBlocked ? (
          <InvoiceBlockedState type="standard" />
        ) : (
          <>
            <InvoiceContentEditor
              type="standard"
              contentValue={invoiceContent}
              notesValue={invoiceNotes}
              onContentChange={setInvoiceContent}
              onNotesChange={setInvoiceNotes}
            />
            <Card>
              <CardHeader>
                <CardTitle>{t('ws-invoices.payment_and_checkout')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <InvoicePaymentSettings
                  wallets={wallets}
                  categories={categories}
                  selectedWalletId={selectedWalletId}
                  selectedCategoryId={selectedCategoryId}
                  onWalletChange={setSelectedWalletId}
                  onCategoryChange={setSelectedCategoryId}
                  showPromotion
                  currency={defaultCurrency}
                  promotionsAllowed={promotionsAllowed}
                  selectedUserId={selectedUserId}
                  selectedPromotionId={selectedPromotionId}
                  availablePromotions={availablePromotions}
                  linkedPromotions={linkedPromotions}
                  referralDiscountMap={referralDiscountMap}
                  onPromotionChange={setSelectedPromotionId}
                  promotionActions={
                    <CreatePromotionDialog
                      wsId={wsId}
                      open={createPromotionOpen}
                      onOpenChange={setCreatePromotionOpen}
                      onSuccess={(promotion) => {
                        if (selectedUserId) {
                          void queryClient.invalidateQueries({
                            queryKey: [
                              'available-promotions',
                              wsId,
                              selectedUserId,
                            ],
                          });
                        }
                        if (promotion.id) {
                          setSelectedPromotionId(promotion.id);
                        }
                      }}
                    />
                  }
                  promotionActionsList={
                    selectedUserId
                      ? [
                          {
                            key: 'create-promotion',
                            label: t('ws-invoices.create_promotion'),
                            icon: <Plus className="h-4 w-4 text-primary" />,
                            onSelect: () => setCreatePromotionOpen(true),
                          },
                        ]
                      : undefined
                  }
                  promotionActionsPosition="top"
                  promotionPlaceholder={
                    selectedUserId
                      ? t('ws-invoices.search_promotions')
                      : t('ws-invoices.select_user_first')
                  }
                />

                {selectedProducts.length > 0 && (
                  <>
                    <Separator />

                    <div className="space-y-4">
                      <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                        <Calculator className="h-4 w-4" />
                        {t('ws-invoices.checkout')}
                      </div>

                      <InvoiceCheckoutSummary
                        subtotal={subtotal}
                        totalBeforeRounding={totalBeforeRounding}
                        roundedTotal={roundedTotal}
                        discountAmount={
                          promotionsAllowed && !!selectedPromotion
                            ? discountAmount
                            : undefined
                        }
                        discountLabel={
                          promotionsAllowed && !!selectedPromotion
                            ? selectedPromotion.name ||
                              t('ws-invoices.unnamed_promotion')
                            : null
                        }
                        onRoundUp={roundUp}
                        onRoundDown={roundDown}
                        onResetRounding={resetRounding}
                        roundingDisabled={
                          Math.abs(roundedTotal - totalBeforeRounding) < 0.01
                        }
                      />

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
          </>
        )}
      </div>
    </div>
  );
}
