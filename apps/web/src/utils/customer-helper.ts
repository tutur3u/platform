import type { Polar } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { generateEmailSubaddressing } from '@tuturuuu/utils/email/client';
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
  const polarCustomer = await getOrCreatePolarCustomer({
    polar,
    supabase,
    wsId,
  });

  const session = await polar.customerSessions.create({
    customerId: polarCustomer.id,
  });

  return session;
}

/**
 * Get or create a Polar customer for the given workspace.
 * First attempts to retrieve existing customer, creates new one if not found.
 */
export async function getOrCreatePolarCustomer({
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
  const isPersonalWorkspace = workspace.personal;
  const externalId = isPersonalWorkspace
    ? ownerId
    : convertWorkspaceIDToExternalID(wsId);

  // Try to get existing customer first
  try {
    const customer = await polar.customers.getExternal({
      externalId,
    });

    console.log(
      `Found existing Polar customer for workspace ${wsId} (personal: ${isPersonalWorkspace})`
    );

    return customer;
  } catch (_error) {
    // Customer not found, will create new one
    console.log(
      `No existing Polar customer found for workspace ${wsId}, creating new one`
    );
  }

  // Create new customer
  const ownerEmail = workspace.users?.user_private_details?.email;

  if (!ownerEmail) {
    throw new Error('Unable to retrieve workspace owner email');
  }

  console.log(
    `Creating Polar customer for workspace ${wsId} (personal: ${isPersonalWorkspace})`
  );

  const newCustomer = await polar.customers.create({
    email: isPersonalWorkspace
      ? ownerEmail
      : generateEmailSubaddressing(ownerEmail, wsId),
    name: isPersonalWorkspace ? workspace.users.display_name : workspace.name,
    externalId,
    type: isPersonalWorkspace ? 'individual' : 'team',
  });

  console.log('Created new Polar customer:', newCustomer);

  return newCustomer;
}
