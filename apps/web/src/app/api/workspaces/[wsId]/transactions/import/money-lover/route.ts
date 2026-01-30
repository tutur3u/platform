import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface MoneyLoverTransaction {
  id: string;
  date: string; // DD/MM/YYYY
  category: string;
  amount: string;
  currency: string;
  note: string;
  wallet: string;
}

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    console.log('[Money Lover Import] Starting import for workspace:', wsId);

    // Get the current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error('[Money Lover Import] Unauthorized - no user found');
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Money Lover Import] User authenticated:', user.id);

    // Get workspace user ID from linked users table
    const { data: linkedUser, error: linkedUserError } = await supabase
      .from('workspace_user_linked_users')
      .select('virtual_user_id')
      .eq('ws_id', wsId)
      .eq('platform_user_id', user.id)
      .single();

    if (linkedUserError || !linkedUser) {
      console.error(
        '[Money Lover Import] User not linked to workspace:',
        linkedUserError
      );
      return NextResponse.json(
        { message: 'User not found in workspace' },
        { status: 403 }
      );
    }

    const workspaceUserId = linkedUser.virtual_user_id;
    console.log('[Money Lover Import] Workspace user ID:', workspaceUserId);

    const formData = await req.formData();
    const transactionsJson = formData.get('transactions') as string;

    if (!transactionsJson) {
      console.error('[Money Lover Import] No transactions data in request');
      return NextResponse.json(
        { message: 'No transactions data provided' },
        { status: 400 }
      );
    }

    const transactions: MoneyLoverTransaction[] = JSON.parse(transactionsJson);

    console.log(
      '[Money Lover Import] Parsed transactions:',
      transactions.length
    );

    if (transactions.length === 0) {
      console.error('[Money Lover Import] Empty transactions array');
      return NextResponse.json(
        { message: 'No transactions found in the file' },
        { status: 400 }
      );
    }

    // Get all existing categories and wallets for this workspace
    const { data: existingCategories, error: categoriesError } = await supabase
      .from('transaction_categories')
      .select('id, name, is_expense')
      .eq('ws_id', wsId);

    if (categoriesError) {
      console.error(
        '[Money Lover Import] Error fetching categories:',
        categoriesError
      );
    } else {
      console.log(
        '[Money Lover Import] Found existing categories:',
        existingCategories?.length || 0
      );
    }

    const { data: existingWallets, error: walletsError } = await supabase
      .from('workspace_wallets')
      .select('id, name')
      .eq('ws_id', wsId);

    if (walletsError) {
      console.error(
        '[Money Lover Import] Error fetching wallets:',
        walletsError
      );
    } else {
      console.log(
        '[Money Lover Import] Found existing wallets:',
        existingWallets?.length || 0
      );
    }

    const categoryMap = new Map(
      existingCategories?.map((c) => [c.name.toLowerCase(), c]) || []
    );
    const walletMap = new Map(
      existingWallets?.map((w) => [w?.name?.toLowerCase(), w]) || []
    );

    // Helper function to parse DD/MM/YYYY to ISO date
    const parseDate = (dateStr: string): string => {
      const [day, month, year] = dateStr.split('/');
      return `${year}-${month?.padStart(2, '0')}-${day?.padStart(2, '0')}`;
    };

    const errors: string[] = [];

    // Step 1: Extract unique wallets from transactions
    console.log('[Money Lover Import] Step 1: Extracting unique wallets...');
    const uniqueWallets = new Set(
      transactions.map((t) => t.wallet).filter((w) => w?.trim())
    );
    console.log(
      '[Money Lover Import] Found unique wallets:',
      Array.from(uniqueWallets)
    );

    // Create missing wallets
    const walletsToCreate = Array.from(uniqueWallets).filter(
      (wallet) => !walletMap.has(wallet.toLowerCase())
    );

    if (walletsToCreate.length > 0) {
      console.log(
        '[Money Lover Import] Creating missing wallets:',
        walletsToCreate
      );
      const { data: newWallets, error: walletCreateError } = await supabase
        .from('workspace_wallets')
        .insert(
          walletsToCreate.map((wallet) => ({
            ws_id: wsId,
            name: wallet,
            balance: 0,
          }))
        )
        .select('id, name');

      if (walletCreateError) {
        console.error(
          '[Money Lover Import] Failed to create wallets:',
          walletCreateError
        );
        return NextResponse.json(
          { message: `Failed to create wallets: ${walletCreateError.message}` },
          { status: 500 }
        );
      }

      if (newWallets) {
        console.log('[Money Lover Import] Created wallets:', newWallets.length);
        newWallets.forEach((wallet) => {
          walletMap.set(wallet.name?.toLowerCase(), wallet);
        });
      }
    }

    // Step 2: Extract unique categories with their expense type
    console.log('[Money Lover Import] Step 2: Extracting unique categories...');
    const categoryTypeMap = new Map<string, boolean>(); // category name -> is_expense

    for (const transaction of transactions) {
      const categoryKey = transaction.category.toLowerCase();
      if (!categoryMap.has(categoryKey) && !categoryTypeMap.has(categoryKey)) {
        const amount = parseFloat(transaction.amount);
        if (!Number.isNaN(amount)) {
          categoryTypeMap.set(categoryKey, amount < 0);
        }
      }
    }

    const categoriesToCreate = Array.from(categoryTypeMap.entries()).filter(
      ([categoryKey]) => !categoryMap.has(categoryKey)
    );

    if (categoriesToCreate.length > 0) {
      console.log(
        '[Money Lover Import] Creating missing categories:',
        categoriesToCreate.map(([name]) => name)
      );
      const { data: newCategories, error: categoryCreateError } = await supabase
        .from('transaction_categories')
        .insert(
          categoriesToCreate.map(([categoryName, isExpense]) => ({
            ws_id: wsId,
            name: categoryName,
            is_expense: isExpense,
          }))
        )
        .select('id, name, is_expense');

      if (categoryCreateError) {
        console.error(
          '[Money Lover Import] Failed to create categories:',
          categoryCreateError
        );
        return NextResponse.json(
          {
            message: `Failed to create categories: ${categoryCreateError.message}`,
          },
          { status: 500 }
        );
      }

      if (newCategories) {
        console.log(
          '[Money Lover Import] Created categories:',
          newCategories.length
        );
        newCategories.forEach((category) => {
          categoryMap.set(category.name.toLowerCase(), category);
        });
      }
    }

    // Step 3: Prepare transactions for batch insert
    console.log(
      '[Money Lover Import] Step 3: Preparing transactions for batch insert...'
    );
    const transactionsToInsert: any[] = [];

    for (const transaction of transactions) {
      try {
        const amount = parseFloat(transaction.amount);
        if (Number.isNaN(amount)) {
          console.error(`[Money Lover Import] Invalid amount:`, transaction);
          errors.push(
            `Invalid amount "${transaction.amount}" for transaction on ${transaction.date}`
          );
          continue;
        }

        const walletKey = transaction.wallet.toLowerCase();
        const categoryKey = transaction.category.toLowerCase();

        const wallet = walletMap.get(walletKey);
        const category = categoryMap.get(categoryKey);

        if (!wallet) {
          errors.push(
            `Wallet "${transaction.wallet}" not found for transaction on ${transaction.date}`
          );
          continue;
        }

        const parsedDate = parseDate(transaction.date);

        transactionsToInsert.push({
          wallet_id: wallet.id,
          category_id: category?.id || null,
          amount: amount,
          description: transaction.note || null,
          taken_at: parsedDate,
          creator_id: workspaceUserId,
          report_opt_in: true,
        });
      } catch (error) {
        console.error(
          `[Money Lover Import] Error preparing transaction:`,
          error
        );
        errors.push(
          `Error processing transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    console.log(
      `[Money Lover Import] Prepared ${transactionsToInsert.length} transactions for insert`
    );

    // Step 4: Insert transactions in batches of 1000 with streaming progress
    console.log(
      '[Money Lover Import] Step 4: Inserting transactions in batches...'
    );
    const BATCH_SIZE = 1000;
    let imported = 0;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const totalBatches = Math.ceil(
            transactionsToInsert.length / BATCH_SIZE
          );

          for (let i = 0; i < transactionsToInsert.length; i += BATCH_SIZE) {
            const batch = transactionsToInsert.slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
            console.log(
              `[Money Lover Import] Inserting batch ${batchNumber}/${totalBatches}: ${batch.length} transactions`
            );

            const { error: insertError } = await supabase
              .from('wallet_transactions')
              .insert(batch);

            if (insertError) {
              console.error(
                `[Money Lover Import] Failed to insert batch:`,
                insertError
              );
              errors.push(
                `Failed to insert batch ${batchNumber}: ${insertError.message}`
              );
            } else {
              imported += batch.length;
              console.log(
                `[Money Lover Import] Successfully inserted batch ${batchNumber}. Total imported: ${imported}`
              );
            }

            // Send progress update
            const progressData = JSON.stringify({
              type: 'progress',
              current: imported,
              total: transactionsToInsert.length,
              batch: batchNumber,
              totalBatches,
            });
            controller.enqueue(encoder.encode(`data: ${progressData}\n\n`));
          }

          console.log(
            `[Money Lover Import] Import completed. Imported: ${imported}, Total: ${transactions.length}, Errors: ${errors.length}`
          );

          // Send final result
          const finalData = JSON.stringify({
            type: 'complete',
            imported,
            total: transactions.length,
            errors: errors.length > 0 ? errors : undefined,
          });
          controller.enqueue(encoder.encode(`data: ${finalData}\n\n`));
          controller.close();
        } catch (error) {
          console.error('[Money Lover Import] Stream error:', error);
          const errorData = JSON.stringify({
            type: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to import transactions',
      },
      { status: 500 }
    );
  }
}
