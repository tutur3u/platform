/**
 * Session encryption utilities using Web Crypto API
 * Provides secure encryption/decryption for stored Supabase sessions
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits recommended for AES-GCM
const SALT_LENGTH = 16;

/**
 * Generate a cryptographic key from a password/passphrase
 */
async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generate a secure encryption key for the session store
 * Uses the user's device fingerprint as a base
 */
export async function generateEncryptionKey(): Promise<string> {
  // Create a device-specific fingerprint
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    new Date().getTimezoneOffset().toString(),
    screen.colorDepth.toString(),
    screen.width.toString(),
    screen.height.toString(),
  ].join('|');

  // Hash the fingerprint to create a consistent key
  const encoder = new TextEncoder();
  const data = encoder.encode(fingerprint);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Encrypt a session object
 */
export async function encryptSession(
  sessionData: object,
  encryptionKey: string
): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(sessionData));

    // Generate random salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Derive encryption key
    const key = await deriveKey(encryptionKey, salt);

    // Encrypt the data
    const encryptedData = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv },
      key,
      data
    );

    // Combine salt + iv + encrypted data
    const combined = new Uint8Array(
      salt.length + iv.length + encryptedData.byteLength
    );
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encryptedData), salt.length + iv.length);

    // Convert to base64 for storage
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Failed to encrypt session:', error);
    throw new Error('Session encryption failed');
  }
}

/**
 * Decrypt a session object
 */
export async function decryptSession(
  encryptedData: string,
  encryptionKey: string
): Promise<object> {
  try {
    // Decode from base64
    const combined = Uint8Array.from(atob(encryptedData), (c) =>
      c.charCodeAt(0)
    );

    // Extract salt, IV, and encrypted data
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const data = combined.slice(SALT_LENGTH + IV_LENGTH);

    // Derive decryption key
    const key = await deriveKey(encryptionKey, salt);

    // Decrypt the data
    const decryptedData = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      data
    );

    // Convert back to object
    const decoder = new TextDecoder();
    const jsonString = decoder.decode(decryptedData);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Failed to decrypt session:', error);
    throw new Error('Session decryption failed');
  }
}

/**
 * Validate that encryption/decryption is working
 */
export async function validateEncryption(
  encryptionKey: string
): Promise<boolean> {
  try {
    const testData = { test: 'validation', timestamp: Date.now() };
    const encrypted = await encryptSession(testData, encryptionKey);
    const decrypted = await decryptSession(encrypted, encryptionKey);
    return JSON.stringify(testData) === JSON.stringify(decrypted);
  } catch {
    return false;
  }
}

/**
 * Check if Web Crypto API is available
 */
export function isCryptoAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.crypto !== 'undefined' &&
    typeof window.crypto.subtle !== 'undefined'
  );
}
