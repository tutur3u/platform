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

  // convert the hashed password to a string
  const hashedPasswordStr = new Uint8Array(hashedPassword).join('');
  return parseInt(hashedPasswordStr).toString(16).replace(/0+$/, '');
}
