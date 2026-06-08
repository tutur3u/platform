'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Calculator, Loader2, Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { shouldLockFinanceWalletSelectionOnCreate } from '@tuturuuu/utils/finance';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQueryState } from 'nuqs';
import { useEffect, useMemo, useState } from 'react';
import { useDebounce } from '../../../../hooks/use-debounce';
import { useFinanceHref } from '../finance-route-context';
import {
  type FinancePermissionRequestUser,
  FinancePermissionWarningDialog,
} from '../shared/finance-permission-warning-dialog';
import { useFinanceConfidentialVisibility } from '../shared/use-finance-confidential-visibility';
import { InvoiceBlockedState } from './components/invoice-blocked-state';
import { InvoiceCheckoutSummary } from './components/invoice-checkout-summary';
import { InvoiceContentEditor } from './components/invoice-content-editor';
import { InvoiceCustomerSelectCard } from './components/invoice-customer-select-card';
import { InvoicePaymentSettings } from './components/invoice-payment-settings';
import {
  InvoiceProductsPermissionWarning,
  isPermissionRequestError,
} from './components/invoice-products-permission-warning';
import { InvoiceUserHistoryAccordion } from './components/invoice-user-history-accordion';
import { CreatePromotionDialog } from './create-promotion-dialog';
import type { AvailablePromotion } from './hooks';
import {
  useAvailablePromotions,
  useCategories,
  useInvoiceBlockedGroups,
  useInvoiceCustomerSearch,
  useInvoicePromotionConfig,
  useProducts,
  useUserGroups,
  useUserLinkedPromotions,
  useUserReferralDiscounts,
  useWallets,
} from './hooks';
import { useBestPromotionSelection } from './hooks/use-best-promotion-selection';
import { useInvoiceRounding } from './hooks/use-invoice-rounding';
import { useInvoiceSubtotal } from './hooks/use-invoice-subtotal';
import { createInvoiceWithInternalApi } from './internal-api';
import { formatInvoiceRecalculationDescription } from './invoice-visibility-format';
import { ProductSelection } from './product-selection';
import type { SelectedProductItem } from './types';

interface Props {
  wsId: string;
  createMultipleInvoices: boolean;
  printAfterCreate?: boolean;
  downloadImageAfterCreate?: boolean;
  defaultWalletId?: string;
  defaultCurrency?: 'VND' | 'USD';
  canChangeFinanceWallets?: boolean;
  canSetFinanceWalletsOnCreate?: boolean;
  canReadInvoiceProducts?: boolean;
  canReadInvoiceProductStock?: boolean;
  permissionRequestUser?: FinancePermissionRequestUser | null;
}

