'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  CreditCard,
  FileText,
  ArrowUp,
  ArrowDown,
  Calculator,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from '@tuturuuu/ui/icons';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { Separator } from '@tuturuuu/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Combobox, type ComboboxOptions } from '@tuturuuu/ui/custom/combobox';
import { useTranslations, useLocale } from 'next-intl';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ProductSelection } from './product-selection';
import { toast } from '@tuturuuu/ui/sonner';
import { Button } from '@tuturuuu/ui/button';
import type { SelectedProductItem, Promotion } from './types';
import {
  useUsers,
  useProducts,
  usePromotions,
  useWallets,
  useCategories,
  useUserGroups,
  useUserAttendance,
  useUserGroupProducts,
  useUserLatestSubscriptionInvoice,
  useUserLinkedPromotions,
} from './hooks';
import { AttendanceCalendar } from '@tuturuuu/ui/finance/invoices/attendance-calendar';

interface Props {
  wsId: string;
  selectedUserId: string;
  onSelectedUserIdChange: (value: string) => void;
  createMultipleInvoices: boolean;
}

export function SubscriptionInvoice({
  wsId,
  selectedUserId,
  onSelectedUserIdChange,
  createMultipleInvoices,
}: Props) {
  const t = useTranslations();
  const locale = useLocale();

  // Data queries
  const { data: users = [], isLoading: usersLoading } = useUsers(wsId);
  const { data: products = [], isLoading: productsLoading } = useProducts(wsId);
  const { data: promotions = [], isLoading: promotionsLoading } =
    usePromotions(wsId);
  const { data: linkedPromotions = [] } =
    useUserLinkedPromotions(selectedUserId);
  const { data: wallets = [], isLoading: walletsLoading } = useWallets(wsId);
  const { data: categories = [], isLoading: categoriesLoading } =
    useCategories(wsId);

  // State management
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const [selectedPromotionId, setSelectedPromotionId] =
    useState<string>('none');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [invoiceContent, setInvoiceContent] = useState<string>('');
  const [invoiceNotes, setInvoiceNotes] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  // Subscription-specific state
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>(
    new Date()
      .toISOString()
      .slice(0, 7) // Current month in YYYY-MM format
  );
  const [subscriptionProducts, setSubscriptionProducts] = useState<
    Array<{
      product: {
        id: string;
        name: string | null;
        product_categories: {
          name: string | null;
        };
      };
      attendanceDays: number;
      totalSessions: number;
      pricePerSession: number;
    }>
  >([]);

  // Product selection state (new functionality)
  const [subscriptionSelectedProducts, setSubscriptionSelectedProducts] =
    useState<SelectedProductItem[]>([]);

  // Subscription-specific queries
  const { data: userGroups = [], isLoading: userGroupsLoading } =
    useUserGroups(selectedUserId);
  const {
    data: userAttendance = [],
    isLoading: userAttendanceLoading,
    error: userAttendanceError,
  } = useUserAttendance(selectedGroupId, selectedUserId, selectedMonth);
  const { data: groupProducts = [], isLoading: groupProductsLoading } =
    useUserGroupProducts(selectedGroupId);

  // Latest subscription invoice for paid state
  const { data: latestSubscriptionInvoice = [] } =
    useUserLatestSubscriptionInvoice(selectedUserId, selectedGroupId);
  const latestValidUntil: Date | null = useMemo(() => {
    const raw = latestSubscriptionInvoice[0]?.valid_until;
    const d = raw ? new Date(raw) : null;
    return d && !isNaN(d.getTime()) ? d : null;
  }, [latestSubscriptionInvoice]);
  const isSelectedMonthPaid = useMemo(() => {
    if (!latestValidUntil || !selectedMonth) return false;
    const selectedMonthStart = new Date(selectedMonth + '-01');
    const validUntilMonthStart = new Date(latestValidUntil);
    validUntilMonthStart.setDate(1);
    // Every invoice BEFORE validUntil month is considered paid
    return selectedMonthStart < validUntilMonthStart;
  }, [latestValidUntil, selectedMonth]);

  const selectedUser = users.find(
    (user: WorkspaceUser) => user.id === selectedUserId
  );
  const selectedPromotion =
    selectedPromotionId === 'none'
      ? null
      : promotions.find(
          (promotion: Promotion) => promotion.id === selectedPromotionId
        );
  const isLoadingSubscriptionData =
    userGroupsLoading || userAttendanceLoading || groupProductsLoading;
  const isLoadingData =
    usersLoading ||
    productsLoading ||
    promotionsLoading ||
    walletsLoading ||
    categoriesLoading;

  // Show all products - don't filter by group to allow adding any products
  const availableProducts = useMemo(() => {
    return products;
  }, [products]);

  // When switching groups: clear current selections and replace with the group's linked products
  const previousGroupIdRef = useRef<string>('');
  useEffect(() => {
    if (!selectedGroupId || !groupProducts || groupProducts.length === 0) {
      return;
    }

    const isGroupChanged = previousGroupIdRef.current !== selectedGroupId;
    previousGroupIdRef.current = selectedGroupId;

    if (!isGroupChanged) return;

    const attendanceDays = getEffectiveAttendanceDays(userAttendance);

    // Get product IDs that are linked to the selected group
    const groupProductIds = groupProducts
      .map((item) => item.workspace_products?.id)
      .filter(Boolean);

    // Find the actual products from the full products list
    const groupLinkedProducts = products.filter((product) =>
      groupProductIds.includes(product.id)
    );

    // Create SelectedProductItem entries for group products with attendance-based quantity
    const autoSelectedProducts: SelectedProductItem[] = groupLinkedProducts
      .map((product) => {
        // Choose the first available inventory or one with stock
        const inventory =
          product.inventory.find(
            (inv) => inv.amount === null || (inv.amount && inv.amount > 0)
          ) || product.inventory[0];

        if (!inventory) return null; // Skip products without inventory

        return {
          product,
          inventory,
          quantity: attendanceDays,
        } as SelectedProductItem;
      })
      .filter((item): item is SelectedProductItem => item !== null);

    setSubscriptionSelectedProducts(autoSelectedProducts);
  }, [selectedGroupId, groupProducts, products]);

  // Auto-add group products based on attendance when group is selected
  useEffect(() => {
    if (!selectedGroupId || !groupProducts || groupProducts.length === 0) {
      return;
    }

    const attendanceDays = getEffectiveAttendanceDays(userAttendance);
    if (attendanceDays === 0) return;

    // Get product IDs that are linked to the selected group
    const groupProductIds = groupProducts
      .map((item) => item.workspace_products?.id)
      .filter(Boolean);

    if (groupProductIds.length === 0) return;

    // Find the actual products from the full products list
    const groupLinkedProducts = products.filter((product) =>
      groupProductIds.includes(product.id)
    );

    // Create SelectedProductItem entries for group products
    const autoSelectedProducts: SelectedProductItem[] = groupLinkedProducts
      .map((product) => {
        // Choose the first available inventory or one with stock
        const inventory =
          product.inventory.find(
            (inv) => inv.amount === null || (inv.amount && inv.amount > 0)
          ) || product.inventory[0];

        if (!inventory) return null; // Skip products without inventory

        return {
          product,
          inventory,
          quantity: attendanceDays,
        };
      })
      .filter((item): item is SelectedProductItem => item !== null); // Only include valid items

    if (autoSelectedProducts.length === 0) return;

    // Add or update the selected products
    setSubscriptionSelectedProducts((prev) => {
      const updated = [...prev];

      autoSelectedProducts.forEach((newItem) => {
        const existingIndex = updated.findIndex(
          (item) =>
            item.product.id === newItem.product.id &&
            item.inventory.unit_id === newItem.inventory.unit_id &&
            item.inventory.warehouse_id === newItem.inventory.warehouse_id
        );

        if (existingIndex >= 0) {
          // Update existing item with attendance-based quantity
          const existingItem = updated[existingIndex];
          if (existingItem) {
            updated[existingIndex] = {
              ...existingItem,
              quantity: attendanceDays,
            };
          }
        } else {
          // Add new item
          updated.push(newItem);
        }
      });

      return updated;
    });
  }, [selectedGroupId, groupProducts, products, userAttendance?.length]);

  // Calculate totals for manual product selection
  const subscriptionSubtotal = useMemo(() => {
    return subscriptionSelectedProducts.reduce(
      (total, item) => total + item.inventory.price * item.quantity,
      0
    );
  }, [subscriptionSelectedProducts]);

  const subscriptionDiscountAmount = useMemo(() => {
    if (!selectedPromotion) return 0;

    if (selectedPromotion.use_ratio) {
      return subscriptionSubtotal * (selectedPromotion.value / 100);
    } else {
      return Math.min(selectedPromotion.value, subscriptionSubtotal);
    }
  }, [selectedPromotion, subscriptionSubtotal]);

  const subscriptionTotalBeforeRounding =
    subscriptionSubtotal - subscriptionDiscountAmount;
  const [subscriptionRoundedTotal, setSubscriptionRoundedTotal] = useState(
    subscriptionTotalBeforeRounding
  );

  useEffect(() => {
    setSubscriptionRoundedTotal(subscriptionTotalBeforeRounding);
  }, [subscriptionTotalBeforeRounding]);

  const roundUpSubscription = () => {
    setSubscriptionRoundedTotal(
      Math.ceil(subscriptionTotalBeforeRounding / 1000) * 1000
    );
  };

  const roundDownSubscription = () => {
    setSubscriptionRoundedTotal(
      Math.floor(subscriptionTotalBeforeRounding / 1000) * 1000
    );
  };

  const resetRoundingSubscription = () => {
    setSubscriptionRoundedTotal(subscriptionTotalBeforeRounding);
  };

  // Auto-select user's best linked promotion based on current subscription subtotal
  useEffect(() => {
    if (
      !selectedUserId ||
      !Array.isArray(promotions) ||
      promotions.length === 0 ||
      !Array.isArray(linkedPromotions) ||
      linkedPromotions.length === 0 ||
      selectedPromotionId !== 'none' ||
      subscriptionSubtotal <= 0
    ) {
      return;
    }

    const linkedIds = new Set(
      linkedPromotions.map((p) => p.promo_id).filter(Boolean)
    );
    const candidatePromotions = promotions.filter((p) => linkedIds.has(p.id));
    if (candidatePromotions.length === 0) return;

    const computeDiscount = (p: Promotion) =>
      p.use_ratio
        ? subscriptionSubtotal * (p.value / 100)
        : Math.min(p.value, subscriptionSubtotal);

    let best: Promotion | null = null;
    let bestAmount = -1;
    for (const p of candidatePromotions) {
      const amount = computeDiscount(p);
      if (amount > bestAmount) {
        best = p;
        bestAmount = amount;
      }
    }

    if (best && best.id) {
      setSelectedPromotionId(best.id);
    }
  }, [
    selectedUserId,
    promotions,
    linkedPromotions,
    selectedPromotionId,
    subscriptionSubtotal,
  ]);

  // Helper function to filter sessions by month
  const getSessionsForMonth = (
    sessionsArray: string[] | null,
    month: string
  ): number => {
    if (!Array.isArray(sessionsArray) || !month) return 0;

    try {
      const startOfMonth = new Date(month + '-01');
      const nextMonth = new Date(startOfMonth);
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const filteredSessions = sessionsArray.filter((sessionDate) => {
        if (!sessionDate) return false;
        const sessionDateObj = new Date(sessionDate);
        // Check if date is valid
        if (isNaN(sessionDateObj.getTime())) return false;
        return sessionDateObj >= startOfMonth && sessionDateObj < nextMonth;
      });

      return filteredSessions.length;
    } catch (error) {
      console.error('Error filtering sessions by month:', error);
      return 0;
    }
  };

  // Helper functions for attendance status counting
  const getAttendanceStats = (
    attendance: { status: string; date: string }[]
  ) => {
    if (!attendance || !Array.isArray(attendance)) {
      return { present: 0, late: 0, absent: 0, total: 0 };
    }

    return attendance.reduce(
      (stats, record) => {
        const status = record.status?.toUpperCase();
        switch (status) {
          case 'PRESENT':
            stats.present++;
            break;
          case 'LATE':
            stats.late++;
            break;
          case 'ABSENT':
            stats.absent++;
            break;
          default:
            // If status is unknown, count as present for backward compatibility
            stats.present++;
            break;
        }
        stats.total++;
        return stats;
      },
      { present: 0, late: 0, absent: 0, total: 0 }
    );
  };

  const getEffectiveAttendanceDays = (
    attendance: { status: string; date: string }[]
  ) => {
    const stats = getAttendanceStats(attendance);
    // Count both PRESENT and LATE as effective attendance
    return stats.present + stats.late;
  };

  // Calculate subscription products based on attendance
  useEffect(() => {
    if (
      !selectedGroupId ||
      !groupProducts ||
      groupProducts.length === 0 ||
      !userAttendance
    ) {
      setSubscriptionProducts([]);
      return;
    }

    const selectedGroup = userGroups.find(
      (group) => group.workspace_user_groups?.id === selectedGroupId
    );
    const sessionsArray = selectedGroup?.workspace_user_groups?.sessions || [];
    const totalSessions = getSessionsForMonth(sessionsArray, selectedMonth);
    const attendanceDays = getEffectiveAttendanceDays(userAttendance);

    const calculatedProducts = groupProducts.map((item) => ({
      product: item.workspace_products,
      attendanceDays,
      totalSessions,
      pricePerSession: totalSessions > 0 ? attendanceDays / totalSessions : 0,
    }));

    setSubscriptionProducts(calculatedProducts);
  }, [
    selectedGroupId,
    groupProducts?.length,
    userAttendance?.length,
    userGroups?.length,
    selectedMonth,
  ]);

  // Reset subscription state when user changes
  useEffect(() => {
    // Clear all related state whenever the selected user changes
    setSelectedGroupId('');
    setSubscriptionProducts([]);
    setSubscriptionSelectedProducts([]);
    setInvoiceContent('');
    setInvoiceNotes('');
    setSelectedWalletId('');
    setSelectedPromotionId('none');
    setSelectedCategoryId('');
    setSelectedMonth(new Date().toISOString().slice(0, 7));
  }, [selectedUserId]);

  // Auto-select the first group when userGroups are loaded
  useEffect(() => {
    if (
      userGroups.length > 0 &&
      !selectedGroupId &&
      !userGroupsLoading &&
      selectedUserId
    ) {
      const firstGroup = userGroups[0];
      if (firstGroup?.workspace_user_groups?.id) {
        setSelectedGroupId(firstGroup.workspace_user_groups.id);
      }
    }
  }, [userGroups, selectedGroupId, userGroupsLoading, selectedUserId]);

  // Validate and reset selectedMonth when group changes
  useEffect(() => {
    if (!selectedGroupId || !userGroups.length) return;

    const selectedGroup = userGroups.find(
      (g) => g.workspace_user_groups?.id === selectedGroupId
    );
    const group = selectedGroup?.workspace_user_groups;

    if (!group) return;

    const startDate = group.starting_date
      ? new Date(group.starting_date)
      : new Date();
    const endDate = group.ending_date
      ? new Date(group.ending_date)
      : new Date();
    const currentMonth = new Date(selectedMonth + '-01');

    // Check if current selected month is within group date range
    if (currentMonth < startDate || currentMonth > endDate) {
      // Set to the most recent valid month within the range
      const now = new Date();
      let defaultMonth: Date;

      if (now >= startDate && now <= endDate) {
        // Current month is within range
        defaultMonth = now;
      } else if (now > endDate) {
        // Current month is after group ended, use end month
        defaultMonth = endDate;
      } else {
        // Current month is before group started, use start month
        defaultMonth = startDate;
      }

      setSelectedMonth(defaultMonth.toISOString().slice(0, 7));
    }
  }, [selectedGroupId, userGroups.length, selectedMonth]);

  // Auto-generate subscription invoice content
  useEffect(() => {
    if (
      subscriptionProducts.length === 0 &&
      subscriptionSelectedProducts.length === 0
    )
      return;

    const selectedGroup = userGroups.find(
      (group) => group.workspace_user_groups?.id === selectedGroupId
    );
    const groupName =
      selectedGroup?.workspace_user_groups?.name || 'Unknown Group';
    const monthName = new Date(selectedMonth + '-01').toLocaleDateString(
      locale,
      {
        year: 'numeric',
        month: 'long',
      }
    );

    const contentParts = [
      t('ws-invoices.subscription_invoice_for_group_month', {
        groupName,
        monthName,
      }),
    ];

    // Build auto-notes for attendance instead of putting it in content
    let autoNotes: string | null = null;
    if (subscriptionProducts.length > 0) {
      const attendanceDays = subscriptionProducts[0]?.attendanceDays || 0;
      const totalSessions = subscriptionProducts[0]?.totalSessions || 0;
      const attendanceStats = getAttendanceStats(userAttendance);
      autoNotes = t('ws-invoices.attendance_summary_note', {
        attended: attendanceDays,
        total: totalSessions,
        present: attendanceStats.present,
        late: attendanceStats.late,
        absent: attendanceStats.absent,
      });
    }

    // Only count additional products that are NOT associated with the selected group
    if (subscriptionSelectedProducts.length > 0) {
      const groupProductIds = (groupProducts || [])
        .map((item) => item.workspace_products?.id)
        .filter(Boolean);

      const additionalProductCount = subscriptionSelectedProducts.filter(
        (item) => !groupProductIds.includes(item.product.id)
      ).length;

      if (additionalProductCount > 0) {
        contentParts.push(
          t('ws-invoices.additional_products_count', {
            count: additionalProductCount,
          })
        );
      }
    }

    setInvoiceContent(contentParts.join('\n'));

    // Overwrite notes with attendance summary when not already paid
    if (autoNotes && !isSelectedMonthPaid) {
      setInvoiceNotes(autoNotes as string);
    }
  }, [
    subscriptionProducts,
    subscriptionSelectedProducts,
    selectedGroupId,
    selectedMonth,
    userGroups,
    groupProducts,
    isSelectedMonthPaid,
  ]);

  // Month navigation handlers
  const navigateMonth = (direction: 'prev' | 'next') => {
    const selectedGroup = userGroups.find(
      (g) => g.workspace_user_groups?.id === selectedGroupId
    );
    const group = selectedGroup?.workspace_user_groups;

    if (!group) return;

    // Get group start and end dates
    const startDate = group.starting_date
      ? new Date(group.starting_date)
      : new Date();
    const endDate = group.ending_date
      ? new Date(group.ending_date)
      : new Date();

    // Calculate new month
    const currentMonth = new Date(selectedMonth + '-01');
    const newMonth = new Date(currentMonth);

    if (direction === 'prev') {
      newMonth.setMonth(newMonth.getMonth() - 1);
    } else {
      newMonth.setMonth(newMonth.getMonth() + 1);
    }

    // Check if new month is within group date range
    if (newMonth >= startDate && newMonth <= endDate) {
      setSelectedMonth(newMonth.toISOString().slice(0, 7));
    }
  };

  const canNavigateMonth = (direction: 'prev' | 'next') => {
    const selectedGroup = userGroups.find(
      (g) => g.workspace_user_groups?.id === selectedGroupId
    );
    const group = selectedGroup?.workspace_user_groups;

    if (!group) return false;

    // Get group start and end dates
    const startDate = group.starting_date
      ? new Date(group.starting_date)
      : new Date();
    const endDate = group.ending_date
      ? new Date(group.ending_date)
      : new Date();

    // Calculate target month
    const currentMonth = new Date(selectedMonth + '-01');
    const targetMonth = new Date(currentMonth);

    if (direction === 'prev') {
      targetMonth.setMonth(targetMonth.getMonth() - 1);
    } else {
      targetMonth.setMonth(targetMonth.getMonth() + 1);
    }

    return targetMonth >= startDate && targetMonth <= endDate;
  };

  const handleCreateSubscriptionInvoice = async () => {
    if (
      !selectedUser ||
      !selectedGroupId ||
      (subscriptionSelectedProducts.length === 0 &&
        subscriptionProducts.length === 0) ||
      !selectedWalletId ||
      !selectedCategoryId
    ) {
      toast(t('ws-invoices.create_subscription_invoice_validation'));
      return;
    }

    // Build product payload from selected items (auto group items are inserted into subscriptionSelectedProducts already)
    const productsPayload = subscriptionSelectedProducts.map((item) => ({
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
        group_id: selectedGroupId,
        selected_month: selectedMonth,
        content: invoiceContent,
        notes: invoiceNotes,
        wallet_id: selectedWalletId,
        promotion_id:
          selectedPromotionId !== 'none' ? selectedPromotionId : undefined,
        products: productsPayload,
        category_id: selectedCategoryId,
        frontend_subtotal: subscriptionSubtotal,
        frontend_discount_amount: subscriptionDiscountAmount,
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
      if (!response.ok) {
        throw new Error(
          result.message || 'Failed to create subscription invoice'
        );
      }

      if (result.data?.values_recalculated) {
        const { calculated_values, frontend_values } = result.data;
        const roundingInfo =
          calculated_values.rounding_applied !== 0
            ? ` | ${t('ws-invoices.rounding')}: ${Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND',
              }).format(calculated_values.rounding_applied)}`
            : '';
        toast(t('ws-invoices.subscription_invoice_created_recalculated'), {
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
          t('ws-invoices.subscription_invoice_created_success', {
            invoiceId: result.invoice_id,
          })
        );
      }

      // Reset form
      setSubscriptionSelectedProducts([]);
      setSelectedPromotionId('none');
      setInvoiceContent('');
      setInvoiceNotes('');
      setSubscriptionRoundedTotal(0);
      onSelectedUserIdChange('');
      setSelectedWalletId('');
      setSelectedCategoryId('');
      setSelectedGroupId('');

      if (!createMultipleInvoices) {
        router.push(`/${wsId}/finance/invoices/${result.invoice_id}`);
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
      {/* Left Column - Customer and Group Information */}
      <div className="space-y-6">
        {/* Customer Selection */}
        <Card>
          <CardHeader>
            <CardTitle>{t('invoice-data-table.customer')}</CardTitle>
            <CardDescription>
              {t('ws-invoices.subscription_customer_selection_description')}
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
                onChange={(value) => onSelectedUserIdChange(value as string)}
                placeholder={t('ws-invoices.search_customers')}
              />
            </div>
          </CardContent>
        </Card>

        {/* Groups Section */}
        {selectedUserId && (
          <Card>
            <CardHeader>
              <CardTitle>{t('ws-invoices.user_groups')}</CardTitle>
              <CardDescription>
                {t('ws-invoices.user_groups_description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {userGroupsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <p className="text-muted-foreground text-sm">
                      {t('ws-invoices.loading_groups')}
                    </p>
                  </div>
                </div>
              ) : userGroups.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-muted-foreground text-sm">
                    {t('ws-invoices.no_groups_found')}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {userGroups.map((groupItem) => {
                    const group = groupItem.workspace_user_groups;
                    if (!group) return null;

                    return (
                      <div
                        key={group.id}
                        className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                          selectedGroupId === group.id
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => setSelectedGroupId(group.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium">{group.name}</h3>
                              {isLoadingSubscriptionData &&
                                selectedGroupId === group.id && (
                                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                                )}
                            </div>
                            <div className="mt-1 space-y-1">
                              {group.starting_date && (
                                <p className="text-muted-foreground text-sm">
                                  {t('ws-invoices.started')}:{' '}
                                  {new Date(
                                    group.starting_date
                                  ).toLocaleDateString(locale)}
                                </p>
                              )}
                              {group.ending_date && (
                                <p className="text-muted-foreground text-sm">
                                  {t('ws-invoices.ends')}:{' '}
                                  {new Date(
                                    group.ending_date
                                  ).toLocaleDateString(locale)}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="ml-4">
                            {selectedGroupId === group.id && (
                              <div className="h-4 w-4 rounded-full bg-primary" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
        {/* Product Selection */}
        {selectedGroupId && !isSelectedMonthPaid && (
          <ProductSelection
            products={availableProducts}
            selectedProducts={subscriptionSelectedProducts}
            onSelectedProductsChange={(newProducts) => {
              setSubscriptionSelectedProducts(newProducts);
            }}
            groupLinkedProductIds={(groupProducts || [])
              .map((item) => item.workspace_products?.id)
              .filter(Boolean)}
          />
        )}
      </div>

      {/* Right Column - Attendance and Products */}
      <div className="space-y-6">
        {/* Attendance Summary */}
        {selectedGroupId && selectedMonth && (
          <Card>
            <CardHeader className="flex items-center justify-between flex-row">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <CardTitle>{t('ws-invoices.attendance_summary')}</CardTitle>
                  {isSelectedMonthPaid && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-green-700">
                      {t('ws-invoices.paid')}
                    </span>
                  )}
                </div>
                <CardDescription>
                  {t('ws-invoices.attendance_for_month', {
                    month: new Date(selectedMonth + '-01').toLocaleDateString(
                      locale,
                      {
                        year: 'numeric',
                        month: 'long',
                      }
                    ),
                  })}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => navigateMonth('prev')}
                  disabled={!canNavigateMonth('prev')}
                  aria-label={t('ws-invoices.previous_month')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('ws-invoices.select_month')} />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const selectedGroup = userGroups.find(
                        (g) => g.workspace_user_groups?.id === selectedGroupId
                      );
                      const group = selectedGroup?.workspace_user_groups;

                      if (!group) return null;

                      // Get group start and end dates
                      const startDate = group.starting_date
                        ? new Date(group.starting_date)
                        : new Date();
                      const endDate = group.ending_date
                        ? new Date(group.ending_date)
                        : new Date();

                      // Generate months between start and end date
                      const months = [];
                      const currentDate = new Date(startDate);
                      currentDate.setDate(1); // Set to first day of month

                      while (currentDate <= endDate) {
                        const value = currentDate.toISOString().slice(0, 7);
                        const label = currentDate.toLocaleDateString(locale, {
                          year: 'numeric',
                          month: 'long',
                        });
                        const isPaidItem = (() => {
                          if (!latestValidUntil) return false;
                          const itemMonthStart = new Date(currentDate);
                          itemMonthStart.setDate(1);
                          const paidMonthStart = new Date(latestValidUntil);
                          paidMonthStart.setDate(1);
                          return itemMonthStart < paidMonthStart;
                        })();

                        months.push(
                          <SelectItem key={value} value={value}>
                            <span className="flex items-center gap-2">
                              <span>{label}</span>
                              {isPaidItem && (
                                <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                                  {t('ws-invoices.paid')}
                                </span>
                              )}
                            </span>
                          </SelectItem>
                        );

                        // Move to next month
                        currentDate.setMonth(currentDate.getMonth() + 1);
                      }

                      return months;
                    })()}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => navigateMonth('next')}
                  disabled={!canNavigateMonth('next')}
                  aria-label={t('ws-invoices.next_month')}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingSubscriptionData && userAttendance.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <p className="text-muted-foreground text-sm">
                      {t('ws-invoices.loading_attendance')}
                    </p>
                  </div>
                </div>
              ) : userAttendanceError ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-destructive text-sm">
                    {t('ws-invoices.error_loading_attendance')}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Attendance Stats */}
                  {(() => {
                    const attendanceStats = getAttendanceStats(userAttendance);
                    const selectedGroup = userGroups.find(
                      (g) => g.workspace_user_groups?.id === selectedGroupId
                    );
                    const sessionsArray =
                      selectedGroup?.workspace_user_groups?.sessions || [];
                    const totalSessions = getSessionsForMonth(
                      sessionsArray,
                      selectedMonth
                    );

                    return (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="rounded-lg border p-3">
                            <p className="text-muted-foreground text-sm">
                              {t('ws-invoices.days_attended')}
                            </p>
                            <p className="text-2xl font-bold text-green-600">
                              {attendanceStats.present + attendanceStats.late}
                            </p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-muted-foreground text-sm">
                              {t('ws-invoices.total_sessions')}
                            </p>
                            <p className="text-2xl font-bold">
                              {totalSessions}
                            </p>
                          </div>
                        </div>

                        {/* Detailed Status Breakdown */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="rounded-lg border p-3">
                            <p className="text-muted-foreground text-sm">
                              {t('ws-invoices.present')}
                            </p>
                            <p className="text-xl font-bold text-green-600">
                              {attendanceStats.present}
                            </p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-muted-foreground text-sm">
                              {t('ws-invoices.late')}
                            </p>
                            <p className="text-xl font-bold text-yellow-600">
                              {attendanceStats.late}
                            </p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-muted-foreground text-sm">
                              {t('ws-invoices.absent')}
                            </p>
                            <p className="text-xl font-bold text-red-600">
                              {attendanceStats.absent}
                            </p>
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  {/* Attendance Rate */}
                  {(() => {
                    const attendanceDays =
                      getEffectiveAttendanceDays(userAttendance);
                    const selectedGroup = userGroups.find(
                      (g) => g.workspace_user_groups?.id === selectedGroupId
                    );
                    const sessionsArray =
                      selectedGroup?.workspace_user_groups?.sessions || [];
                    const totalSessions = getSessionsForMonth(
                      sessionsArray,
                      selectedMonth
                    );
                    const attendanceRate =
                      totalSessions > 0
                        ? (attendanceDays / totalSessions) * 100
                        : 0;

                    return (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>{t('ws-invoices.attendance_rate')}</span>
                          <span className="font-medium">
                            {attendanceRate.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-green-500 transition-all"
                            style={{
                              width: `${Math.min(attendanceRate, 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Attendance Calendar */}
                  {userAttendance && userAttendance.length > 0 && (
                    <div className="space-y-2">
                      <Label>{t('ws-invoices.attendance_calendar')}</Label>
                      <AttendanceCalendar
                        userAttendance={userAttendance}
                        selectedMonth={selectedMonth}
                        selectedGroup={userGroups.find(
                          (g) => g.workspace_user_groups?.id === selectedGroupId
                        )}
                        locale={locale}
                      />
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <div className="h-2 w-2 rounded-full bg-green-500"></div>
                          <span>{t('ws-invoices.present')}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="h-2 w-2 rounded-full bg-yellow-500"></div>
                          <span>{t('ws-invoices.late')}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="h-2 w-2 rounded-full bg-red-500"></div>
                          <span>{t('ws-invoices.absent')}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="h-2 w-2 rounded-full bg-gray-300"></div>
                          <span>{t('ws-invoices.no_session')}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Invoice Configuration for Subscription */}
        {(subscriptionProducts.length > 0 ||
          subscriptionSelectedProducts.length > 0) &&
          !isSelectedMonthPaid && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {t('ws-invoices.subscription_invoice_configuration')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Invoice Content */}
                <div className="space-y-2">
                  <Label htmlFor="subscription-invoice-content">
                    {t('ws-invoices.content')}
                  </Label>
                  <Textarea
                    id="subscription-invoice-content"
                    placeholder={t(
                      'ws-invoices.subscription_invoice_content_placeholder'
                    )}
                    className="min-h-[80px]"
                    value={invoiceContent}
                    onChange={(e) => setInvoiceContent(e.target.value)}
                  />
                </div>

                {/* Invoice Notes */}
                <div className="space-y-2">
                  <Label htmlFor="subscription-invoice-notes">
                    {t('ws-invoices.notes')}
                  </Label>
                  <Textarea
                    id="subscription-invoice-notes"
                    placeholder={t('ws-invoices.additional_notes_placeholder')}
                    className="min-h-[60px]"
                    value={invoiceNotes}
                    onChange={(e) => setInvoiceNotes(e.target.value)}
                  />
                </div>

                <Separator />

                {/* Payment Settings */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                    <CreditCard className="h-4 w-4" />
                    {t('ws-invoices.payment_settings')}
                  </div>

                  {/* Wallet Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="subscription-wallet-select">
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
                                  {wallet.name ||
                                    t('ws-invoices.unnamed_wallet')}
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
                    <Label htmlFor="subscription-category-select">
                      {t('ws-invoices.transaction_category')}{' '}
                      <span className="text-red-500">*</span>
                    </Label>
                    <Combobox
                      t={t}
                      options={categories.map(
                        (category): ComboboxOptions => ({
                          value: category.id || '',
                          label:
                            category.name || t('ws-invoices.unnamed_category'),
                        })
                      )}
                      selected={selectedCategoryId}
                      onChange={(value) =>
                        setSelectedCategoryId(value as string)
                      }
                      placeholder={t('ws-invoices.select_category_required')}
                    />
                  </div>

                  {/* Promotion Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="subscription-promotion-select">
                      {t('invoices.add_promotion')}
                    </Label>
                    <Combobox
                      t={t}
                      options={[
                        { value: 'none', label: t('ws-invoices.no_promotion') },
                        ...promotions.map(
                          (promotion): ComboboxOptions => ({
                            value: promotion.id,
                            label: `${promotion.name || t('ws-invoices.unnamed_promotion')} (${
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
                      placeholder={t('ws-invoices.search_promotions')}
                    />
                  </div>
                </div>

                {/* Checkout Section for Manual Products */}
                {subscriptionSelectedProducts.length > 0 && (
                  <>
                    <Separator />

                    <div className="space-y-4">
                      <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                        <Calculator className="h-4 w-4" />
                        {t('ws-invoices.additional_products_checkout')}
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
                            }).format(subscriptionSubtotal)}
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
                              }).format(subscriptionDiscountAmount)}
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
                            }).format(subscriptionRoundedTotal)}
                          </span>
                        </div>

                        {Math.abs(
                          subscriptionRoundedTotal -
                            subscriptionTotalBeforeRounding
                        ) > 0.01 && (
                          <div className="flex justify-between text-muted-foreground text-sm">
                            <span>{t('ws-invoices.adjustment')}</span>
                            <span>
                              {subscriptionRoundedTotal >
                              subscriptionTotalBeforeRounding
                                ? '+'
                                : ''}
                              {Intl.NumberFormat('vi-VN', {
                                style: 'currency',
                                currency: 'VND',
                              }).format(
                                subscriptionRoundedTotal -
                                  subscriptionTotalBeforeRounding
                              )}
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
                            onClick={roundUpSubscription}
                            className="flex-1"
                          >
                            <ArrowUp className="mr-1 h-4 w-4" />
                            {t('ws-invoices.round_up')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={roundDownSubscription}
                            className="flex-1"
                          >
                            <ArrowDown className="mr-1 h-4 w-4" />
                            {t('ws-invoices.round_down')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={resetRoundingSubscription}
                            disabled={
                              Math.abs(
                                subscriptionRoundedTotal -
                                  subscriptionTotalBeforeRounding
                              ) < 0.01
                            }
                          >
                            {t('ws-invoices.reset')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                {/* Create Subscription Invoice Button */}
                <Button
                  className="w-full"
                  onClick={handleCreateSubscriptionInvoice}
                  disabled={
                    !selectedUser ||
                    !selectedGroupId ||
                    (subscriptionProducts.length === 0 &&
                      subscriptionSelectedProducts.length === 0) ||
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
              </CardContent>
            </Card>
          )}
      </div>
    </div>
  );
}
