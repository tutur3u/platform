'use server';

import { createClient } from '@tuturuuu/supabase/next/server';
import { revalidatePath } from 'next/cache';

export async function deleteInvoice(wsId: string, invoiceId: string) {
  const supabase = await createClient();

  try {
    // Verify user is authenticated
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, message: 'Unauthorized' };
    }

    // Check if user has permission to delete invoices
    const { data: hasPermission } = await supabase.rpc(
      'has_workspace_permission',
      {
        p_ws_id: wsId,
        p_user_id: user.id,
        p_permission: 'delete_invoices',
      }
    );

    if (!hasPermission) {
      return { success: false, message: 'Insufficient permissions' };
    }

    // Check if the invoice exists and belongs to this workspace
    const { data: invoice, error: invoiceError } = await supabase
      .from('finance_invoices')
      .select('id, ws_id')
      .eq('id', invoiceId)
      .eq('ws_id', wsId)
      .single();

    if (invoiceError || !invoice) {
      return { success: false, message: 'Invoice not found' };
    }

    // Delete related records first (invoice products, promotions)
    await supabase
      .from('finance_invoice_products')
      .delete()
      .eq('invoice_id', invoiceId);

    await supabase
      .from('finance_invoice_promotions')
      .delete()
      .eq('invoice_id', invoiceId);

    // Delete the invoice
    const { error: deleteError } = await supabase
      .from('finance_invoices')
      .delete()
      .eq('id', invoiceId)
      .eq('ws_id', wsId);

    if (deleteError) {
      console.error('Error deleting invoice:', deleteError);
      return { success: false, message: 'Failed to delete invoice' };
    }

    // Revalidate the invoices page
    revalidatePath(`/${wsId}/finance/invoices`);

    return { success: true, message: 'Invoice deleted successfully' };
  } catch (error) {
    console.error('Unexpected error deleting invoice:', error);
    return { success: false, message: 'Internal server error' };
  }
}
