const DEFAULT_DEV_MODE = process.env.NODE_ENV === 'development';

function normalizeEnvValue(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export interface TurnstileClientStateOptions {
  devMode?: boolean;
}

export interface TurnstileClientState {
  siteKey?: string;
  isRequired: boolean;
  canRenderWidget: boolean;
}

export function resolveTurnstileClientState(
  options: TurnstileClientStateOptions = {}
): TurnstileClientState {
  const devMode = options.devMode ?? DEFAULT_DEV_MODE;
  const siteKey = normalizeEnvValue(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  const isRequired = !devMode;

  return {
    siteKey,
    isRequired,
    canRenderWidget: isRequired && Boolean(siteKey),
  };
}
