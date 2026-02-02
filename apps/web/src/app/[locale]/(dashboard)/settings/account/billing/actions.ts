'use server';

import type {
  Address,
  AddressInput,
  CustomerOrder,
  CustomerPaymentMethod,
} from '@tuturuuu/payment/polar';
import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { createCustomerSession } from '@/utils/customer-session';

interface BillingData {
  customer: {
    id: string;
    email: string;
    name?: string;
    billingName?: string;
    billingAddress?: Address;
    defaultPaymentMethodId?: string;
  } | null;
  paymentMethods: CustomerPaymentMethod[];
  orders: CustomerOrder[];
}

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Get billing data including customer info, payment methods, and order history
 */
export async function getBillingData(): Promise<ActionResult<BillingData>> {
  try {
    const user = await getCurrentSupabaseUser();

    if (!user) {
      return {
        success: false,
        error: 'Unauthorized - please log in',
      };
    }

    const polar = createPolarClient();
    const supabase = await createClient();

    // Create a customer session to authenticate with customer portal
    const session = await createCustomerSession({
      polar,
      supabase,
      wsId: 'FAKE_WS_ID',
    });

    // Fetch customer data using customer portal API
    const customer = await polar.customerPortal.customers.get({
      customerSession: session.token,
    });

    // Fetch orders using customer portal API
    const ordersIterator = await polar.customerPortal.orders.list(
      {
        customerSession: session.token,
      },
      {
        limit: 100,
      }
    );

    // Get the first page of orders
    const orders = ordersIterator?.result?.items ?? [];

    // Fetch payment methods using customer portal API
    const paymentMethodsIterator =
      await polar.customerPortal.customers.listPaymentMethods(
        {
          customerSession: session.token,
        },
        {
          limit: 100,
        }
      );

    // Get the first page of payment methods
    const paymentMethods = paymentMethodsIterator?.result?.items ?? [];

    return {
      success: true,
      data: {
        customer: customer
          ? {
              id: customer.id,
              email: customer.email,
              name: customer.name ?? undefined,
              billingName: customer.billingName ?? undefined,
              billingAddress: customer.billingAddress ?? undefined,
              defaultPaymentMethodId:
                customer.defaultPaymentMethodId ?? undefined,
            }
          : null,
        paymentMethods,
        orders,
      },
    };
  } catch (error) {
    console.error('Failed to fetch billing data:', error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to fetch billing data',
    };
  }
}

/**
 * Update billing address for the current user
 */
export async function updateBillingAddress(
  name: string,
  address: AddressInput
): Promise<ActionResult> {
  try {
    const user = await getCurrentSupabaseUser();

    if (!user) {
      return {
        success: false,
        error: 'Unauthorized - please log in',
      };
    }

    const polar = createPolarClient();
    const supabase = await createClient();

    // Create a customer session to authenticate with customer portal
    const session = await createCustomerSession({
      polar,
      supabase,
      wsId: 'FAKE_WS_ID',
    });

    // Update customer billing address using customer portal API
    await polar.customerPortal.customers.update(
      {
        customerSession: session.token,
      },
      {
        billingName: name,
        billingAddress: address,
      }
    );

    return {
      success: true,
    };
  } catch (error) {
    console.error('Failed to update billing address:', error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to update billing address',
    };
  }
}

/**
 * Delete a payment method
 */
export async function deletePaymentMethod(
  paymentMethodId: string
): Promise<ActionResult> {
  try {
    const user = await getCurrentSupabaseUser();

    if (!user) {
      return {
        success: false,
        error: 'Unauthorized - please log in',
      };
    }

    const polar = createPolarClient();
    const supabase = await createClient();

    // Create a customer session to authenticate with customer portal
    const session = await createCustomerSession({
      polar,
      supabase,
      wsId: 'FAKE_WS_ID',
    });

    // Delete payment method using customer portal API
    await polar.customerPortal.customers.deletePaymentMethod(
      {
        customerSession: session.token,
      },
      {
        id: paymentMethodId,
      }
    );

    return {
      success: true,
    };
  } catch (error) {
    console.error('Failed to delete payment method:', error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to delete payment method',
    };
  }
}

/**
 * Get customer portal URL for managing payment methods
 */
export async function getCustomerPortalUrl(): Promise<
  ActionResult<{ url: string }>
> {
  try {
    const user = await getCurrentSupabaseUser();

    if (!user) {
      return {
        success: false,
        error: 'Unauthorized - please log in',
      };
    }

    const polar = createPolarClient();
    const supabase = await createClient();

    // Create customer session to get portal URL
    const session = await createCustomerSession({
      polar,
      supabase,
      wsId: 'FAKE_WS_ID',
    });

    return {
      success: true,
      data: {
        url: session.customerPortalUrl ?? '',
      },
    };
  } catch (error) {
    console.error('Failed to get customer portal URL:', error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to get customer portal URL',
    };
  }
}
