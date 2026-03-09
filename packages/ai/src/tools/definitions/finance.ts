import { z } from 'zod';
import { tool } from '../core';

export const financeToolDefinitions = {
  log_transaction: tool({
    description:
      'Log a financial transaction. Positive amount = income, negative = expense.',
    inputSchema: z.object({
      amount: z.number().describe('Amount (positive=income, negative=expense)'),
      description: z.string().nullish().describe('What was this for?'),
      walletId: z
        .uuid()
        .nullish()
        .describe('Wallet UUID. If null, uses the first wallet.'),
    }),
  }),

  get_spending_summary: tool({
    description: 'Get income/expense summary for the past N days.',
    inputSchema: z.object({
      days: z
        .number()
        .int()
        .min(1)
        .max(365)
        .optional()
        .describe('Number of past days to summarize (default: 30)'),
    }),
  }),

  list_wallets: tool({
    description: 'List all wallets in the workspace.',
    inputSchema: z.object({}),
  }),

  create_wallet: tool({
    description: 'Create a new wallet.',
    inputSchema: z.object({
      name: z.string().describe('Wallet name'),
      currency: z.string().optional().describe('Currency code (e.g. USD, VND)'),
      balance: z.number().optional().describe('Initial balance'),
      type: z.string().optional().describe('Wallet type'),
    }),
  }),

  update_wallet: tool({
    description: 'Update wallet details.',
    inputSchema: z.object({
      walletId: z.uuid().describe('Wallet UUID'),
      name: z.string().optional().describe('New name'),
      currency: z.string().optional().describe('New currency'),
      balance: z.number().optional().describe('New balance'),
      type: z.string().optional().describe('New wallet type'),
    }),
  }),

  delete_wallet: tool({
    description: 'Delete a wallet.',
    inputSchema: z.object({
      walletId: z.uuid().describe('Wallet UUID'),
    }),
  }),

  list_transactions: tool({
    description: 'List transactions with optional filters.',
    inputSchema: z.object({
      walletId: z.uuid().optional().describe('Filter by wallet UUID'),
      categoryId: z.uuid().optional().describe('Filter by category UUID'),
      days: z
        .number()
        .int()
        .min(1)
        .max(365)
        .optional()
        .describe('Only last N days'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Max results (default 50)'),
    }),
  }),

  get_transaction: tool({
    description: 'Get a single transaction by ID.',
    inputSchema: z.object({
      transactionId: z.uuid().describe('Transaction UUID'),
    }),
  }),

  update_transaction: tool({
    description: 'Update a transaction.',
    inputSchema: z.object({
      transactionId: z.uuid().describe('Transaction UUID'),
      amount: z.number().optional().describe('New amount'),
      description: z.string().optional().describe('New description'),
      categoryId: z.uuid().optional().describe('New category UUID'),
      walletId: z.uuid().optional().describe('New wallet UUID'),
    }),
  }),

  delete_transaction: tool({
    description: 'Delete a transaction.',
    inputSchema: z.object({
      transactionId: z.uuid().describe('Transaction UUID'),
    }),
  }),

  list_transaction_categories: tool({
    description: 'List all transaction categories.',
    inputSchema: z.object({}),
  }),

  create_transaction_category: tool({
    description: 'Create a transaction category.',
    inputSchema: z.object({
      name: z.string().describe('Category name'),
      isExpense: z
        .boolean()
        .optional()
        .describe('Is this an expense category? Default true.'),
    }),
  }),

  update_transaction_category: tool({
    description: 'Update a transaction category.',
    inputSchema: z.object({
      categoryId: z.uuid().describe('Category UUID'),
      name: z.string().optional().describe('New name'),
      isExpense: z.boolean().optional().describe('Is expense?'),
    }),
  }),

  delete_transaction_category: tool({
    description: 'Delete a transaction category.',
    inputSchema: z.object({
      categoryId: z.uuid().describe('Category UUID'),
    }),
  }),

  list_transaction_tags: tool({
    description: 'List all transaction tags.',
    inputSchema: z.object({}),
  }),

  create_transaction_tag: tool({
    description: 'Create a transaction tag.',
    inputSchema: z.object({
      name: z.string().describe('Tag name'),
      color: z
        .string()
        .regex(/^[#][0-9a-fA-F]{3,8}$/)
        .optional()
        .describe('Color hex'),
      description: z.string().optional().describe('Tag description'),
    }),
  }),

  update_transaction_tag: tool({
    description: 'Update a transaction tag.',
    inputSchema: z.object({
      tagId: z.uuid().describe('Tag UUID'),
      name: z.string().optional().describe('New name'),
      color: z
        .string()
        .regex(/^[#][0-9a-fA-F]{3,8}$/)
        .optional()
        .describe('New color'),
      description: z.string().optional().describe('New description'),
    }),
  }),

  delete_transaction_tag: tool({
    description: 'Delete a transaction tag.',
    inputSchema: z.object({
      tagId: z.uuid().describe('Tag UUID'),
    }),
  }),

  set_default_currency: tool({
    description:
      'Set the default currency for the workspace. Use standard currency codes.',
    inputSchema: z.object({
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/, {
          message:
            'Currency must be a valid ISO-4217 code (3 uppercase letters)',
        })
        .describe(
          'Currency code in ISO-4217 format (exactly 3 uppercase letters, e.g. USD, VND, EUR, JPY, GBP, KRW, THB, SGD)'
        ),
    }),
  }),
} as const;
