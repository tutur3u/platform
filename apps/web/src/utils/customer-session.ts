import type { Polar } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';

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
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('id', wsId)
    .single();

  if (!workspace) {
    throw new Error('Workspace not found');
  }

  const session = await polar.customerSessions.create({
    externalCustomerId: wsId,
  });

  return session;
}

/**
 * Get or create a Polar customer for the given workspace.
 *
 * Searches for an existing customer by workspace owner email.
 * If no customer exists, creates a new one with:
 * - Name: workspace name
 * - External ID: workspace ID
 * - Email: workspace owner email
 *
 * Returns the Polar customer ID.
 */
export async function getOrCreatePolarCustomer({
  polar,
  supabase,
  wsId,
}: GetOrCreateCustomerOptions): Promise<string> {
  // Get workspace with owner email (join through users table)
  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .select(
      'id, name, creator_id, users!creator_id(user_private_details(email))'
    )
    .eq('id', wsId)
    .single();

  if (workspaceError || !workspace) {
    throw new Error('Unable to retrieve workspace information');
  }

  const ownerEmail = workspace.users?.user_private_details?.email;
  if (!ownerEmail) {
    throw new Error('Unable to retrieve workspace owner email');
  }

  // Search for customer by email in Polar
  const customersResponse = await polar.customers.list({
    email: ownerEmail,
  });

  const customers = customersResponse.result?.items || [];

  if (customers.length === 0) {
    // Create new customer if not found
    console.log('Customer not found in Polar, creating new customer...');
    const newCustomer = await polar.customers.create({
      email: ownerEmail,
      name: workspace.name || undefined,
      externalId: wsId,
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
