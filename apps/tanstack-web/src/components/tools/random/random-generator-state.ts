import type { RandomGeneratorOptions, TokenEncoding } from './random-generator';

export type RandomGeneratorTab = 'ids' | 'tokens' | 'passwords';
export type IdFormat = 'nanoid' | 'uuid';
export type TokenFormat = TokenEncoding | 'api-key';

export interface RandomGeneratorSettings {
  activeTab: RandomGeneratorTab;
  batchCount: number;
  excludeAmbiguous: boolean;
  idFormat: IdFormat;
  idLength: number;
  includeLowercase: boolean;
  includeNumbers: boolean;
  includeSymbols: boolean;
  includeUppercase: boolean;
  passwordLength: number;
  tokenByteLength: number;
  tokenFormat: TokenFormat;
  tokenPrefix: string;
}

export const FIELD_LIMITS = {
  batchCount: { max: 20, min: 1 },
  idLength: { max: 128, min: 4 },
  passwordLength: { max: 128, min: 8 },
  tokenByteLength: { max: 128, min: 8 },
} as const;

export const DEFAULT_RANDOM_GENERATOR_SETTINGS: RandomGeneratorSettings = {
  activeTab: 'ids',
  batchCount: 5,
  excludeAmbiguous: true,
  idFormat: 'nanoid',
  idLength: 21,
  includeLowercase: true,
  includeNumbers: true,
  includeSymbols: true,
  includeUppercase: true,
  passwordLength: 20,
  tokenByteLength: 32,
  tokenFormat: 'base64url',
  tokenPrefix: 'ttr_',
};

export function buildRandomGeneratorOptions(
  settings: RandomGeneratorSettings
): RandomGeneratorOptions | null {
  if (settings.activeTab === 'ids') {
    if (settings.idFormat === 'uuid') {
      return {
        batchCount: settings.batchCount,
        mode: 'uuid',
      };
    }

    return {
      batchCount: settings.batchCount,
      length: settings.idLength,
      mode: 'id',
    };
  }

  if (settings.activeTab === 'tokens') {
    return {
      batchCount: settings.batchCount,
      byteLength: settings.tokenByteLength,
      encoding: settings.tokenFormat === 'hex' ? 'hex' : 'base64url',
      mode: 'token',
      prefix:
        settings.tokenFormat === 'api-key' ? settings.tokenPrefix.trim() : '',
    };
  }

  if (
    !settings.includeUppercase &&
    !settings.includeLowercase &&
    !settings.includeNumbers &&
    !settings.includeSymbols
  ) {
    return null;
  }

  return {
    batchCount: settings.batchCount,
    excludeAmbiguous: settings.excludeAmbiguous,
    includeLowercase: settings.includeLowercase,
    includeNumbers: settings.includeNumbers,
    includeSymbols: settings.includeSymbols,
    includeUppercase: settings.includeUppercase,
    length: settings.passwordLength,
    mode: 'password',
  };
}

export function clampNumber(value: string, min: number, max: number) {
  const parsedValue = Number.parseInt(value, 10);

  if (!Number.isFinite(parsedValue)) return min;

  return Math.min(Math.max(parsedValue, min), max);
}
