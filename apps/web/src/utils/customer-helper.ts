import type { Polar } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { convertWorkspaceIDToExternalID } from './subscription-helper';

interface CreateCustomerSessionOptions {
  polar: Polar;
  supabase: TypedSupabaseClient;
  wsId: string;
}

interface GetOrCreateCustomerOptions {
  polar: Polar;
  supabase: TypedSupabaseClient;
  wsId: string;
}

/**
 * Create a Polar customer session by workspace ID.
 */
export async function createCustomerSession({
  polar,
  supabase,
  wsId,
}: CreateCustomerSessionOptions) {
  const polarCustomerId = await createPolarCustomer({
    polar,
    supabase,
    wsId,
  });

  const session = await polar.customerSessions.create({
    customerId: polarCustomerId,
  });

  return session;
}

/**
 * Get or create a Polar customer for the given workspace.
 *
 * Searches for an existing customer by:
 * 1. External ID: workspace_[wsId] (New format)
 * 2. External ID: workspace owner's user_id (Legacy format)
 * 3. Email: workspace owner's email
 *
 * If no customer exists, creates a new one with:
 * - Name: workspace name
 * - External ID: workspace_[wsId]
 * - Email: workspace owner email
 *
 * Returns the Polar customer ID.
 */
export async function createPolarCustomer({
  polar,
  supabase,
  wsId,
}: GetOrCreateCustomerOptions) {
  // Get workspace with owner email (join through users table)
  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .select('*, users!creator_id(display_name, user_private_details(email))')
    .eq('id', wsId)
    .single();

  if (workspaceError || !workspace) {
    throw new Error('Unable to retrieve workspace information');
  }

  const ownerId = workspace.creator_id;
  const ownerEmail = workspace.users?.user_private_details?.email;

  if (!ownerEmail) {
    throw new Error('Unable to retrieve workspace owner email');
  }

  // 1. Try finding by new external ID format (workspace_[wsId])
  try {
    const customer = await polar.customers.getExternal({
      externalId: convertWorkspaceIDToExternalID(wsId),
    });
    if (customer?.id) return customer.id;
  } catch (_error) {
    // Silently continue to next fallback
  }

  // 2. Try finding by legacy external ID format (owner's user_id)
  if (ownerId) {
    try {
      const customer = await polar.customers.getExternal({
        externalId: ownerId,
      });
      if (customer?.id) return customer.id;
    } catch (_error) {
      // Silently continue to next fallback
    }
  }

  // 3. Search for customer by email in Polar as final fallback
  const customersResponse = await polar.customers.list({
    email: ownerEmail,
  });

  const customers = customersResponse.result?.items || [];

  if (customers.length === 0) {
    // Create new customer if not found
    console.log('Customer not found in Polar, creating new customer...');

    const isPersonalWorkspace = workspace.personal;

    const newCustomer = await polar.customers.create({
      email: ownerEmail,
      name: isPersonalWorkspace ? workspace.users.display_name : workspace.name,
      externalId: isPersonalWorkspace
        ? ownerId
        : convertWorkspaceIDToExternalID(wsId),
    });

    if (!newCustomer?.id) {
      throw new Error('Failed to create new customer in Polar');
    }

    console.log('Created new Polar customer:', newCustomer.id);
    return newCustomer.id;
  }

  // Return the first matching customer's ID
  const polarCustomerId = customers[0]?.id;
  if (!polarCustomerId) {
    throw new Error('Customer not found in Polar by email');
  }

  return polarCustomerId;
}
