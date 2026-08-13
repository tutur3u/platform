'use server';

import type {
  Address,
  AddressInput,
  CustomerPaymentMethod,
} from '@tuturuuu/payment/polar';
import { createPolarClient } from '@tuturuuu/payment/polar/server';
import {
  createCustomerSession,
  getOrCreatePolarCustomer,
} from '@tuturuuu/payment-core/customer-helper';
import {
  resolveSatellitePageActor,
  type SatelliteRequestActorContext,
} from '@tuturuuu/satellite/workspace-access';

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

type BillingCountry = NonNullable<Address['country']>;
type BillingCountryInput = NonNullable<AddressInput['country']>;

export interface WorkspaceBillingDetails {
  email: string;
  name: string;
  billingAddress: {
    line1: string;
    line2: string;
    postalCode: string;
    city: string;
    country: BillingCountry;
  };
  taxId: string;
}

export interface UpdateWorkspaceBillingDetailsInput {
  email: string;
  name: string;
  billingAddress: {
    line1: string;
    line2: string;
    postalCode: string;
    city: string;
    country: BillingCountryInput;
  };
  taxId: string;
}

/**
 * Check if user has permission to manage subscriptions in the workspace
 */
async function checkManageSubscriptionPermission(
  wsId: string,
  actor: SatelliteRequestActorContext
): Promise<boolean> {
  const { data, error } = await actor.admin.rpc('has_workspace_permission', {
    p_ws_id: wsId,
    p_user_id: actor.user.id,
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
    const actor = await resolveSatellitePageActor(['pay', 'platform']);
    if (!actor) {
      return {
        success: false,
        error: 'Unauthorized - please log in',
      };
    }

    const hasPermission = await checkManageSubscriptionPermission(wsId, actor);

    if (!hasPermission) {
      return {
        success: false,
        error: 'Unauthorized - missing permissions',
      };
    }

    const polar = createPolarClient();
    const supabase = actor.admin;

    const polarCustomer = await getOrCreatePolarCustomer({
      polar,
      supabase,
      wsId,
    });

    const customer = await polar.customers.get({
      id: polarCustomer.id,
    });

    const firstTaxId =
      customer.taxId?.find(
        (value): value is string =>
          typeof value === 'string' && value.trim().length > 0
      ) ?? '';

    return {
      success: true,
      data: {
        email: customer.email ?? '',
        name: customer.name ?? '',
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
    const actor = await resolveSatellitePageActor(['pay', 'platform']);
    if (!actor) {
      return {
        success: false,
        error: 'Unauthorized - please log in',
      };
    }

    const hasPermission = await checkManageSubscriptionPermission(wsId, actor);

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
    const supabase = actor.admin;

    const polarCustomer = await getOrCreatePolarCustomer({
      polar,
      supabase,
      wsId,
    });

    const normalizedBillingAddress: AddressInput = {
      country: payload.billingAddress.country as AddressInput['country'],
      line1: payload.billingAddress.line1.trim() || null,
      line2: payload.billingAddress.line2.trim() || null,
      postalCode: payload.billingAddress.postalCode.trim() || null,
      city: payload.billingAddress.city.trim() || null,
      state: null,
    };

    const normalizedname = payload.name.trim();
    const normalizedTaxId = payload.taxId.trim();

    await polar.customers.update({
      id: polarCustomer.id,
      customerUpdate: {
        email: normalizedEmail,
        name: normalizedname || null,
        billingAddress: normalizedBillingAddress,
        taxId: normalizedTaxId || null,
      },
    });

    return {
      success: true,
      data: {
        email: normalizedEmail,
        name: normalizedname,
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
    const actor = await resolveSatellitePageActor(['pay', 'platform']);
    if (!actor) {
      return {
        success: false,
        error: 'Unauthorized - please log in',
      };
    }

    const hasPermission = await checkManageSubscriptionPermission(wsId, actor);

    if (!hasPermission) {
      return {
        success: false,
        error: 'Unauthorized - missing permissions',
      };
    }

    const polar = createPolarClient();
    const supabase = actor.admin;

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
    const actor = await resolveSatellitePageActor(['pay', 'platform']);
    if (!actor) {
      return {
        success: false,
        error: 'Unauthorized - please log in',
      };
    }

    const hasPermission = await checkManageSubscriptionPermission(wsId, actor);

    if (!hasPermission) {
      return {
        success: false,
        error: 'Unauthorized - missing permissions',
      };
    }

    const polar = createPolarClient();
    const supabase = actor.admin;

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
    const actor = await resolveSatellitePageActor(['pay', 'platform']);
    if (!actor) {
      return {
        success: false,
        error: 'Unauthorized - please log in',
      };
    }

    const polar = createPolarClient();
    const { admin: supabase, user } = actor;

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

    const polarCustomer = await getOrCreatePolarCustomer({
      polar,
      supabase,
      wsId: personalWorkspace.id,
    });

    // Update customer billing address
    await polar.customers.update({
      id: polarCustomer.id,
      customerUpdate: {
        name,
        billingAddress: address,
      },
    });

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
    const actor = await resolveSatellitePageActor(['pay', 'platform']);
    if (!actor) {
      return {
        success: false,
        error: 'Unauthorized - please log in',
      };
    }

    const hasPermission = await checkManageSubscriptionPermission(wsId, actor);

    if (!hasPermission) {
      return {
        success: false,
        error: 'Unauthorized - missing permissions',
      };
    }

    const polar = createPolarClient();
    const supabase = actor.admin;

    // Create customer session to get portal URL
    const session = await createCustomerSession({
      polar,
      supabase,
      wsId,
    });

    return {
      success: true,
      data: {
        url: session.customerPortalUrl,
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
