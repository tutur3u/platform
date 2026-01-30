'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Calculator, Loader2, Plus } from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InvoiceBlockedState } from './components/invoice-blocked-state';
import { InvoiceCheckoutSummary } from './components/invoice-checkout-summary';
import { InvoiceContentEditor } from './components/invoice-content-editor';
import { InvoiceCustomerSelectCard } from './components/invoice-customer-select-card';
import { InvoicePaymentSettings } from './components/invoice-payment-settings';
import { SubscriptionAttendanceSummary } from './components/subscription-attendance-summary';
import { SubscriptionGroupSelector } from './components/subscription-group-selector';
import { CreatePromotionDialog } from './create-promotion-dialog';
import type { AvailablePromotion } from './hooks';
import {
  useAvailablePromotions,
  useCategories,
  useInvoiceAttendanceConfig,
  useInvoiceBlockedGroups,
  useMultiGroupLatestSubscriptionInvoice,
  useMultiGroupProducts,
  useMultiGroupUserAttendance,
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
import { useSubscriptionAutoSelection } from './hooks/use-subscription-auto-selection';
import { useSubscriptionInvoiceContent } from './hooks/use-subscription-invoice-content';
import { ProductSelection } from './product-selection';
import type { SelectedProductItem } from './types';
import {
  getAttendanceStats,
  getEffectiveAttendanceDays,
  getTotalSessionsForGroups,
} from './utils';

interface Props {
  wsId: string;
  prefillAmount?: number; // Total attendance days to prefill product quantities
  createMultipleInvoices: boolean;
  printAfterCreate?: boolean;
  downloadImageAfterCreate?: boolean;
  defaultWalletId?: string;
  defaultCategoryId?: string;
  defaultCurrency?: 'VND' | 'USD';
}

export function SubscriptionInvoice({
  wsId,
  prefillAmount,
  createMultipleInvoices,
  printAfterCreate = false,
  downloadImageAfterCreate = false,
  defaultWalletId,
  defaultCategoryId,
  defaultCurrency = 'USD',
}: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Compute locale based on currency
  const currencyLocale = defaultCurrency === 'VND' ? 'vi-VN' : 'en-US';

  // URL state using nuqs
  const [selectedUserId, setSelectedUserId] = useQueryState('user_id', {
    defaultValue: '',
    shallow: false,
  });
  const [selectedGroupIds, setSelectedGroupIds] = useQueryState(
    'group_ids',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: false,
    })
  );
  const [selectedMonth, setSelectedMonth] = useQueryState('month', {
    defaultValue: new Date().toISOString().slice(0, 7),
    shallow: false,
  });

  const [activeGroupId, setActiveGroupId] = useState<string>('');

  const updateSearchParam = useCallback(
    (key: string, value: string) => {
      if (key === 'user_id') {
        setSelectedUserId(value || null);
      } else if (key === 'month') {
        setSelectedMonth(value || null);
      }
    },
    [setSelectedUserId, setSelectedMonth]
  );

  useEffect(() => {
    if (selectedGroupIds.length === 0) return;
    if (activeGroupId && selectedGroupIds.includes(activeGroupId)) return;
    setActiveGroupId(selectedGroupIds[0] || '');
  }, [selectedGroupIds, activeGroupId]);

  const selectedGroupIdsForCreate = useMemo(() => {
    if (selectedGroupIds.length > 0) return selectedGroupIds;
    return activeGroupId ? [activeGroupId] : [];
  }, [selectedGroupIds, activeGroupId]);

  // Data queries
  const {
    data: users = [],
    isLoading: usersLoading,
    error: usersError,
  } = useUsersWithSelectableGroups(wsId);
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

  // Blocked groups check
  const { data: blockedGroupIds = [] } = useInvoiceBlockedGroups(wsId);

  const isBlocked = useMemo(() => {
    if (selectedGroupIds.length > 0) {
      return selectedGroupIds.some((groupId) =>
        blockedGroupIds.includes(groupId)
      );
    }
    return !!activeGroupId && blockedGroupIds.includes(activeGroupId);
  }, [selectedGroupIds, activeGroupId, blockedGroupIds]);

  // State management
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
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    defaultCategoryId || ''
  );

  useEffect(() => {
    if (defaultCategoryId) {
      setSelectedCategoryId(defaultCategoryId);
    }
  }, [defaultCategoryId]);

  const [invoiceContent, setInvoiceContent] = useState<string>('');
  const [invoiceNotes, setInvoiceNotes] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [createPromotionOpen, setCreatePromotionOpen] = useState(false);

  // Track previous user ID to detect user changes
  const prevUserIdRef = useRef<string>(selectedUserId);

  // Product selection state
  const [subscriptionSelectedProducts, setSubscriptionSelectedProducts] =
    useState<SelectedProductItem[]>([]);

  // Subscription-specific queries
  const { data: userGroups = [], isLoading: userGroupsLoading } =
    useUserGroups(selectedUserId);
  const {
    data: userAttendance = [],
    isLoading: userAttendanceLoading,
    error: userAttendanceError,
  } = useMultiGroupUserAttendance(
    selectedGroupIds,
    selectedUserId,
    selectedMonth
  );
  const { data: groupProducts = [], isLoading: groupProductsLoading } =
    useMultiGroupProducts(selectedGroupIds);

  const { data: useAttendanceBased = true } = useInvoiceAttendanceConfig(wsId);

  const { data: latestSubscriptionInvoices = [] } =
    useMultiGroupLatestSubscriptionInvoice(selectedUserId, selectedGroupIds);

  const isSelectedMonthPaid = useMemo(() => {
    if (selectedGroupIds.length === 0 || !selectedMonth) return false;

    const selectedMonthStart = new Date(`${selectedMonth}-01`);

    // A month is considered paid ONLY if ALL selected groups have paid for it.
    // If ANY selected group has not paid, we allow creating an invoice.
    return selectedGroupIds.every((groupId) => {
      const latestInvoice = latestSubscriptionInvoices.find(
        (inv) => inv.group_id === groupId
      );
      if (!latestInvoice || !latestInvoice.valid_until) return false;

      const validUntilMonthStart = new Date(latestInvoice.valid_until);
      validUntilMonthStart.setDate(1);
      return selectedMonthStart < validUntilMonthStart;
    });
  }, [latestSubscriptionInvoices, selectedMonth, selectedGroupIds]);

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

  const isLoadingSubscriptionData =
    userGroupsLoading || userAttendanceLoading || groupProductsLoading;

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

  // Use hooks for logic
  useSubscriptionAutoSelection({
    enabled: true,
    selectedGroupIds,
    selectedMonth,
    prefillAmount,
    groupProducts,
    products,
    userGroups,
    useAttendanceBased,
    userAttendance,
    latestSubscriptionInvoices,
    onSelectedProductsChange: setSubscriptionSelectedProducts,
  });

  useSubscriptionInvoiceContent({
    enabled: true,
    selectedGroupIds,
    selectedMonth,
    userGroups,
    groupProducts,
    subscriptionSelectedProducts,
    userAttendance,
    latestSubscriptionInvoices,
    isSelectedMonthPaid,
    locale,
    onContentChange: setInvoiceContent,
    onNotesChange: setInvoiceNotes,
  });

  const subtotal = useInvoiceSubtotal(subscriptionSelectedProducts);

  useBestPromotionSelection({
    enabled: true,
    selectedUserId,
    linkedPromotions,
    selectedPromotionId,
    subtotal,
    referralDiscountMap,
    onSelectPromotion: setSelectedPromotionId,
  });

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
  const {
    roundedTotal: subscriptionRoundedTotal,
    roundUp: roundUpSubscription,
    roundDown: roundDownSubscription,
    resetRounding: resetRoundingSubscription,
  } = useInvoiceRounding(totalBeforeRounding);

  // Reset subscription state when user changes (including switching to a different user)
  useEffect(() => {
    const userChanged = prevUserIdRef.current !== selectedUserId;
    prevUserIdRef.current = selectedUserId;

    if (!selectedUserId || userChanged) {
      setSubscriptionSelectedProducts([]);
      setInvoiceContent('');
      setInvoiceNotes('');
      setSelectedWalletId(defaultWalletId || '');
      setSelectedPromotionId('none');
      setSelectedCategoryId(defaultCategoryId || '');
      setSelectedGroupIds(null);
      setSelectedMonth(null);
    }
  }, [
    selectedUserId,
    setSelectedGroupIds,
    setSelectedMonth,
    defaultWalletId,
    defaultCategoryId,
  ]);

  // Auto-select the first group when userGroups are loaded
  useEffect(() => {
    if (
      userGroups.length > 0 &&
      selectedGroupIds.length === 0 &&
      !userGroupsLoading &&
      selectedUserId
    ) {
      const firstGroup = userGroups[0];
      if (firstGroup?.workspace_user_groups?.id) {
        setSelectedGroupIds([firstGroup.workspace_user_groups.id]);
        setActiveGroupId(firstGroup.workspace_user_groups.id);
      }
    }
  }, [
    userGroups,
    selectedGroupIds.length,
    userGroupsLoading,
    selectedUserId,
    setSelectedGroupIds,
  ]);

  const getGroupsDateRange = useCallback(
    (groups: typeof userGroups, groupIds: string[]) => {
      if (groupIds.length === 0)
        return { earliestStart: null, latestEnd: null };
      const selectedGroupsData = groups.filter((g) =>
        groupIds.includes(g.workspace_user_groups?.id || '')
      );
      if (selectedGroupsData.length === 0)
        return { earliestStart: null, latestEnd: null };

      let earliestStart: Date | null = null;
      let latestEnd: Date | null = null;

      for (const selectedGroupItem of selectedGroupsData) {
        const group = selectedGroupItem.workspace_user_groups;
        if (!group) continue;

        const startDate = group.starting_date
          ? new Date(group.starting_date)
          : null;
        const endDate = group.ending_date ? new Date(group.ending_date) : null;

        if (startDate && (!earliestStart || startDate < earliestStart))
          earliestStart = startDate;
        if (endDate && (!latestEnd || endDate > latestEnd)) latestEnd = endDate;
      }

      return { earliestStart, latestEnd };
    },
    []
  );

  // Validate and reset selectedMonth when groups change
  useEffect(() => {
    if (selectedGroupIds.length === 0 || !userGroups.length) return;

    const { earliestStart, latestEnd } = getGroupsDateRange(
      userGroups,
      selectedGroupIds
    );

    if (!earliestStart || !latestEnd) return;

    const currentMonth = new Date(`${selectedMonth}-01`);
    const earliestMonthStart = new Date(earliestStart);
    earliestMonthStart.setDate(1);
    const latestMonthStart = new Date(latestEnd);
    latestMonthStart.setDate(1);

    if (currentMonth < earliestMonthStart || currentMonth > latestMonthStart) {
      const now = new Date();
      let defaultMonth: Date;

      if (now >= earliestStart && now <= latestEnd) defaultMonth = now;
      else if (now > latestEnd) defaultMonth = latestEnd;
      else defaultMonth = earliestStart;

      const nextMonth = defaultMonth.toISOString().slice(0, 7);
      if (nextMonth !== selectedMonth) {
        updateSearchParam('month', nextMonth);
      }
    }
  }, [
    selectedGroupIds,
    userGroups.length,
    selectedMonth,
    updateSearchParam,
    userGroups,
    getGroupsDateRange,
  ]);

  const navigateMonth = (direction: 'prev' | 'next') => {
    if (selectedGroupIds.length === 0) return;
    const { earliestStart, latestEnd } = getGroupsDateRange(
      userGroups,
      selectedGroupIds
    );

    if (!earliestStart || !latestEnd) return;
    const currentMonth = new Date(`${selectedMonth}-01`);
    const newMonth = new Date(currentMonth);
    if (direction === 'prev') newMonth.setMonth(newMonth.getMonth() - 1);
    else newMonth.setMonth(newMonth.getMonth() + 1);

    if (newMonth >= earliestStart && newMonth <= latestEnd) {
      updateSearchParam('month', newMonth.toISOString().slice(0, 7));
    }
  };

  const canNavigateMonth = (direction: 'prev' | 'next') => {
    if (selectedGroupIds.length === 0) return false;
    const { earliestStart, latestEnd } = getGroupsDateRange(
      userGroups,
      selectedGroupIds
    );

    if (!earliestStart || !latestEnd) return false;
    const currentMonth = new Date(`${selectedMonth}-01`);
    const targetMonth = new Date(currentMonth);
    if (direction === 'prev') targetMonth.setMonth(targetMonth.getMonth() - 1);
    else targetMonth.setMonth(targetMonth.getMonth() + 1);

    return targetMonth >= earliestStart && targetMonth <= latestEnd;
  };

  const handleCreateSubscriptionInvoice = async () => {
    if (
      !selectedUser ||
      selectedGroupIdsForCreate.length === 0 ||
      subscriptionSelectedProducts.length === 0 ||
      !selectedWalletId ||
      !selectedCategoryId
    ) {
      toast(t('ws-invoices.create_subscription_invoice_validation'));
      return;
    }

    const productsPayload = subscriptionSelectedProducts
      .filter((item) => item.quantity > 0)
      .map((item) => ({
        product_id: item.product.id,
        unit_id: item.inventory.unit_id,
        warehouse_id: item.inventory.warehouse_id,
        quantity: item.quantity,
        price: item.inventory.price,
        category_id: item.product.category_id,
      }));

    if (productsPayload.length === 0) {
      toast(t('ws-invoices.no_products_to_invoice'));
      return;
    }

    setIsCreating(true);
    try {
      const requestPayload = {
        customer_id: selectedUserId,
        group_ids: selectedGroupIdsForCreate,
        selected_month: selectedMonth,
        content: invoiceContent,
        notes: invoiceNotes,
        wallet_id: selectedWalletId,
        promotion_id:
          selectedPromotionId !== 'none' ? selectedPromotionId : undefined,
        products: productsPayload,
        category_id: selectedCategoryId,
        frontend_subtotal: subtotal,
        frontend_discount_amount: discountAmount,
        frontend_total: subscriptionRoundedTotal,
      };

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/finance/invoices/subscription`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestPayload),
        }
      );

      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message || 'Failed to create subscription invoice'
        );

      if (result.data?.values_recalculated) {
        const { calculated_values, frontend_values } = result.data;
        const roundingInfo =
          calculated_values.rounding_applied !== 0
            ? ` | ${t('ws-invoices.rounding')}: ${Intl.NumberFormat(currencyLocale, { style: 'currency', currency: defaultCurrency }).format(calculated_values.rounding_applied)}`
            : '';
        toast(t('ws-invoices.subscription_invoice_created_recalculated'), {
          description: `${t('ws-invoices.server_calculated')}: ${Intl.NumberFormat(currencyLocale, { style: 'currency', currency: defaultCurrency }).format(calculated_values.total)} | ${t('ws-invoices.frontend_calculated')}: ${Intl.NumberFormat(currencyLocale, { style: 'currency', currency: defaultCurrency }).format(frontend_values?.total || 0)}${roundingInfo}`,
          duration: 5000,
        });
      } else {
        toast(
          t('ws-invoices.subscription_invoice_created_success', {
            invoiceId: result.invoice_id,
          })
        );
      }

      if (!createMultipleInvoices) {
        const queryParams = new URLSearchParams();
        if (printAfterCreate) queryParams.set('print', 'true');
        if (downloadImageAfterCreate) queryParams.set('image', 'true');
        router.push(
          `/${wsId}/finance/invoices/${result.invoice_id}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
        );
      } else {
        setSubscriptionSelectedProducts([]);
        setSelectedPromotionId('none');
        setInvoiceContent('');
        setInvoiceNotes('');
        resetRoundingSubscription();
        updateSearchParam('user_id', '');
        setSelectedWalletId('');
        setSelectedCategoryId('');
        setSelectedGroupIds(null);
      }
    } catch (error) {
      console.error('Error creating subscription invoice:', error);
      toast(
        t('ws-invoices.error_creating_subscription_invoice', {
          error:
            error instanceof Error
              ? error.message
              : t('ws-invoices.failed_to_create_subscription_invoice'),
        })
      );
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
      <div className="space-y-6">
        <InvoiceCustomerSelectCard
          title={t('invoice-data-table.customer')}
          description={t(
            'ws-invoices.subscription_customer_selection_description'
          )}
          customers={users}
          selectedUserId={selectedUserId}
          onSelect={(value) => updateSearchParam('user_id', value)}
          selectedUser={selectedUser}
          showUserPreview
          loading={usersLoading}
          errorMessage={usersError?.message}
          emptyMessage={t('ws-invoices.no_customers_found')}
        />

        {selectedUserId && (
          <SubscriptionGroupSelector
            userGroups={userGroups}
            userGroupsLoading={userGroupsLoading}
            selectedGroupIds={selectedGroupIds}
            activeGroupId={activeGroupId}
            onGroupSelect={(groupId) => {
              setSelectedGroupIds((prev) => {
                const isAlreadySelected = prev.includes(groupId);
                const updated = isAlreadySelected
                  ? prev.filter((id) => id !== groupId)
                  : [...prev, groupId];
                if (updated.length > 0) {
                  if (!isAlreadySelected) setActiveGroupId(groupId);
                  else if (activeGroupId === groupId && updated.length > 0)
                    setActiveGroupId(updated[0] || '');
                }
                return updated;
              });
            }}
            isLoadingSubscriptionData={isLoadingSubscriptionData}
            locale={locale}
          />
        )}

        {selectedGroupIds.length > 0 && !isSelectedMonthPaid && !isBlocked && (
          <ProductSelection
            products={products}
            selectedProducts={subscriptionSelectedProducts}
            onSelectedProductsChange={setSubscriptionSelectedProducts}
            groupLinkedProducts={(groupProducts || [])
              .map((item) => ({
                productId: item.workspace_products?.id,
                groupName:
                  item.workspace_user_groups?.name || t('ws-invoices.no_name'),
              }))
              .filter(
                (item): item is { productId: string; groupName: string } =>
                  !!item.productId
              )}
          />
        )}
      </div>

      <div className="space-y-6">
        {isBlocked ? (
          <InvoiceBlockedState type="subscription" />
        ) : (
          <>
            {selectedGroupIds.length > 0 && selectedMonth && (
              <SubscriptionAttendanceSummary
                selectedGroupIds={selectedGroupIds}
                selectedMonth={selectedMonth}
                isSelectedMonthPaid={isSelectedMonthPaid}
                locale={locale}
                navigateMonth={navigateMonth}
                canNavigateMonth={canNavigateMonth}
                onMonthChange={(value) => updateSearchParam('month', value)}
                userGroups={userGroups}
                latestSubscriptionInvoices={latestSubscriptionInvoices}
                isLoadingSubscriptionData={isLoadingSubscriptionData}
                userAttendance={userAttendance}
                userAttendanceError={userAttendanceError}
                attendanceStats={getAttendanceStats(userAttendance)}
                totalSessions={getTotalSessionsForGroups(
                  userGroups,
                  selectedGroupIds,
                  selectedMonth,
                  latestSubscriptionInvoices
                )}
                attendanceRate={(() => {
                  const attendanceDays =
                    getEffectiveAttendanceDays(userAttendance);
                  const totalSessions = getTotalSessionsForGroups(
                    userGroups,
                    selectedGroupIds,
                    selectedMonth,
                    latestSubscriptionInvoices
                  );
                  return totalSessions > 0
                    ? (attendanceDays / totalSessions) * 100
                    : 0;
                })()}
              />
            )}

            {subscriptionSelectedProducts.length > 0 &&
              !isSelectedMonthPaid && (
                <>
                  <InvoiceContentEditor
                    type="subscription"
                    contentValue={invoiceContent}
                    notesValue={invoiceNotes}
                    onContentChange={setInvoiceContent}
                    onNotesChange={setInvoiceNotes}
                  />

                  <Card>
                    <CardHeader>
                      <CardTitle>
                        {t('ws-invoices.payment_and_checkout')}
                      </CardTitle>
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
                        promotionsAllowed={true}
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
                              if (promotion.id)
                                setSelectedPromotionId(promotion.id);
                            }}
                          />
                        }
                        promotionActionsList={
                          selectedUserId
                            ? [
                                {
                                  key: 'create-promotion',
                                  label: t('ws-invoices.create_promotion'),
                                  icon: (
                                    <Plus className="h-4 w-4 text-primary" />
                                  ),
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

                      <Separator />

                      <div className="space-y-4">
                        <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                          <Calculator className="h-4 w-4" />
                          {t('ws-invoices.checkout')}
                        </div>

                        <InvoiceCheckoutSummary
                          subtotal={subtotal}
                          totalBeforeRounding={totalBeforeRounding}
                          roundedTotal={subscriptionRoundedTotal}
                          discountAmount={
                            selectedPromotion ? discountAmount : undefined
                          }
                          discountLabel={
                            selectedPromotion
                              ? selectedPromotion.name ||
                                t('ws-invoices.unnamed_promotion')
                              : null
                          }
                          onRoundUp={roundUpSubscription}
                          onRoundDown={roundDownSubscription}
                          onResetRounding={resetRoundingSubscription}
                          showRoundingControls={
                            totalBeforeRounding > 0 &&
                            totalBeforeRounding % 1000 !== 0
                          }
                          roundingDisabled={
                            Math.abs(
                              subscriptionRoundedTotal - totalBeforeRounding
                            ) < 0.01
                          }
                        />

                        <Button
                          className="w-full"
                          onClick={handleCreateSubscriptionInvoice}
                          disabled={
                            !selectedUser ||
                            selectedGroupIds.length === 0 ||
                            subscriptionSelectedProducts.length === 0 ||
                            !selectedWalletId ||
                            !selectedCategoryId ||
                            isCreating ||
                            isSelectedMonthPaid
                          }
                        >
                          {isCreating ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {t('ws-invoices.creating_subscription_invoice')}
                            </>
                          ) : (
                            t('ws-invoices.create_subscription_invoice')
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
          </>
        )}
      </div>
    </div>
  );
}
