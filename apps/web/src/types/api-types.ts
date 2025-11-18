export type OneTimeProduct = {
  product_id: string;
  quantity: number;
};

export type SubscriptionDetails = {
  activated_at: string;
  subscription_id: string;
  payment_frequency_interval: 'Day' | 'Week' | 'Month' | 'Year';
  product_id: string;
};

export type WebhookPayload = {
  type: string;
};

export interface UpdateSubscriptionResult {
  success: boolean;
  error?: {
    message: string;
    status: number;
  };
}

export interface DatabaseSchema {
  id: string;
  email: string;
  product_ids: string[];
  subscription_ids: string[];
  updated_at: Date;
}
