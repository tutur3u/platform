'use server';

import type {
  AddressInput,
  CountryAlpha2,
  CountryAlpha2Input,
  CustomerPaymentMethod,
} from '@tuturuuu/payment/polar';
import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import {
  createCustomerSession,
  getOrCreatePolarCustomer,
} from '@/utils/customer-helper';

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface WorkspaceBillingDetails {
  email: string;
  billingName: string;
  billingAddress: {
    line1: string;
    line2: string;
    postalCode: string;
    city: string;
    country: CountryAlpha2;
  };
  taxId: string;
}

export interface UpdateWorkspaceBillingDetailsInput {
  email: string;
  billingName: string;
  billingAddress: {
    line1: string;
    line2: string;
    postalCode: string;
    city: string;
    country: CountryAlpha2Input;
  };
  taxId: string;
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
 * Get editable billing details for workspace customer.
 */
export async function getWorkspaceBillingDetails(
  wsId: string
): Promise<ActionResult<WorkspaceBillingDetails>> {
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

    const session = await createCustomerSession({
      polar,
      supabase,
      wsId,
    });

    const customer = await polar.customerPortal.customers.get({
      customerSession: session.token,
    });

    const firstTaxId =
      customer.taxId?.find(
        (value): value is string =>
          typeof value === 'string' && value.trim().length > 0
      ) ?? '';

    return {
      success: true,
      data: {
        email: customer.email,
        billingName: customer.billingName ?? '',
        billingAddress: {
          line1: customer.billingAddress?.line1 ?? '',
          line2: customer.billingAddress?.line2 ?? '',
          postalCode: customer.billingAddress?.postalCode ?? '',
          city: customer.billingAddress?.city ?? '',
          country: customer.billingAddress?.country ?? 'US',
        },
        taxId: firstTaxId,
      },
    };
  } catch (error) {
    console.error('Failed to fetch workspace billing details:', error);
    return {
      success: false,
      error: 'Failed to fetch workspace billing details',
    };
  }
}

/**
 * Update editable billing details for workspace customer.
 * Note: Email is updated through core customers API, while billing details use customer portal API.
 */
export async function updateWorkspaceBillingDetails(
  wsId: string,
  payload: UpdateWorkspaceBillingDetailsInput
): Promise<ActionResult<WorkspaceBillingDetails>> {
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

    const normalizedEmail = payload.email.trim();

    if (!normalizedEmail) {
      return {
        success: false,
        error: 'Email is required',
      };
    }

    const polar = createPolarClient();
    const supabase = await createClient();

    const polarCustomer = await getOrCreatePolarCustomer({
      polar,
      supabase,
      wsId,
    });

    const normalizedBillingAddress: AddressInput = {
      country: payload.billingAddress.country ?? undefined,
      line1: payload.billingAddress.line1.trim() || null,
      line2: payload.billingAddress.line2.trim() || null,
      postalCode: payload.billingAddress.postalCode.trim() || null,
      city: payload.billingAddress.city.trim() || null,
      state: null,
    };

    const normalizedBillingName = payload.billingName.trim();
    const normalizedTaxId = payload.taxId.trim();

    await polar.customers.update({
      id: polarCustomer.id,
      customerUpdate: {
        email: normalizedEmail,
        name: normalizedBillingName || null,
        billingAddress: normalizedBillingAddress,
        taxId: [normalizedTaxId || null],
      },
    });

    return {
      success: true,
      data: {
        email: normalizedEmail,
        billingName: normalizedBillingName,
        billingAddress: {
          line1: payload.billingAddress.line1.trim(),
          line2: payload.billingAddress.line2.trim(),
          postalCode: payload.billingAddress.postalCode.trim(),
          city: payload.billingAddress.city.trim(),
          country: payload.billingAddress.country,
        },
        taxId: normalizedTaxId,
      },
    };
  } catch (error) {
    console.error('Failed to update workspace billing details:', error);
    return {
      success: false,
      error: 'Failed to update workspace billing details',
    };
  }
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
      error: 'Failed to fetch payment methods',
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
      error: 'Failed to delete payment method',
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

    // Get the user's personal workspace to use for billing
    const { data: personalWorkspace } = await supabase
      .from('workspaces')
      .select('id')
      .eq('creator_id', user.id)
      .eq('personal', true)
      .single();

    if (!personalWorkspace) {
      return {
        success: false,
        error: 'Personal workspace not found',
      };
    }

    // Create a customer session to authenticate with customer portal
    const session = await createCustomerSession({
      polar,
      supabase,
      wsId: personalWorkspace.id,
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
      error: 'Failed to update billing address',
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
      error: 'Failed to get customer portal URL',
    };
  }
}
