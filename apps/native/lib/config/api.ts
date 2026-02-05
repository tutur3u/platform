import { Platform } from 'react-native';

const normalizeBaseUrl = (value: string) => {
  let url = value.replace(/\/$/, '');

  // Handle localhost mapping for Android emulator
  if (__DEV__ && Platform.OS === 'android' && url.includes('localhost')) {
    url = url.replace('localhost', '10.0.2.2');
  }

  return url;
};

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
