import { test } from '@e2e-dev/web';
import { credentials, expect, secrets } from 'e2e';

const signInCases = [
  {
    locale: 'en',
    language: 'English',
    heading: 'Welcome to Tuturuuu',
    emailLabel: 'Email or username',
    continueLabel: 'Continue with email',
    passwordHeading: 'Enter your password',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Enter your password',
    submitLabel: 'Sign In',
    workspace: 'Personal Workspace',
    signedIn: 'Signed in',
  },
  {
    locale: 'vi',
    language: 'Vietnamese',
    heading: 'Chào mừng đến với Tuturuuu',
    emailLabel: 'Email hoặc tên người dùng',
    continueLabel: 'Tiếp tục với email',
    passwordHeading: 'Nhập mật khẩu',
    passwordLabel: 'Mật khẩu',
    passwordPlaceholder: 'Nhập mật khẩu của bạn',
    submitLabel: 'Đăng nhập',
    workspace: 'Không gian làm việc cá nhân',
    signedIn: 'Đã đăng nhập',
  },
] as const;

for (const copy of signInCases) {
  test(`signs in with the fleet test identity in ${copy.language}`, async ({
    agent,
    app,
    browser,
    screen,
  }) => {
    const fleet = credentials.user('fleet');
    await app.open(`/${copy.locale}/login`);
    await expect(screen.getByRole('heading', copy.heading)).toBeVisible();
    await expect(screen.getByLabel(copy.emailLabel)).toBeVisible();
    await expect(screen.getByRole('button', copy.continueLabel)).toBeVisible();

    await agent.act('enter the fleet email and continue in {language}', {
      params: { email: secrets.get('fleet-email'), language: copy.language },
    });
    await expect(
      screen.getByRole('heading', copy.passwordHeading)
    ).toBeVisible();
    await expect(screen.getByLabel(copy.passwordLabel)).toBeVisible();
    await expect(
      screen.getByPlaceholder(copy.passwordPlaceholder)
    ).toBeVisible();
    await expect(screen.getByRole('button', copy.submitLabel)).toBeVisible();

    await agent.act('submit the fleet password in {language}', {
      params: { password: fleet.password, language: copy.language },
    });
    await expect(browser).toHaveURL(new RegExp(`/${copy.locale}/personal/?$`));
    await expect(screen.getByRole('heading', copy.workspace)).toBeVisible();
    await expect(screen.getByRole('status')).toHaveText(copy.signedIn);
  });
}
