import { afterEach, describe, expect, it } from 'vitest';
import {
  extractAuthorizationSecret,
  extractSepayEndpointTokenPrefix,
  generateSepayEndpointToken,
  isValidSepayWebhookAuthorization,
  SEPAY_ENDPOINT_TOKEN_PREFIX,
  SEPAY_ENDPOINT_TOKEN_PREFIX_LENGTH,
} from './sepay';

const originalSepayWebhookApiKey = process.env.SEPAY_WEBHOOK_API_KEY;
const originalSepayWebhookSecret = process.env.SEPAY_WEBHOOK_SECRET;

afterEach(() => {
  process.env.SEPAY_WEBHOOK_API_KEY = originalSepayWebhookApiKey;
  process.env.SEPAY_WEBHOOK_SECRET = originalSepayWebhookSecret;
});

describe('sepay helpers', () => {
  it('extracts webhook auth secret from common authorization header formats', () => {
    expect(extractAuthorizationSecret('Bearer test-key')).toBe('test-key');
    expect(extractAuthorizationSecret('Token another-key')).toBe('another-key');
    expect(extractAuthorizationSecret('ApiKey key-value')).toBe('key-value');
    expect(extractAuthorizationSecret('just-a-secret')).toBe('just-a-secret');
    expect(extractAuthorizationSecret('   ')).toBeNull();
  });

  it('validates webhook authorization header against configured secret', () => {
    process.env.SEPAY_WEBHOOK_API_KEY = 'sepay-secret';
    process.env.SEPAY_WEBHOOK_SECRET = undefined;

    expect(isValidSepayWebhookAuthorization('Bearer sepay-secret')).toBe(true);
    expect(isValidSepayWebhookAuthorization('Token sepay-secret')).toBe(true);
    expect(isValidSepayWebhookAuthorization('Bearer wrong-secret')).toBe(false);
    expect(isValidSepayWebhookAuthorization(null)).toBe(false);
  });

  it('generates token and extracts a valid token prefix', () => {
    const { token, prefix } = generateSepayEndpointToken();

    expect(token.startsWith(SEPAY_ENDPOINT_TOKEN_PREFIX)).toBe(true);
    expect(prefix.length).toBe(SEPAY_ENDPOINT_TOKEN_PREFIX_LENGTH);
    expect(extractSepayEndpointTokenPrefix(token)).toBe(prefix);
    expect(extractSepayEndpointTokenPrefix('invalid-token')).toBeNull();
  });
});
