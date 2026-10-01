export interface FinanceInvoiceProductPayload {
  category_id?: string;
  price: number;
  price_id?: string;
  product_id: string;
  quantity: number;
  unit_id: string;
  warehouse_id: string;
}

export interface CreateFinanceInvoicePayload {
  category_id?: string;
  content: string;
  inventory_period_id?: string;
  inventory_request_id?: string;
  customer_id?: string | null;
  frontend_discount_amount?: number;
  frontend_subtotal?: number;
  frontend_total?: number;
  notes?: string;
  price_mode?: 'catalog' | 'custom';
  products: FinanceInvoiceProductPayload[];
  promotion_id?: string;
  wallet_id: string;
}
