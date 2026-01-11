import type { Polar } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';

interface CreateCustomerSessionOptions {
  polar: Polar;
  supabase: TypedSupabaseClient;
  userId: string;
}

/**
 * Create a Polar customer session with automatic fallback.
 *
 * First attempts to create a session using the external customer ID (user.id).
 * If that fails (customer not found), searches for the customer by email
 * and creates a session using the Polar customer ID.
 *
 * This handles existing Polar customers that were created before external ID tracking.
 */
export async function createCustomerSessionWithFallback({
  polar,
  supabase,
  userId,
}: CreateCustomerSessionOptions) {
  // Try to create customer session using external customer ID
  try {
    const session = await polar.customerSessions.create({
      externalCustomerId: userId,
    });
    return session;
  } catch (externalIdError) {
    // If external ID lookup fails, try to find customer by email
    console.log(
      'External customer ID lookup failed, trying email lookup:',
      externalIdError instanceof Error
        ? externalIdError.message
        : 'Unknown error'
    );

    // Get user email from user_private_details
    const { data: userDetails, error: emailError } = await supabase
      .from('user_private_details')
      .select('email, full_name, ...users(display_name)')
      .eq('user_id', userId)
      .single();

    if (emailError || !userDetails?.email) {
      throw new Error('Unable to retrieve user email for customer lookup');
    }

    // Search for customer by email in Polar
    const customersResponse = await polar.customers.list({
      email: userDetails.email,
    });

    const customers = customersResponse.result?.items || [];

    if (customers.length === 0) {
      // Create new customer if not found
      console.log(
        'Customer not found in Polar by email, creating new customer...'
      );
      const newCustomer = await polar.customers.create({
        email: userDetails.email,
        name: userDetails.full_name || userDetails.display_name || undefined,
        externalId: userId,
      });

      if (!newCustomer) {
        throw new Error('Failed to create new customer in Polar');
      }

      console.log('Created new Polar customer:', newCustomer.id);

      // Create session with new customer ID
      return await polar.customerSessions.create({
        customerId: newCustomer.id,
      });
    }

    // Use the first matching customer's ID to create session
    const polarCustomerId = customers[0]?.id;
    if (!polarCustomerId) {
      throw new Error('Customer not found in Polar by email or external ID');
    }
    const session = await polar.customerSessions.create({
      customerId: polarCustomerId,
    });

    return session;
  }
}
