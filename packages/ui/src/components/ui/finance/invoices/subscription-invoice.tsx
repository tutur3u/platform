'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Calculator, Loader2, Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { shouldLockFinanceWalletSelectionOnCreate } from '@tuturuuu/utils/finance';
import { formatCurrency } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDebounce } from '../../../../hooks/use-debounce';
import { useFinanceHref } from '../finance-route-context';
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
  useInvoiceCustomerSearch,
  useMultiGroupProducts,
  useProducts,
  useSubscriptionInvoiceContext,
  useUserGroups,
  useUserLinkedPromotions,
  useUserReferralDiscounts,
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
  formatMonthValue,
  getAvailableMonths,
  getBillableAttendanceRecords,
  getBillableSessionsForGroups,
  getGroupsDateRange,
  getMonthStartDate,
  getSubscriptionAttendanceDisplayData,
} from './utils';

interface Props {
  wsId: string;
  prefillAmount?: number | null; // Total attendance days to prefill product quantities
  createMultipleInvoices: boolean;
  printAfterCreate?: boolean;
  downloadImageAfterCreate?: boolean;
  defaultWalletId?: string;
  defaultCategoryId?: string;
  defaultCurrency?: 'VND' | 'USD';
  canChangeFinanceWallets?: boolean;
  canSetFinanceWalletsOnCreate?: boolean;
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
  canChangeFinanceWallets = true,
  canSetFinanceWalletsOnCreate = true,
}: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const financeHref = useFinanceHref();

  // URL state using nuqs
  const [selectedUserId, setSelectedUserId] = useQueryState('user_id', {
    defaultValue: '',
    shallow: false,
  });
  const [selectedGroupIds, setSelectedGroupIds] = useQueryState(
    'group_ids',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
  );
  const [selectedMonth, setSelectedMonth] = useQueryState('month', {
    defaultValue: formatMonthValue(new Date()),
    shallow: true,
  });

  const [customerSearch, setCustomerSearch] = useState('');
  const [debouncedCustomerSearch] = useDebounce(customerSearch, 300);

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

  const selectedGroupIdsForCreate = useMemo(
    () => (selectedGroupIds.length > 0 ? selectedGroupIds : []),
    [selectedGroupIds]
  );

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
  const { data: products = [], isLoading: productsLoading } = useProducts(wsId);
  const { data: availablePromotions = [], isLoading: promotionsLoading } =
    useAvailablePromotions(wsId, selectedUserId);
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

  const isBlocked = useMemo(
    () => selectedGroupIds.some((groupId) => blockedGroupIds.includes(groupId)),
    [selectedGroupIds, blockedGroupIds]
  );

  // State management
  const [selectedWalletId, setSelectedWalletId] = useState<string>(
    defaultWalletId || ''
  );
  const isWalletSelectionLocked = shouldLockFinanceWalletSelectionOnCreate({
    defaultWalletId,
    canChangeFinanceWallets,
    canSetFinanceWalletsOnCreate,
  });

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

  // Track previous user ID to detect user changes (skip initial mount for reset)
  const prevUserIdRef = useRef<string | null>(null);

  // Product selection state
  const [subscriptionSelectedProducts, setSubscriptionSelectedProducts] =
    useState<SelectedProductItem[]>([]);

  // Subscription-specific queries
  const { data: userGroups = [], isLoading: userGroupsLoading } = useUserGroups(
    wsId,
    selectedUserId
  );
  const { data: groupProducts = [], isLoading: groupProductsLoading } =
    useMultiGroupProducts(wsId, selectedGroupIds);

  const { data: useAttendanceBased = true } = useInvoiceAttendanceConfig(wsId);

  const availableMonthOptions = useMemo(
    () =>
      getAvailableMonths(
        userGroups,
        selectedGroupIds,
        [],
        locale,
        selectedMonth
      ),
    [locale, selectedGroupIds, selectedMonth, userGroups]
  );

  const effectiveSelectedMonth = useMemo(() => {
    if (availableMonthOptions.length > 0) {
      return availableMonthOptions.some(
        (month) => month.value === selectedMonth
      )
        ? selectedMonth
        : availableMonthOptions[0]!.value;
    }

    const { earliestStart, latestEnd } = getGroupsDateRange(
      userGroups,
      selectedGroupIds
    );

    if (!selectedGroupIds.length || !earliestStart) {
      return selectedMonth;
    }

    const now = new Date();
    let defaultMonth: Date;

    if (!latestEnd || (now >= earliestStart && now <= latestEnd)) {
      defaultMonth = now;
    } else if (now > latestEnd) {
      defaultMonth = latestEnd;
    } else {
      defaultMonth = earliestStart;
    }

    return formatMonthValue(defaultMonth);
  }, [availableMonthOptions, selectedGroupIds, selectedMonth, userGroups]);

  const {
    data: subscriptionInvoiceContext,
    isLoading: subscriptionInvoiceContextLoading,
    error: subscriptionInvoiceContextError,
  } = useSubscriptionInvoiceContext(
    wsId,
    selectedUserId,
    selectedGroupIds,
    effectiveSelectedMonth
  );

  const userAttendance = subscriptionInvoiceContext?.attendance ?? [];
  const latestSubscriptionInvoices =
    subscriptionInvoiceContext?.latestInvoices ?? [];
  const userAttendanceError =
    subscriptionInvoiceContextError instanceof Error
      ? subscriptionInvoiceContextError
      : null;

  const isSelectedMonthPaid = useMemo(() => {
    if (selectedGroupIds.length === 0 || !effectiveSelectedMonth) return false;

    const selectedMonthStart = getMonthStartDate(effectiveSelectedMonth);

    // A month is considered paid ONLY if ALL selected groups have paid for it.
    // If ANY selected group has not paid, we allow creating an invoice.
    return selectedGroupIds.every((groupId) => {
      const latestInvoice = latestSubscriptionInvoices.find(
        (inv) => inv.group_id === groupId
      );
      if (!latestInvoice?.valid_until) return false;

      const validUntilMonthStart = getMonthStartDate(latestInvoice.valid_until);
      return selectedMonthStart < validUntilMonthStart;
    });
  }, [effectiveSelectedMonth, latestSubscriptionInvoices, selectedGroupIds]);

  const billableAttendance = useMemo(
    () =>
      getBillableAttendanceRecords(
        userAttendance,
        selectedGroupIds,
        effectiveSelectedMonth,
        latestSubscriptionInvoices
      ),
    [
      effectiveSelectedMonth,
      latestSubscriptionInvoices,
      selectedGroupIds,
      userAttendance,
    ]
  );

  const billableSessions = useMemo(
    () =>
      getBillableSessionsForGroups(
        userGroups,
        selectedGroupIds,
        effectiveSelectedMonth,
        latestSubscriptionInvoices
      ),
    [
      effectiveSelectedMonth,
      latestSubscriptionInvoices,
      selectedGroupIds,
      userGroups,
    ]
  );

  const monthlyAttendance = useMemo(
    () =>
      getBillableAttendanceRecords(
        userAttendance,
        selectedGroupIds,
        effectiveSelectedMonth
      ),
    [effectiveSelectedMonth, selectedGroupIds, userAttendance]
  );

  const monthlySessions = useMemo(
    () =>
      getBillableSessionsForGroups(
        userGroups,
        selectedGroupIds,
        effectiveSelectedMonth
      ),
    [effectiveSelectedMonth, selectedGroupIds, userGroups]
  );

  const {
    displayAttendance,
    displaySessions,
    attendanceStats,
    totalSessions,
    attendanceRate,
  } = useMemo(
    () =>
      getSubscriptionAttendanceDisplayData({
        isSelectedMonthPaid,
        billableAttendance,
        billableSessions,
        monthlyAttendance,
        monthlySessions,
      }),
    [
      billableAttendance,
      billableSessions,
      isSelectedMonthPaid,
      monthlyAttendance,
      monthlySessions,
    ]
  );

  const selectedPromotion =
    selectedPromotionId === 'none'
      ? null
      : availablePromotions.find(
          (promotion: AvailablePromotion) =>
            promotion.id === selectedPromotionId
        );

  const isLoadingSubscriptionData =
    userGroupsLoading ||
    subscriptionInvoiceContextLoading ||
    groupProductsLoading;

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
    selectedMonth: effectiveSelectedMonth,
    prefillAmount,
    groupProducts,
    products,
    userGroups,
    useAttendanceBased,
    userAttendance: billableAttendance,
    latestSubscriptionInvoices,
    onSelectedProductsChange: setSubscriptionSelectedProducts,
  });

  useSubscriptionInvoiceContent({
    enabled: true,
    selectedGroupIds,
    selectedMonth: effectiveSelectedMonth,
    userGroups,
    groupProducts,
    subscriptionSelectedProducts,
    userAttendance: billableAttendance,
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

  const groupsWithScheduleIds = useMemo(() => {
    const sessions = (g: (typeof userGroups)[0]) =>
      g.workspace_user_groups?.sessions;
    return userGroups
      .filter(
        (g) =>
          g.workspace_user_groups?.id &&
          Array.isArray(sessions(g)) &&
          (sessions(g)?.length ?? 0) > 0
      )
      .map((g) => g.workspace_user_groups!.id);
  }, [userGroups]);

  // Auto-select all groups with schedule when userGroups are loaded
  useEffect(() => {
    if (
      groupsWithScheduleIds.length > 0 &&
      selectedGroupIds.length === 0 &&
      !userGroupsLoading &&
      selectedUserId
    ) {
      setSelectedGroupIds(groupsWithScheduleIds);
    }
  }, [
    groupsWithScheduleIds,
    selectedGroupIds.length,
    userGroupsLoading,
    selectedUserId,
    setSelectedGroupIds,
  ]);

  const availableMonths = useMemo(
    () =>
      getAvailableMonths(
        userGroups,
        selectedGroupIds,
        latestSubscriptionInvoices,
        locale,
        effectiveSelectedMonth
      ),
    [
      effectiveSelectedMonth,
      userGroups,
      selectedGroupIds,
      latestSubscriptionInvoices,
      locale,
    ]
  );

  // Validate and reset selectedMonth when groups change (not when selectedMonth changes, to avoid update loops)
  const monthValidationKey = `${selectedGroupIds.join(',')}-${userGroups.length}`;
  const lastValidatedKeyRef = useRef<string | null>(null);
  const lastMonthSyncRef = useRef<string | null>(null);

  useEffect(() => {
    if (selectedGroupIds.length === 0 || !userGroups.length) return;

    // Sync when selectedMonth is not in availableMonths (prevents Radix Select infinite loop)
    const isValidInList =
      availableMonths.length > 0 &&
      availableMonths.some((m) => m.value === selectedMonth);
    if (availableMonths.length > 0 && !isValidInList) {
      const syncKey = `${monthValidationKey}-${selectedMonth}`;
      if (lastMonthSyncRef.current === syncKey) return;
      lastMonthSyncRef.current = syncKey;

      const fallback = availableMonths[0]?.value;
      if (!fallback) return;
      if (fallback && fallback !== selectedMonth) {
        startTransition(() => updateSearchParam('month', fallback));
      }
      return;
    }
    lastMonthSyncRef.current = null;

    const { earliestStart, latestEnd } = getGroupsDateRange(
      userGroups,
      selectedGroupIds
    );

    if (!earliestStart || !latestEnd) return;

    const currentMonth = getMonthStartDate(selectedMonth);
    if (Number.isNaN(currentMonth.getTime())) return;

    const earliestMonthStart = getMonthStartDate(earliestStart);
    const latestMonthStart = getMonthStartDate(latestEnd);

    if (currentMonth < earliestMonthStart || currentMonth > latestMonthStart) {
      // Only correct once per groups-selection to avoid update loops
      if (lastValidatedKeyRef.current === monthValidationKey) return;
      lastValidatedKeyRef.current = monthValidationKey;

      const now = new Date();
      let defaultMonth: Date;

      if (now >= earliestStart && now <= latestEnd) defaultMonth = now;
      else if (now > latestEnd) defaultMonth = latestEnd;
      else defaultMonth = earliestStart;

      const nextMonth = formatMonthValue(defaultMonth);
      if (nextMonth !== selectedMonth) {
        startTransition(() => updateSearchParam('month', nextMonth));
      }
    } else {
      lastValidatedKeyRef.current = null;
    }
  }, [
    availableMonths,
    monthValidationKey,
    selectedGroupIds,
    userGroups.length,
    selectedMonth,
    updateSearchParam,
    userGroups,
  ]);

  const navigateMonth = (direction: 'prev' | 'next') => {
    const currentIndex = availableMonths.findIndex(
      (month) => month.value === effectiveSelectedMonth
    );
    if (currentIndex === -1) return;

    const targetIndex =
      direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    const targetMonth = availableMonths[targetIndex]?.value;
    if (targetMonth && targetMonth !== selectedMonth) {
      updateSearchParam('month', targetMonth);
    }
  };

  const canNavigateMonth = (direction: 'prev' | 'next') => {
    const currentIndex = availableMonths.findIndex(
      (month) => month.value === effectiveSelectedMonth
    );

    if (currentIndex === -1) return false;

    return direction === 'prev'
      ? currentIndex > 0
      : currentIndex < availableMonths.length - 1;
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
        selected_month: effectiveSelectedMonth,
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
            ? ` | ${t('ws-invoices.rounding')}: ${formatCurrency(calculated_values.rounding_applied, defaultCurrency)}`
            : '';
        toast(t('ws-invoices.subscription_invoice_created_recalculated'), {
          description: `${t('ws-invoices.server_calculated')}: ${formatCurrency(calculated_values.total, defaultCurrency)} | ${t('ws-invoices.frontend_calculated')}: ${formatCurrency(frontend_values?.total || 0, defaultCurrency)}${roundingInfo}`,
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
          `/${wsId}${financeHref(`/invoices/${result.invoice_id}`)}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
        );
      } else {
        setSubscriptionSelectedProducts([]);
        setSelectedPromotionId('none');
        setInvoiceContent('');
        setInvoiceNotes('');
        resetRoundingSubscription();
        updateSearchParam('user_id', '');
        setSelectedWalletId(defaultWalletId || '');
        setSelectedCategoryId(defaultCategoryId || '');
        setSelectedGroupIds(null);
        setCustomerSearch('');
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
        />

        {selectedUserId && (
          <SubscriptionGroupSelector
            userGroups={userGroups}
            userGroupsLoading={userGroupsLoading}
            selectedGroupIds={selectedGroupIds}
            onGroupSelect={(groupId) => {
              setSelectedGroupIds((prev) => {
                const isAlreadySelected = prev.includes(groupId);
                const updated = isAlreadySelected
                  ? prev.filter((id) => id !== groupId)
                  : [...prev, groupId];
                return updated;
              });
            }}
            onSelectAllWithSchedule={() =>
              setSelectedGroupIds(groupsWithScheduleIds)
            }
            onDeselectAll={() => setSelectedGroupIds([])}
            isLoadingSubscriptionData={isLoadingSubscriptionData}
            locale={locale}
            selectedMonth={effectiveSelectedMonth}
            latestSubscriptionInvoices={latestSubscriptionInvoices}
          />
        )}

        {selectedGroupIds.length > 0 && !isSelectedMonthPaid && !isBlocked && (
          <ProductSelection
            products={products}
            selectedProducts={subscriptionSelectedProducts}
            onSelectedProductsChange={setSubscriptionSelectedProducts}
            currency={defaultCurrency}
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

        <InvoiceContentEditor
          type="subscription"
          contentValue={invoiceContent}
          notesValue={invoiceNotes}
          onContentChange={setInvoiceContent}
          onNotesChange={setInvoiceNotes}
        />
      </div>

      <div className="space-y-6">
        {isBlocked ? (
          <InvoiceBlockedState type="subscription" />
        ) : (
          <>
            {selectedGroupIds.length > 0 && effectiveSelectedMonth && (
              <SubscriptionAttendanceSummary
                selectedGroupIds={selectedGroupIds}
                selectedMonth={effectiveSelectedMonth}
                isSelectedMonthPaid={isSelectedMonthPaid}
                locale={locale}
                navigateMonth={navigateMonth}
                canNavigateMonth={canNavigateMonth}
                onMonthChange={(value) => updateSearchParam('month', value)}
                availableMonths={availableMonths}
                latestSubscriptionInvoices={latestSubscriptionInvoices}
                isLoadingSubscriptionData={isLoadingSubscriptionData}
                userAttendance={displayAttendance}
                displaySessions={displaySessions}
                userAttendanceError={userAttendanceError}
                attendanceStats={attendanceStats}
                totalSessions={totalSessions}
                attendanceRate={attendanceRate}
              />
            )}

            {subscriptionSelectedProducts.length > 0 &&
              !isSelectedMonthPaid && (
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
                      walletDisabled={isWalletSelectionLocked}
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
                        currency={defaultCurrency}
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
              )}
          </>
        )}
      </div>
    </div>
  );
}
