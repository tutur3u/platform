import { z } from 'zod';

export interface Params {
  params: Promise<{
    wsId: string;
    saleId: string;
  }>;
}

interface NamedRelation {
  name: string | null;
}

interface TransactionRelation {
  id: string | null;
  taken_at: string | null;
}

interface WorkspaceUserRelation {
  id: string;
  full_name: string | null;
  display_name: string | null;
}

interface PlatformUserRelation {
  id: string;
  display_name: string | null;
}

export interface SaleInvoiceProductRow {
  amount: number | null;
  price: number | null;
  owner_id: string | null;
  owner_name: string | null;
  product_id: string | null;
  product_name: string | null;
  product_unit: string | null;
  unit_id: string;
  warehouse_id: string;
  warehouse: string | null;
}

export interface SaleInvoiceRow {
  id: string;
  notice: string | null;
  note: string | null;
  paid_amount: number;
  created_at: string | null;
  completed_at: string | null;
  wallet_id: string | null;
  category_id: string | null;
  customer_id: string | null;
  creator_id: string | null;
  platform_creator_id: string | null;
  transaction_id: string | null;
  wallet: NamedRelation | NamedRelation[] | null;
  category: NamedRelation | NamedRelation[] | null;
  customer: WorkspaceUserRelation | WorkspaceUserRelation[] | null;
  creator: WorkspaceUserRelation | WorkspaceUserRelation[] | null;
  platform_creator: PlatformUserRelation | PlatformUserRelation[] | null;
  linked_transaction: TransactionRelation | TransactionRelation[] | null;
  finance_invoice_products: SaleInvoiceProductRow[] | null;
}

export interface InventoryStockRow {
  product_id: string;
  unit_id: string;
  warehouse_id: string;
  price: number | null;
}

export const UpdateSaleProductSchema = z.object({
  product_id: z.guid(),
  unit_id: z.guid(),
  warehouse_id: z.guid(),
  quantity: z.number().positive(),
  price: z.number().min(0),
});

export const UpdateSaleSchema = z.object({
  notice: z.string().trim().nullable().optional(),
  note: z.string().trim().nullable().optional(),
  wallet_id: z.guid().nullable().optional(),
  category_id: z.guid().nullable().optional(),
  products: z.array(UpdateSaleProductSchema).min(1).optional(),
});

export type UpdateSaleProductInput = z.infer<typeof UpdateSaleProductSchema>;
export type UpdateSaleInput = z.infer<typeof UpdateSaleSchema>;
