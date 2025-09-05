import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

interface InvoiceProduct {
  product_id: string;
  unit_id: string;
  warehouse_id: string;
  quantity: number;
  price: number;
  category_id: string;
}

interface CreateInvoiceRequest {
  customer_id: string;
  content: string;
  notes?: string;
  wallet_id: string;
  promotion_id?: string;
  products: InvoiceProduct[];
  subtotal: number;
  discount_amount: number;
  total: number;
  category_id: string;
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;

  try {
    const {
      customer_id,
      content,
      notes,
      wallet_id,
      promotion_id,
      products,
      subtotal,
      discount_amount,
      total,
      category_id,
    }: CreateInvoiceRequest = await req.json();

    // Validate required fields
    if (
      !customer_id ||
      !products ||
      products.length === 0 ||
      !wallet_id ||
      !category_id
    ) {
      return NextResponse.json(
        {
          message:
            'Missing required fields: customer_id, products, wallet_id, and category_id',
        },
        { status: 400 }
      );
    }

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Get user workspace ID
    let workspaceUserId: string | null = null;
    let workspaceUserGroup: string | null = null;
    if (user) {
      const { data: workspaceUser } = await supabase
        .from('workspace_user_linked_users')
        .select('virtual_user_id ')
        .eq('platform_user_id', user.id)
        .eq('ws_id', wsId)
        .single();

      workspaceUserId = workspaceUser?.virtual_user_id || null;
    }

    const invoiceData: any = {
      ws_id: wsId,
      customer_id,
      price: total,
      total_diff: total - subtotal,
      note: content,
      notice: notes,
      wallet_id,
      category_id,
      completed_at: new Date().toISOString(),
      valid_until: new Date(
        Date.now() + 1000 * 60 * 60 * 24 * 30
      ).toISOString(),
      paid_amount: total,
    };

    // Only add optional fields if they have values
    if (workspaceUserId) {
      invoiceData.creator_id = workspaceUserId;
    }
    if (workspaceUserGroup) {
      invoiceData.user_group_id = workspaceUserGroup;
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from('finance_invoices')
      .insert(invoiceData)
      .select('id')
      .single();

    if (invoiceError) {
      console.error('Error creating invoice:', invoiceError);
      return NextResponse.json(
        { message: 'Error creating invoice', details: invoiceError.message },
        { status: 500 }
      );
    }

    const invoiceId = invoice.id;

    // Insert invoice products with correct field mapping
    // First, deduplicate products by creating a unique key and combining quantities if duplicates exist
    const productMap = new Map();

    products.forEach((product) => {
      const key = `${product.product_id}-${product.unit_id}-${product.warehouse_id}-${product.price}`;
      if (productMap.has(key)) {
        // If duplicate exists, combine quantities
        const existing = productMap.get(key);
        existing.quantity += product.quantity;
      } else {
        productMap.set(key, { ...product });
      }
    });

    // Get product name  from workspace_products
    const { data: productsData, error: productsError } = await supabase
      .from('workspace_products')
      .select('name, id')
      .in(
        'id',
        Array.from(productMap.values()).map((product) => product.product_id)
      )
      .eq('ws_id', wsId);

    if (productsError) {
      console.error('Error getting products information:', productsError);
      return NextResponse.json(
        {
          message: 'Error getting products information',
          details: productsError.message,
        },
        { status: 500 }
      );
    }

    const unitIds = Array.from(productMap.values()).map(
      (product) => product.unit_id
    );

    // Get unit from inventory_units
    const { data: unitsData, error: unitsError } = await supabase
      .from('inventory_units')
      .select('name, id')
      .in('id', unitIds)
      .eq('ws_id', wsId);

    if (unitsError) {
      console.error('Error getting units information:', unitsError);
      return NextResponse.json(
        {
          message: 'Error getting units information',
          details: unitsError.message,
        },
        { status: 500 }
      );
    }

    const invoiceProducts = Array.from(productMap.values()).map((product) => ({
      invoice_id: invoiceId,
      product_name:
        productsData.find((p) => p.id === product.product_id)?.name || '',
      product_unit:
        unitsData.find((unit) => unit.id === product.unit_id)?.name || '',
      product_id: product.product_id,
      unit_id: product.unit_id,
      warehouse_id: product.warehouse_id,
      amount: product.quantity,
      price: product.price,
    }));

    const { error: invoiceProductsError } = await supabase
      .from('finance_invoice_products')
      .insert(invoiceProducts);

    if (invoiceProductsError) {
      console.error('Error creating invoice products:', invoiceProductsError);
      // Rollback: delete the created invoice and transaction
      await Promise.all([
        supabase.from('finance_invoices').delete().eq('id', invoiceId),
      ]);
      return NextResponse.json(
        {
          message: 'Error creating invoice products',
          details: invoiceProductsError.message,
        },
        { status: 500 }
      );
    }

    // Insert promotion if provided
    if (promotion_id && promotion_id !== 'none' && discount_amount > 0) {
      // Get Promotion use-ratio from workspace_promotions
      const { data: promotion, error: promotionFetchError } = await supabase
        .from('workspace_promotions')
        .select('use_ratio')
        .eq('id', promotion_id)
        .single();

      if (promotionFetchError) {
        console.error('Error getting promotion:', promotionFetchError);
        console.warn('Continuing without promotion due to fetch error');
      }
      // Only insert promotion if we successfully fetched promotion data or use default
      if (!promotionFetchError || promotion) {
        const { error: promotionError } = await supabase
          .from('finance_invoice_promotions')
          .insert({
            invoice_id: invoiceId,
            promo_id: promotion_id,
            value: discount_amount,
            use_ratio: promotion?.use_ratio || true,
          });

        if (promotionError) {
          console.error('Error creating invoice promotion:', promotionError);
          // Rollback: delete all created records
          await Promise.all([
            supabase
              .from('finance_invoice_products')
              .delete()
              .eq('invoice_id', invoiceId),
            supabase.from('finance_invoices').delete().eq('id', invoiceId),
          ]);
          return NextResponse.json(
            {
              message: 'Error applying promotion to invoice',
              details: promotionError.message,
            },
            { status: 500 }
          );
        }
      }
    }

    // Create stock changes for each product (using deduplicated products)
    const stockChanges = Array.from(productMap.values()).map((product) => ({
      product_id: product.product_id,
      unit_id: product.unit_id,
      warehouse_id: product.warehouse_id,
      amount: -product.quantity, // Negative because it's being sold
      creator_id: workspaceUserId || '',
      beneficiary_id: customer_id,
    }));

    const { error: stockError } = await supabase
      .from('product_stock_changes')
      .insert(stockChanges);

    if (stockError) {
      console.error('Error creating stock changes:', stockError);
      // Rollback: delete all created records
      await Promise.all([
        supabase
          .from('finance_invoice_promotions')
          .delete()
          .eq('invoice_id', invoiceId),
        supabase
          .from('finance_invoice_products')
          .delete()
          .eq('invoice_id', invoiceId),
        supabase.from('finance_invoices').delete().eq('id', invoiceId),
      ]);
      return NextResponse.json(
        {
          message: 'Error updating product stock',
          details: stockError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Invoice created successfully',
      invoice_id: invoiceId,
      data: {
        id: invoiceId,
        customer_id,
        total,
        subtotal,
        discount_amount,
        products_count: products.length,
      },
    });
  } catch (error) {
    console.error('Unexpected error creating invoice:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
