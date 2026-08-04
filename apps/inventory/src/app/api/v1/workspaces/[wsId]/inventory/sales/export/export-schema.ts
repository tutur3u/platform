import type { InventorySalesExportRpcRow } from '@tuturuuu/inventory-core/sales-export';

export type NormalizedInventorySalesExportRow = Omit<
  InventorySalesExportRpcRow,
  'currency' | 'line_total' | 'monetary_unit' | 'sale_amount' | 'unit_price'
> & {
  currency: string;
  line_total: number | null;
  sale_amount: number;
  sale_timestamp: string | null;
  unit_price: number | null;
};

export type ReadableInventorySalesExportRow = {
  creator: string;
  currency: string;
  customer_email: string;
  customer_name: string;
  item_category: string;
  item_name: string;
  line_total: number | null;
  note: string;
  notice: string;
  owner: string;
  quantity: number | null;
  sale_reference: string;
  sales_channel: string;
  sold_at: string | null;
  transaction_category: string;
  unit: string;
  unit_price: number | null;
  wallet: string;
  warehouse: string;
};

export type ProductSummaryRow = {
  average_unit_price: number | null;
  currency: string;
  item_category: string;
  item_name: string;
  owner: string;
  quantity_sold: number;
  revenue: number;
  sales_count: number;
  unit: string;
};

export const READABLE_COLUMNS = [
  ['Sale Reference', 'sale_reference'],
  ['Sold At (UTC)', 'sold_at'],
  ['Sales Channel', 'sales_channel'],
  ['Item Category', 'item_category'],
  ['Item Name', 'item_name'],
  ['Owner', 'owner'],
  ['Quantity', 'quantity'],
  ['Unit', 'unit'],
  ['Unit Price', 'unit_price'],
  ['Line Total', 'line_total'],
  ['Currency', 'currency'],
  ['Customer Name', 'customer_name'],
  ['Customer Email', 'customer_email'],
  ['Warehouse', 'warehouse'],
  ['Transaction Category', 'transaction_category'],
  ['Wallet', 'wallet'],
  ['Creator', 'creator'],
  ['Notice', 'notice'],
  ['Note', 'note'],
] as const satisfies ReadonlyArray<
  readonly [string, keyof ReadableInventorySalesExportRow]
>;

export const CSV_TECHNICAL_COLUMNS = [
  ['Sale ID', 'sale_id'],
  ['Line ID', 'line_id'],
  ['Product ID', 'product_id'],
  ['Owner ID', 'owner_id'],
  ['Unit ID', 'unit_id'],
  ['Warehouse ID', 'warehouse_id'],
  ['Period ID', 'period_id'],
  ['Period Name', 'period_name'],
  ['Raw Sale Source', 'sale_source'],
  ['Raw Checkout Provider', 'checkout_provider'],
  ['Revenue Allocation Source', 'allocation_source'],
  ['Transaction ID', 'transaction_id'],
  ['Finance Invoice ID', 'finance_invoice_id'],
  ['Public Token', 'public_token'],
  ['Polar Order ID', 'polar_order_id'],
  ['Square Order ID', 'square_order_id'],
  ['Created At', 'created_at'],
  ['Completed At', 'completed_at'],
  ['Sale Total', 'sale_amount'],
] as const satisfies ReadonlyArray<
  readonly [string, keyof NormalizedInventorySalesExportRow]
>;

export const TECHNICAL_COLUMNS = [
  ['Sale ID', 'sale_id'],
  ['Source', 'sale_source'],
  ['Period ID', 'period_id'],
  ['Period Name', 'period_name'],
  ['Sale Timestamp', 'sale_timestamp'],
  ['Created At', 'created_at'],
  ['Completed At', 'completed_at'],
  ['Sale Amount', 'sale_amount'],
  ['Currency', 'currency'],
  ['Customer Name', 'customer_name'],
  ['Customer Email', 'customer_email'],
  ['Creator Name', 'creator_name'],
  ['Wallet', 'wallet_name'],
  ['Transaction Category', 'category_name'],
  ['Notice', 'notice'],
  ['Note', 'note'],
  ['Transaction ID', 'transaction_id'],
  ['Finance Invoice ID', 'finance_invoice_id'],
  ['Public Token', 'public_token'],
  ['Checkout Provider', 'checkout_provider'],
  ['Polar Order ID', 'polar_order_id'],
  ['Square Order ID', 'square_order_id'],
  ['Line ID', 'line_id'],
  ['Product ID', 'product_id'],
  ['Product Name', 'product_name'],
  ['Product Category', 'product_category_name'],
  ['Owner ID', 'owner_id'],
  ['Owner Name', 'owner_name'],
  ['Unit ID', 'unit_id'],
  ['Unit Name', 'unit_name'],
  ['Warehouse ID', 'warehouse_id'],
  ['Warehouse Name', 'warehouse_name'],
  ['Quantity', 'quantity'],
  ['Unit Price', 'unit_price'],
  ['Line Total', 'line_total'],
  ['Revenue Allocation Source', 'allocation_source'],
] as const satisfies ReadonlyArray<
  readonly [string, keyof NormalizedInventorySalesExportRow]
>;

export const SUMMARY_COLUMNS = [
  ['Item Category', 'item_category'],
  ['Item Name', 'item_name'],
  ['Owner', 'owner'],
  ['Unit', 'unit'],
  ['Currency', 'currency'],
  ['Quantity Sold', 'quantity_sold'],
  ['Sales Count', 'sales_count'],
  ['Revenue', 'revenue'],
  ['Average Unit Price', 'average_unit_price'],
] as const satisfies ReadonlyArray<readonly [string, keyof ProductSummaryRow]>;

export const READABLE_COLUMN_WIDTHS = [
  16, 22, 18, 24, 36, 24, 12, 16, 16, 16, 12, 24, 30, 24, 24, 22, 22, 32, 32,
];
