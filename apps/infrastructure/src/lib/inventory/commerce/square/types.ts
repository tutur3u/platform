import type {
  InventoryCheckoutSession,
  InventorySquareDevice,
  InventorySquareDeviceCode,
  InventorySquareEnvironment,
  InventorySquareLocation,
  InventorySquareTerminalCheckoutStatus,
} from '@tuturuuu/internal-api/inventory';

export const SQUARE_API_VERSION = '2026-05-20';

export const SQUARE_OAUTH_SCOPES = [
  'MERCHANT_PROFILE_READ',
  'ORDERS_READ',
  'ORDERS_WRITE',
  'PAYMENTS_READ',
  'PAYMENTS_WRITE',
  'DEVICE_CREDENTIAL_MANAGEMENT',
] as const;

export type SquareEnvironment = InventorySquareEnvironment;

export type SquareAccessContext = {
  accessToken: string;
  environment: SquareEnvironment;
  locationId: string;
  deviceId: string;
  wsId: string;
};

export type SquareMoney = {
  amount: number;
  currency: string;
};

export type SquareApiLocation = {
  id?: string;
  name?: string;
  status?: string;
  country?: string;
  currency?: string;
};

export type SquareApiDevice = {
  id?: string;
  attributes?: {
    name?: string;
    status?: string;
    location_id?: string;
    product_type?: string;
  };
  components?: {
    terminal_details?: {
      device_code_id?: string;
    };
  };
  created_at?: string;
  updated_at?: string;
};

export type SquareApiDeviceCode = {
  code?: string;
  device_id?: string;
  id?: string;
  location_id?: string;
  name?: string;
  pair_by?: string;
  product_type?: string;
  status?: string;
};

export type SquareApiOrder = {
  id?: string;
  location_id?: string;
};

export type SquareApiTerminalCheckout = {
  amount_money?: SquareMoney;
  app_id?: string;
  cancel_reason?: string;
  created_at?: string;
  device_options?: {
    device_id?: string;
    show_itemized_cart?: boolean;
  };
  id?: string;
  note?: string;
  order_id?: string;
  payment_ids?: string[];
  reference_id?: string;
  status?: string;
  updated_at?: string;
};

export type SquareApiPayment = {
  id?: string;
  order_id?: string;
  receipt_url?: string;
  status?: string;
  total_money?: SquareMoney;
};

export type SquareOAuthTokenResponse = {
  access_token?: string;
  expires_at?: string;
  merchant_id?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

export type SquareLocation = InventorySquareLocation;
export type SquareDevice = InventorySquareDevice;
export type SquareDeviceCode = InventorySquareDeviceCode;
export type SquareTerminalCheckoutStatus =
  InventorySquareTerminalCheckoutStatus;

export type SquareTerminalCheckoutResult = {
  checkout: InventoryCheckoutSession;
  squareCheckout: SquareApiTerminalCheckout;
};
