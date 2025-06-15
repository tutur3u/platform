import { Payment as BasePayment } from "dodopayments/resources/payments.mjs";
import { Subscription as BaseSubscription } from "dodopayments/resources/subscriptions.mjs";

export type Payment = BasePayment & { payload_type: string };
export type Subscription = BaseSubscription & { payload_type: string };

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
  data: Payment | Subscription
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