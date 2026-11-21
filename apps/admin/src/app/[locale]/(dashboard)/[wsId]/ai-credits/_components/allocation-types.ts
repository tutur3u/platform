export interface Allocation {
  id: string;
  tier: string;
  monthly_credits: number;
  credits_per_seat: number | null;
  daily_limit: number | null;
  default_image_model?: string | null;
  default_language_model?: string | null;
  max_output_tokens_per_request: number | null;
  markup_multiplier: number;
  allowed_models: string[];
  allowed_features: string[];
  max_requests_per_day: number | null;
  is_active: boolean;
}

export interface GatewayModel {
  id: string;
  name: string;
  provider: string;
  type: string;
  is_enabled: boolean;
}
