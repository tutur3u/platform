'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CreditCard,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Trash2,
} from '@tuturuuu/icons';
import type {
  CustomerPaymentMethod,
  PaymentMethodCard,
} from '@tuturuuu/payment/polar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  deleteWorkspacePaymentMethod,
  getWorkspaceCustomerPortalUrl,
  getWorkspacePaymentMethods,
} from './actions';

interface PaymentMethodsCardProps {
  wsId: string;
  hasManageSubscriptionPermission: boolean;
}

// Payment method type - flexible to handle different Polar SDK structures
interface PaymentMethodDisplay {
  id: string;
  type: string;
  brand?: string | null;
  last4?: string | null;
  expiryMonth?: number | null;
  expiryYear?: number | null;
  isDefault?: boolean;
}

function extractPaymentMethodInfo(
  paymentMethod: CustomerPaymentMethod
): PaymentMethodDisplay {
  // Type guard with explicit cast for card type
  if (paymentMethod.type === 'card' && 'methodMetadata' in paymentMethod) {
    const card = paymentMethod as PaymentMethodCard;
    return {
      id: card.id,
      type: card.type,
      brand: card.methodMetadata.brand,
      last4: card.methodMetadata.last4,
      expiryMonth: card.methodMetadata.expMonth,
      expiryYear: card.methodMetadata.expYear,
      isDefault: false,
    };
  }

  // For non-card payment methods
  return {
    id: paymentMethod.id,
    type: paymentMethod.type,
    brand: null,
    last4: null,
    expiryMonth: null,
    expiryYear: null,
    isDefault: false,
  };
}

function getCardBrandDisplay(brand: string | null | undefined) {
  const normalizedBrand = brand?.toLowerCase() ?? 'card';
  const brandMap: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
    discover: 'Discover',
    diners: 'Diners Club',
    jcb: 'JCB',
    unionpay: 'UnionPay',
  };
  return brandMap[normalizedBrand] ?? 'Card';
}

export function PaymentMethodsCard({
  wsId,
  hasManageSubscriptionPermission,
}: PaymentMethodsCardProps) {
  const t = useTranslations('billing');
  const queryClient = useQueryClient();
  const [deletePaymentMethodId, setDeletePaymentMethodId] = useState<
    string | null
  >(null);

  // Fetch payment methods using TanStack Query
  const {
    data: paymentMethods,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['workspace-payment-methods', wsId],
    queryFn: async () => {
      const result = await getWorkspacePaymentMethods(wsId);
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to fetch payment methods');
      }
      return result.data ?? [];
    },
    enabled: hasManageSubscriptionPermission,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Delete payment method mutation
  const deletePaymentMethodMutation = useMutation({
    mutationFn: (paymentMethodId: string) =>
      deleteWorkspacePaymentMethod(wsId, paymentMethodId),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(t('payment-method-deleted'));
        setDeletePaymentMethodId(null);
        queryClient.invalidateQueries({
          queryKey: ['workspace-payment-methods', wsId],
        });
      } else {
        toast.error(result.error ?? t('failed-to-delete-payment-method'));
      }
    },
    onError: () => {
      toast.error(t('failed-to-delete-payment-method'));
    },
  });

  // Handle add payment method - redirect to Polar portal
  const handleAddPaymentMethod = async () => {
    try {
      const result = await getWorkspaceCustomerPortalUrl(wsId);
      if (result.success && result.data?.url) {
        window.open(result.data.url, '_blank', 'noopener,noreferrer');
      } else {
        toast.error(result.error ?? t('failed-to-open-customer-portal'));
      }
    } catch (error) {
      console.error(error);
      toast.error(t('failed-to-open-customer-portal'));
    }
  };

  if (!hasManageSubscriptionPermission) {
    return null;
  }

  // Render loading state
  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/50 bg-card p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-full bg-dynamic-blue/10 p-2.5">
            <CreditCard className="h-5 w-5 text-dynamic-blue" />
          </div>
          <h3 className="font-semibold text-lg">{t('payment-methods')}</h3>
        </div>
        <div className="space-y-3">
          <div className="h-16 w-full animate-pulse rounded-lg bg-muted" />
          <div className="h-16 w-full animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="rounded-xl border border-border/50 bg-card p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-full bg-dynamic-blue/10 p-2.5">
            <CreditCard className="h-5 w-5 text-dynamic-blue" />
          </div>
          <h3 className="font-semibold text-lg">{t('payment-methods')}</h3>
        </div>
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-center text-destructive text-sm">
            {error instanceof Error ? error.message : t('error-loading-data')}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('try-again')}
          </Button>
        </div>
      </div>
    );
  }

  const paymentMethodsDisplay = (paymentMethods ?? []).map(
    extractPaymentMethodInfo
  );

  return (
    <div className="mb-8 rounded-xl border border-border/50 bg-card p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-dynamic-blue/10 p-2.5">
            <CreditCard className="h-5 w-5 text-dynamic-blue" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">{t('payment-methods')}</h3>
            <p className="text-muted-foreground text-sm">
              {t('manage-payment-methods-description')}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => refetch()}
          className="h-8 w-8"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-end">
          <Button variant="outline" size="sm" onClick={handleAddPaymentMethod}>
            <CreditCard className="mr-2 h-4 w-4" />
            {t('add-payment-method')}
          </Button>
        </div>

        {paymentMethodsDisplay.length > 0 ? (
          <div className="space-y-3">
            {paymentMethodsDisplay.map((pm) => (
              <div
                key={pm.id}
                className="flex items-center justify-between rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {getCardBrandDisplay(pm.brand)} •••• {pm.last4 ?? '****'}
                    </p>
                    {pm.expiryMonth && pm.expiryYear && (
                      <p className="text-muted-foreground text-sm">
                        {t('expires')} {pm.expiryMonth}/{pm.expiryYear}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {pm.isDefault && (
                    <Badge variant="secondary">{t('default')}</Badge>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeletePaymentMethodId(pm.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/30 p-8">
            <CreditCard className="h-10 w-10 text-muted-foreground" />
            <p className="text-center text-muted-foreground text-sm">
              {t('no-payment-methods')}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddPaymentMethod}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {t('add-payment-method')}
            </Button>
          </div>
        )}
      </div>

      {/* Delete Payment Method Confirmation Dialog */}
      <Dialog
        open={!!deletePaymentMethodId}
        onOpenChange={(open) => !open && setDeletePaymentMethodId(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('delete-payment-method')}</DialogTitle>
            <DialogDescription>
              {t('delete-payment-method-confirmation')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletePaymentMethodId(null)}
              disabled={deletePaymentMethodMutation.isPending}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deletePaymentMethodId &&
                deletePaymentMethodMutation.mutate(deletePaymentMethodId)
              }
              disabled={deletePaymentMethodMutation.isPending}
            >
              {deletePaymentMethodMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('deleting')}...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('delete')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