export function StandardInvoice({
  wsId,
  createMultipleInvoices,
  printAfterCreate = false,
  downloadImageAfterCreate = false,
  defaultWalletId,
  defaultCurrency = 'USD',
  canChangeFinanceWallets = true,
  canSetFinanceWalletsOnCreate = true,
  canReadInvoiceProducts = true,
  canReadInvoiceProductStock = true,
  permissionRequestUser,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const { isConfidential: areNumbersHidden } =
    useFinanceConfidentialVisibility();

  const queryClient = useQueryClient();
  const financeHref = useFinanceHref();
  const [customerSearch, setCustomerSearch] = useState('');
  const [debouncedCustomerSearch] = useDebounce(customerSearch, 300);

  // Read from URL params
  const [selectedUserId, setSelectedUserId] = useQueryState('user_id', {
    defaultValue: '',
  });

  // Data queries
  const {
    customers: users,
    selectedUser,
    isLoading: usersLoading,
    error: usersError,
    hasNextPage: hasMoreCustomers,
    fetchNextPage: fetchMoreCustomers,
    isFetching: isFetchingCustomers,
    isFetchingNextPage: isFetchingMoreCustomers,
  } = useInvoiceCustomerSearch(wsId, debouncedCustomerSearch, selectedUserId);
  const {
    data: products = [],
    error: productsError,
    isLoading: productsLoading,
  } = useProducts(wsId);
  const { data: availablePromotions = [], isLoading: promotionsLoading } =
    useAvailablePromotions(wsId, selectedUserId);
  const { data: promotionsAllowed = true } = useInvoicePromotionConfig(wsId);
  const { data: linkedPromotions = [] } = useUserLinkedPromotions(
    wsId,
    selectedUserId
  );
  const { data: referralDiscountRows = [] } = useUserReferralDiscounts(
    wsId,
    selectedUserId
  );
  const { data: wallets = [], isLoading: walletsLoading } = useWallets(wsId);
  const { data: categories = [], isLoading: categoriesLoading } =
    useCategories(wsId);

  // Blocked groups check
  const { data: blockedGroupIds = [] } = useInvoiceBlockedGroups(wsId);
  const { data: userGroups = [], isLoading: userGroupsLoading } = useUserGroups(
    wsId,
    selectedUserId
  );

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
  const isWalletSelectionLocked = shouldLockFinanceWalletSelectionOnCreate({
    defaultWalletId,
    canChangeFinanceWallets,
    canSetFinanceWalletsOnCreate,
  });
  const walletPermissionWarning =
    isWalletSelectionLocked && permissionRequestUser ? (
      <FinancePermissionWarningDialog
        missingPermissions={['set_finance_wallets_on_create']}
        user={permissionRequestUser}
        trigger={
          <Button type="button" variant="outline" size="sm">
            {t('finance-permission-warning.open_request')}
          </Button>
        }
      />
    ) : null;

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

  const invoiceProductMissingPermissions = useMemo(() => {
    const missingPermissions = new Set<string>();

    if (!canReadInvoiceProducts || isPermissionRequestError(productsError)) {
      missingPermissions.add('create_inventory_sales');
      missingPermissions.add('view_inventory_catalog');
    }

    if (!canReadInvoiceProductStock) {
      missingPermissions.add('create_inventory_sales');
      missingPermissions.add('view_inventory_stock');
    }

    return [...missingPermissions];
  }, [canReadInvoiceProductStock, canReadInvoiceProducts, productsError]);

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
  const linkedFinanceCategoryIds = useMemo(
    () => [
      ...new Set(
        selectedProducts
          .map((item) => item.product.finance_category_id)
          .filter((value): value is string => Boolean(value))
      ),
    ],
    [selectedProducts]
  );
  const hasMixedLinkedFinanceCategories = linkedFinanceCategoryIds.length > 1;
  const hasSingleLinkedFinanceCategory = linkedFinanceCategoryIds.length === 1;

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

  useEffect(() => {
    if (hasSingleLinkedFinanceCategory) {
      setSelectedCategoryId(linkedFinanceCategoryIds[0] ?? '');
      return;
    }

    if (hasMixedLinkedFinanceCategories) {
      setSelectedCategoryId('');
    }
  }, [
    hasMixedLinkedFinanceCategories,
    hasSingleLinkedFinanceCategory,
    linkedFinanceCategoryIds,
  ]);

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
        customer_id: selectedUserId || null,
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

      const result = await createInvoiceWithInternalApi(wsId, requestPayload);

      // Show notification if values were recalculated
      if (result.data?.values_recalculated) {
        const { calculated_values, frontend_values } = result.data;

        toast(t('ws-invoices.invoice_created_recalculated'), {
          description: formatInvoiceRecalculationDescription({
            areNumbersHidden,
            calculatedTotal: calculated_values.total,
            currency: defaultCurrency,
            frontendTotal: frontend_values?.total || 0,
            roundingApplied: calculated_values.rounding_applied,
            t,
          }),
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

        router.push(
          `/${wsId}${financeHref(`/invoices/${result.invoice_id}`)}${query}`
        );
      } else {
        // Reset form after successful creation
        setSelectedProducts([]);
        setSelectedPromotionId('none');
        setInvoiceContent('');
        setInvoiceNotes('');
        resetRounding();
        setSelectedUserId(null);
        setSelectedWalletId(defaultWalletId || '');
        setSelectedCategoryId('');
        setCustomerSearch('');
      }
    } catch (error) {
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
          onSelect={setSelectedUserId}
          selectedUser={selectedUser}
          showUserPreview
          loading={
            usersLoading || (isFetchingCustomers && !isFetchingMoreCustomers)
          }
          isFetchingNextPage={isFetchingMoreCustomers}
          hasNextPage={hasMoreCustomers}
          onLoadMore={() => void fetchMoreCustomers()}
          errorMessage={
            usersError instanceof Error ? usersError.message : undefined
          }
          emptyMessage={t('ws-invoices.no_customers_found')}
          searchValue={customerSearch}
          onSearchChange={setCustomerSearch}
        >
          {/* Conditional User History Accordion */}
          {selectedUser && (
            <InvoiceUserHistoryAccordion
              wsId={wsId}
              userId={selectedUser.id}
              currency={defaultCurrency}
            />
          )}
        </InvoiceCustomerSelectCard>

        {!isBlocked && (
          <div className="space-y-3">
            <ProductSelection
              products={products}
              selectedProducts={selectedProducts}
              onSelectedProductsChange={setSelectedProducts}
              currency={defaultCurrency}
            />
            <InvoiceProductsPermissionWarning
              missingPermissions={invoiceProductMissingPermissions}
              user={permissionRequestUser}
            />
          </div>
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
                  walletDisabled={isWalletSelectionLocked}
                  walletPermissionWarning={walletPermissionWarning}
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
                {hasMixedLinkedFinanceCategories && (
                  <p className="text-muted-foreground text-sm">
                    This cart mixes products with different linked finance
                    categories. Choose one invoice category override before
                    checkout.
                  </p>
                )}

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
                          promotionsAllowed && selectedPromotion
                            ? discountAmount
                            : undefined
                        }
                        discountLabel={
                          promotionsAllowed && selectedPromotion
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
                        currency={defaultCurrency}
                      />

                      <Button
                        className="w-full"
                        onClick={handleCreateInvoice}
                        disabled={
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
