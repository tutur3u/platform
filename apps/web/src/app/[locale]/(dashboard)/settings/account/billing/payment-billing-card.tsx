'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Building2,
  Check,
  CreditCard,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  MoreHorizontal,
  Receipt,
  RefreshCw,
  Trash2,
} from '@tuturuuu/icons';
import type {
  AddressInput,
  CustomerOrder,
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
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { format } from 'date-fns';
import { useState } from 'react';
import {
  deletePaymentMethod,
  getBillingData,
  getCustomerPortalUrl,
  updateBillingAddress,
} from './actions';

// Country options for billing address
const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'JP', name: 'Japan' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'SG', name: 'Singapore' },
] as const;

type CountryCode = (typeof COUNTRIES)[number]['code'];

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

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function getOrderStatusBadge(status: string) {
  const statusConfig: Record<
    string,
    {
      variant: 'default' | 'secondary' | 'destructive' | 'outline';
      label: string;
    }
  > = {
    paid: { variant: 'default', label: 'Paid' },
    pending: { variant: 'secondary', label: 'Pending' },
    refunded: { variant: 'outline', label: 'Refunded' },
    failed: { variant: 'destructive', label: 'Failed' },
  };

  const config = statusConfig[status] ?? {
    variant: 'secondary',
    label: status,
  };

  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export default function PaymentBillingCard() {
  const queryClient = useQueryClient();

  // Dialog states
  const [showAddressDialog, setShowAddressDialog] = useState(false);
  const [showOrdersDialog, setShowOrdersDialog] = useState(false);
  const [deletePaymentMethodId, setDeletePaymentMethodId] = useState<
    string | null
  >(null);

  // Address form state
  const [addressForm, setAddressForm] = useState<{
    name: string;
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: CountryCode;
  }>({
    name: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
  });

  // Fetch billing data using TanStack Query
  const {
    data: billingData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['billing-data'],
    queryFn: async () => {
      const result = await getBillingData();
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to fetch billing data');
      }
      return result.data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Update address mutation
  const updateAddressMutation = useMutation({
    mutationFn: ({ name, address }: { name: string; address: AddressInput }) =>
      updateBillingAddress(name, address),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Billing address updated successfully');
        setShowAddressDialog(false);
        queryClient.invalidateQueries({ queryKey: ['billing-data'] });
      } else {
        toast.error(result.error ?? 'Failed to update address');
      }
    },
    onError: () => {
      toast.error('Failed to update address');
    },
  });

  // Delete payment method mutation
  const deletePaymentMethodMutation = useMutation({
    mutationFn: deletePaymentMethod,
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Payment method deleted');
        setDeletePaymentMethodId(null);
        queryClient.invalidateQueries({ queryKey: ['billing-data'] });
      } else {
        toast.error(result.error ?? 'Failed to delete payment method');
      }
    },
    onError: () => {
      toast.error('Failed to delete payment method');
    },
  });

  // Open address dialog with current data
  const handleEditAddress = () => {
    if (billingData?.customer) {
      const { billingName, billingAddress } = billingData.customer;
      setAddressForm({
        name: billingName ?? '',
        line1: billingAddress?.line1 ?? '',
        line2: billingAddress?.line2 ?? '',
        city: billingAddress?.city ?? '',
        state: billingAddress?.state ?? '',
        postalCode: billingAddress?.postalCode ?? '',
        country: (billingAddress?.country as CountryCode) ?? 'US',
      });
    } else {
      setAddressForm({
        name: '',
        line1: '',
        line2: '',
        city: '',
        state: '',
        postalCode: '',
        country: 'US',
      });
    }
    setShowAddressDialog(true);
  };

  // Handle add payment method - redirect to Polar portal
  const handleAddPaymentMethod = async () => {
    const result = await getCustomerPortalUrl();
    if (result.success && result.data?.url) {
      window.open(result.data.url, '_blank', 'noopener,noreferrer');
    } else {
      toast.error(result.error ?? 'Failed to open customer portal');
    }
  };

  // Handle save address
  const handleSaveAddress = () => {
    const addressData: AddressInput = {
      line1: addressForm.line1,
      line2: addressForm.line2 || undefined,
      city: addressForm.city,
      state: addressForm.state || undefined,
      postalCode: addressForm.postalCode,
      country: addressForm.country,
    };
    updateAddressMutation.mutate({
      name: addressForm.name,
      address: addressData,
    });
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-dynamic-blue/10 p-2.5">
            <CreditCard className="h-5 w-5 text-dynamic-blue" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-lg">Payment & Billing</h3>
            <p className="text-muted-foreground text-sm">
              Manage your payment methods and billing information
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-20 w-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-20 w-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-dynamic-blue/10 p-2.5">
            <CreditCard className="h-5 w-5 text-dynamic-blue" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-lg">Payment & Billing</h3>
            <p className="text-muted-foreground text-sm">
              Manage your payment methods and billing information
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/50 bg-destructive/10 p-8">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <p className="text-center text-destructive">
            {error instanceof Error
              ? error.message
              : 'Error loading billing data'}
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  const { customer, paymentMethods, orders } = billingData ?? {};

  // Process payment methods to extract display info
  const paymentMethodsDisplay = (paymentMethods ?? []).map(
    extractPaymentMethodInfo
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-dynamic-blue/10 p-2.5">
            <CreditCard className="h-5 w-5 text-dynamic-blue" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-lg">Payment & Billing</h3>
            <p className="text-muted-foreground text-sm">
              Manage your payment methods and billing information
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

      <div className="space-y-6">
        {/* Payment Methods Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Payment Method</h4>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddPaymentMethod}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              Add Payment Method
            </Button>
          </div>

          {paymentMethodsDisplay.length > 0 ? (
            <div className="space-y-3">
              {paymentMethodsDisplay.map((pm) => (
                <div
                  key={pm.id}
                  className="flex items-center justify-between rounded-lg border bg-card p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {getCardBrandDisplay(pm.brand)} ••••{' '}
                        {pm.last4 ?? '****'}
                      </p>
                      {pm.expiryMonth && pm.expiryYear && (
                        <p className="text-muted-foreground text-sm">
                          Expires {pm.expiryMonth}/{pm.expiryYear}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {pm.isDefault && <Badge variant="secondary">Default</Badge>}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeletePaymentMethodId(pm.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
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
                No payment method added
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddPaymentMethod}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Add Payment Method
              </Button>
            </div>
          )}
        </div>

        <Separator />

        {/* Billing Address Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Billing Address</h4>
            <Button variant="outline" size="sm" onClick={handleEditAddress}>
              <MapPin className="mr-2 h-4 w-4" />
              Update Address
            </Button>
          </div>

          {customer?.billingAddress ? (
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  {customer.billingName && (
                    <p className="font-semibold">{customer.billingName}</p>
                  )}
                  <p className="font-medium">
                    {customer.billingAddress.line1}
                    {customer.billingAddress.line2 && (
                      <>, {customer.billingAddress.line2}</>
                    )}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {customer.billingAddress.city}
                    {customer.billingAddress.state &&
                      `, ${customer.billingAddress.state}`}{' '}
                    {customer.billingAddress.postalCode}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {COUNTRIES.find(
                      (c) => c.code === customer.billingAddress?.country
                    )?.name ?? customer.billingAddress.country}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/30 p-8">
              <MapPin className="h-10 w-10 text-muted-foreground" />
              <p className="text-center text-muted-foreground text-sm">
                Not configured
              </p>
              <Button variant="outline" size="sm" onClick={handleEditAddress}>
                Update Address
              </Button>
            </div>
          )}
        </div>

        <Separator />

        {/* Order History Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Billing History</h4>
            {orders && orders.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowOrdersDialog(true)}
              >
                <Receipt className="mr-2 h-4 w-4" />
                View History
              </Button>
            )}
          </div>

          {orders && orders.length > 0 ? (
            <div className="space-y-3">
              {/* Show last 3 orders */}
              {orders.slice(0, 3).map((order: CustomerOrder) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between rounded-lg border bg-card p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {order.product?.name ?? 'Order'}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {format(new Date(order.createdAt), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">
                      {formatCurrency(order.totalAmount, order.currency)}
                    </span>
                    {getOrderStatusBadge(order.status)}
                  </div>
                </div>
              ))}
              {orders.length > 3 && (
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setShowOrdersDialog(true)}
                >
                  View all {orders.length} orders
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/30 p-8">
              <Receipt className="h-10 w-10 text-muted-foreground" />
              <p className="text-center text-muted-foreground text-sm">
                No orders yet
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Update Address Dialog */}
      <Dialog open={showAddressDialog} onOpenChange={setShowAddressDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Billing Address</DialogTitle>
            <DialogDescription>
              Enter your billing address for invoices and receipts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Billing Name</Label>
              <Input
                id="name"
                placeholder="Full name or company name"
                value={addressForm.name}
                onChange={(e) =>
                  setAddressForm({ ...addressForm, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="line1">Address Line 1</Label>
              <Input
                id="line1"
                placeholder="Street address"
                value={addressForm.line1}
                onChange={(e) =>
                  setAddressForm({ ...addressForm, line1: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="line2">Address Line 2</Label>
              <Input
                id="line2"
                placeholder="Apartment, suite, etc. (optional)"
                value={addressForm.line2}
                onChange={(e) =>
                  setAddressForm({ ...addressForm, line2: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={addressForm.city}
                  onChange={(e) =>
                    setAddressForm({ ...addressForm, city: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State / Province</Label>
                <Input
                  id="state"
                  value={addressForm.state}
                  onChange={(e) =>
                    setAddressForm({ ...addressForm, state: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="postalCode">Postal Code</Label>
                <Input
                  id="postalCode"
                  value={addressForm.postalCode}
                  onChange={(e) =>
                    setAddressForm({
                      ...addressForm,
                      postalCode: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Select
                  value={addressForm.country}
                  onValueChange={(value: CountryCode) =>
                    setAddressForm({ ...addressForm, country: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddressDialog(false)}
              disabled={updateAddressMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveAddress}
              disabled={updateAddressMutation.isPending}
            >
              {updateAddressMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Save
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Payment Method Confirmation Dialog */}
      <Dialog
        open={!!deletePaymentMethodId}
        onOpenChange={(open) => !open && setDeletePaymentMethodId(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Payment Method</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this payment method? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletePaymentMethodId(null)}
              disabled={deletePaymentMethodMutation.isPending}
            >
              Cancel
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
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full Order History Dialog */}
      <Dialog open={showOrdersDialog} onOpenChange={setShowOrdersDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Order History</DialogTitle>
            <DialogDescription>
              View all your past orders and invoices.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders?.map((order: CustomerOrder) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm">
                      #{order.id.slice(-6)}
                    </TableCell>
                    <TableCell>
                      {format(new Date(order.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>{order.product?.name ?? '-'}</TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(order.totalAmount, order.currency)}
                    </TableCell>
                    <TableCell>{getOrderStatusBadge(order.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowOrdersDialog(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
