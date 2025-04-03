import crypto from 'crypto';

export function generateSalt() {
  return crypto.randomBytes(10).toString('hex');
}

export async function hashPassword(password: string, salt: string) {
  // concatenate the password and salt
  const passwordWithSalt = password + salt;

  // use native crypto to hash the password
  const hashedPassword = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(passwordWithSalt)
  );

  // convert the hashed password to a hex string
  return Array.from(new Uint8Array(hashedPassword))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
