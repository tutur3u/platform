import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';

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
    const sbAdmin = await createAdminClient();

    serverLogger.info('[Money Lover Import] Starting import for workspace', {
      wsId,
    });

    // Get the current user
    const { user } = await resolveAuthenticatedSessionUser(supabase);

    if (!user) {
      serverLogger.error('[Money Lover Import] Unauthorized - no user found', {
        wsId,
      });
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    serverLogger.info('[Money Lover Import] User authenticated', {
      userId: user.id,
      wsId,
    });

    // Get workspace user ID from linked users table
    const { data: linkedUser, error: linkedUserError } = await supabase
      .from('workspace_user_linked_users')
      .select('virtual_user_id')
      .eq('ws_id', wsId)
      .eq('platform_user_id', user.id)
      .single();

    if (linkedUserError || !linkedUser) {
      serverLogger.error('[Money Lover Import] User not linked to workspace', {
        error: linkedUserError,
        userId: user.id,
        wsId,
      });
      return NextResponse.json(
        { message: 'User not found in workspace' },
        { status: 403 }
      );
    }

    const workspaceUserId = linkedUser.virtual_user_id;
    serverLogger.info('[Money Lover Import] Workspace user resolved', {
      workspaceUserId,
      wsId,
    });

    const formData = await req.formData();
    const transactionsJson = formData.get('transactions') as string;

    if (!transactionsJson) {
      serverLogger.error(
        '[Money Lover Import] No transactions data in request',
        { wsId }
      );
      return NextResponse.json(
        { message: 'No transactions data provided' },
        { status: 400 }
      );
    }

    const transactions: MoneyLoverTransaction[] = JSON.parse(transactionsJson);

    serverLogger.info('[Money Lover Import] Parsed transactions', {
      count: transactions.length,
      wsId,
    });

    if (transactions.length === 0) {
      serverLogger.error('[Money Lover Import] Empty transactions array', {
        wsId,
      });
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
      serverLogger.error('[Money Lover Import] Error fetching categories', {
        error: categoriesError,
        wsId,
      });
    } else {
      serverLogger.info('[Money Lover Import] Found existing categories', {
        count: existingCategories?.length || 0,
        wsId,
      });
    }

    const { data: existingWallets, error: walletsError } = await sbAdmin
      .from('workspace_wallets')
      .select('id, name')
      .eq('ws_id', wsId);

    if (walletsError) {
      serverLogger.error('[Money Lover Import] Error fetching wallets', {
        error: walletsError,
        wsId,
      });
    } else {
      serverLogger.info('[Money Lover Import] Found existing wallets', {
        count: existingWallets?.length || 0,
        wsId,
      });
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
    serverLogger.info(
      '[Money Lover Import] Step 1: Extracting unique wallets',
      { wsId }
    );
    const uniqueWallets = new Set(
      transactions.map((t) => t.wallet).filter((w) => w?.trim())
    );
    serverLogger.info('[Money Lover Import] Found unique wallets', {
      wallets: Array.from(uniqueWallets),
      wsId,
    });

    // Create missing wallets
    const walletsToCreate = Array.from(uniqueWallets).filter(
      (wallet) => !walletMap.has(wallet.toLowerCase())
    );

    if (walletsToCreate.length > 0) {
      serverLogger.info('[Money Lover Import] Creating missing wallets', {
        wallets: walletsToCreate,
        wsId,
      });
      const { data: newWallets, error: walletCreateError } = await sbAdmin
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
        serverLogger.error('[Money Lover Import] Failed to create wallets', {
          error: walletCreateError,
          wsId,
        });
        return NextResponse.json(
          { message: `Failed to create wallets: ${walletCreateError.message}` },
          { status: 500 }
        );
      }

      if (newWallets) {
        serverLogger.info('[Money Lover Import] Created wallets', {
          count: newWallets.length,
          wsId,
        });
        newWallets.forEach((wallet) => {
          walletMap.set(wallet.name?.toLowerCase(), wallet);
        });
      }
    }

    // Step 2: Extract unique categories with their expense type
    serverLogger.info(
      '[Money Lover Import] Step 2: Extracting unique categories',
      { wsId }
    );
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
      serverLogger.info('[Money Lover Import] Creating missing categories', {
        categories: categoriesToCreate.map(([name]) => name),
        wsId,
      });
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
        serverLogger.error('[Money Lover Import] Failed to create categories', {
          error: categoryCreateError,
          wsId,
        });
        return NextResponse.json(
          {
            message: `Failed to create categories: ${categoryCreateError.message}`,
          },
          { status: 500 }
        );
      }

      if (newCategories) {
        serverLogger.info('[Money Lover Import] Created categories', {
          count: newCategories.length,
          wsId,
        });
        newCategories.forEach((category) => {
          categoryMap.set(category.name.toLowerCase(), category);
        });
      }
    }

    // Step 3: Prepare transactions for batch insert
    serverLogger.info(
      '[Money Lover Import] Step 3: Preparing transactions for batch insert',
      { wsId }
    );
    const transactionsToInsert: any[] = [];

    for (const transaction of transactions) {
      try {
        const amount = parseFloat(transaction.amount);
        if (Number.isNaN(amount)) {
          serverLogger.error('[Money Lover Import] Invalid amount', {
            transaction,
            wsId,
          });
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
        serverLogger.error('[Money Lover Import] Error preparing transaction', {
          error,
          wsId,
        });
        errors.push(
          `Error processing transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    serverLogger.info('[Money Lover Import] Prepared transactions for insert', {
      count: transactionsToInsert.length,
      wsId,
    });

    // Step 4: Insert transactions in batches of 1000 with streaming progress
    serverLogger.info(
      '[Money Lover Import] Step 4: Inserting transactions in batches',
      { wsId }
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
            serverLogger.info('[Money Lover Import] Inserting batch', {
              batchNumber,
              batchSize: batch.length,
              totalBatches,
              wsId,
            });

            const { error: insertError } = await supabase
              .from('wallet_transactions')
              .insert(batch);

            if (insertError) {
              serverLogger.error(
                '[Money Lover Import] Failed to insert batch',
                {
                  batchNumber,
                  error: insertError,
                  totalBatches,
                  wsId,
                }
              );
              errors.push(
                `Failed to insert batch ${batchNumber}: ${insertError.message}`
              );
            } else {
              imported += batch.length;
              serverLogger.info(
                '[Money Lover Import] Successfully inserted batch',
                {
                  batchNumber,
                  imported,
                  totalBatches,
                  wsId,
                }
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

          serverLogger.info('[Money Lover Import] Import completed', {
            errors: errors.length,
            imported,
            total: transactions.length,
            wsId,
          });

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
          serverLogger.error('[Money Lover Import] Stream error', {
            error,
            wsId,
          });
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
    serverLogger.error('[Money Lover Import] Import error', { error });
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
