const normalizeBaseUrl = (value: string) => value.replace(/\/$/, '');

export const apiConfig = {
  baseUrl: normalizeBaseUrl(
    process.env.EXPO_PUBLIC_API_BASE_URL || 'https://tuturuuu.com'
  ),
} as const;

export const apiEndpoints = {
  auth: {
    sendOtp: '/api/v1/auth/mobile/send-otp',
    verifyOtp: '/api/v1/auth/mobile/verify-otp',
    passwordLogin: '/api/v1/auth/mobile/password-login',
  },
} as const;
