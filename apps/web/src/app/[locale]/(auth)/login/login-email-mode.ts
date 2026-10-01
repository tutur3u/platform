/** Presentation preference only; never use this to authorize an account. */
export type LoginEmailMode = 'otp' | 'password';

export function processEmailInput(value: string): string {
  const email = value.trim();
  return email && !email.includes('@') ? `${email}@tuturuuu.com` : email;
}

export class LoginEmailModePreference {
  private readonly choices = new Map<string, LoginEmailMode>();

  choose(email: string, mode: LoginEmailMode): void {
    this.choices.set(email.trim().toLowerCase(), mode);
  }

  resolve(email: string, otpEnabled: boolean): LoginEmailMode {
    if (!otpEnabled) return 'password';
    const normalized = email.trim().toLowerCase();
    const choice = this.choices.get(normalized);
    if (choice) return choice;
    const parts = normalized.split('@');
    return parts.length === 2 &&
      parts[0] &&
      (parts[1] === 'tuturuuu.com' || parts[1] === 'tutur3u.com')
      ? 'password'
      : 'otp';
  }
}
