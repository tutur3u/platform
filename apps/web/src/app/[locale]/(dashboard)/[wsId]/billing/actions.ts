'use server';

import type { CustomerPaymentMethod } from '@tuturuuu/payment/polar';
import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { createCustomerSession } from '@/utils/customer-helper';

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Check if user has permission to manage subscriptions in the workspace
 */
async function checkManageSubscriptionPermission(
  wsId: string,
  userId: string
): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('has_workspace_permission', {
    p_ws_id: wsId,
    p_user_id: userId,
    p_permission: 'manage_subscription',
  });

  if (error) {
    console.error('Error checking manage_subscription permission:', error);
    return false;
  }

  return data ?? false;
}

/**
 * Get workspace payment methods (cards only)
 */
export async function getWorkspacePaymentMethods(
  wsId: string
): Promise<ActionResult<CustomerPaymentMethod[]>> {
  try {
    const user = await getCurrentSupabaseUser();

    if (!user) {
      return {
        success: false,
        error: 'Unauthorized - please log in',
      };
    }

    const hasPermission = await checkManageSubscriptionPermission(
      wsId,
      user.id
    );

    if (!hasPermission) {
      return {
        success: false,
        error: 'Unauthorized - missing permissions',
      };
    }

    const polar = createPolarClient();
    const supabase = await createClient();

    // Create a customer session to authenticate with customer portal
    const session = await createCustomerSession({
      polar,
      supabase,
      wsId,
    });

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

    // Get the first page of payment methods and filter for cards
    const allPaymentMethods = paymentMethodsIterator?.result?.items ?? [];
    const cardPaymentMethods = allPaymentMethods.filter(
      (pm) => pm.type === 'card'
    );

    return {
      success: true,
      data: cardPaymentMethods,
    };
  } catch (error) {
    console.error('Failed to fetch workspace payment methods:', error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to fetch payment methods',
    };
  }
}

/**
 * Delete a workspace payment method
 */
export async function deleteWorkspacePaymentMethod(
  wsId: string,
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

    const hasPermission = await checkManageSubscriptionPermission(
      wsId,
      user.id
    );

    if (!hasPermission) {
      return {
        success: false,
        error: 'Unauthorized - missing permissions',
      };
    }

    const polar = createPolarClient();
    const supabase = await createClient();

    // Create a customer session to authenticate with customer portal
    const session = await createCustomerSession({
      polar,
      supabase,
      wsId,
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
    console.error('Failed to delete workspace payment method:', error);
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
 * Get customer portal URL for adding payment methods
 */
export async function getWorkspaceCustomerPortalUrl(
  wsId: string
): Promise<ActionResult<{ url: string }>> {
  try {
    const user = await getCurrentSupabaseUser();

    if (!user) {
      return {
        success: false,
        error: 'Unauthorized - please log in',
      };
    }

    const hasPermission = await checkManageSubscriptionPermission(
      wsId,
      user.id
    );

    if (!hasPermission) {
      return {
        success: false,
        error: 'Unauthorized - missing permissions',
      };
    }

    const polar = createPolarClient();
    const supabase = await createClient();

    // Create customer session to get portal URL
    const session = await createCustomerSession({
      polar,
      supabase,
      wsId,
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
