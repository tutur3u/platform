import { AES, enc } from 'crypto-js';

const STORAGE_PREFIX = 'migration_';
const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_STORAGE_KEY || 'default-key';

export const encryptData = (data: string): string => {
  return AES.encrypt(data, ENCRYPTION_KEY).toString();
};

export const decryptData = (encryptedData: string): string => {
  try {
    const bytes = AES.decrypt(encryptedData, ENCRYPTION_KEY);
    return bytes.toString(enc.Utf8);
  } catch {
    return '';
  }
};

export const setSecureItem = (key: string, value: string): void => {
  const encryptedValue = encryptData(value);
  localStorage.setItem(`${STORAGE_PREFIX}${key}`, encryptedValue);
};

export const getSecureItem = (key: string): string => {
  const encryptedValue = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
  if (!encryptedValue) return '';
  return decryptData(encryptedValue);
};

export const removeSecureItem = (key: string): void => {
  localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
};

export const clearSecureStorage = (): void => {
  Object.keys(localStorage)
    .filter((key) => key.startsWith(STORAGE_PREFIX))
    .forEach((key) => localStorage.removeItem(key));
};

// Migration history storage
export type MigrationHistoryEntry = {
  timestamp: number;
  module: string;
  success: boolean;
  error?: string;
  itemsProcessed: number;
  duration: number;
};

export const addMigrationHistory = (entry: MigrationHistoryEntry): void => {
  const history = getMigrationHistory();
  history.unshift(entry);

  // Keep only last 100 entries
  const trimmedHistory = history.slice(0, 100);
  localStorage.setItem(
    `${STORAGE_PREFIX}history`,
    JSON.stringify(trimmedHistory)
  );
};

export const getMigrationHistory = (): MigrationHistoryEntry[] => {
  const historyStr = localStorage.getItem(`${STORAGE_PREFIX}history`);
  if (!historyStr) return [];

  try {
    return JSON.parse(historyStr);
  } catch {
    return [];
  }
};

export const clearMigrationHistory = (): void => {
  localStorage.removeItem(`${STORAGE_PREFIX}history`);
};
