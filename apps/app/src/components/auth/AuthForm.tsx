import Image from 'next/image';
import {
  TextInput,
  Divider,
  Button,
  PasswordInput,
  Select,
} from '@mantine/core';
import { ChangeEvent, useState } from 'react';
import {
  GlobeAltIcon,
  LockClosedIcon,
  UserCircleIcon,
} from '@heroicons/react/24/solid';
import { AuthMethod, authenticate } from '../../utils/auth-handler';
import { useRouter } from 'next/router';
import { useSessionContext } from '@supabase/auth-helpers-react';
import AuthEmailSent from './AuthEmailSent';
import { useForm } from '@mantine/form';
import Link from 'next/link';
import { showNotification } from '@mantine/notifications';

interface AuthFormProps {
  method: AuthMethod;
  emailSent: boolean;
  setMethod: (method: AuthMethod) => void;
  onSignup?: () => void;
  onSignin?: () => void;
}

const AuthForm = ({
  method,
  emailSent = false,
  setMethod,
  onSignup,
  onSignin,
}: AuthFormProps) => {
  const router = useRouter();
  const { supabaseClient } = useSessionContext();

  const [submitting, setSubmitting] = useState(false);
  const [language, setLanguage] = useState('en');

  const form = useForm({
    initialValues: {
      email: '',
      password: '',
      terms: true,
    },

    validate: {
      email: (val) => (/^\S+@\S+$/.test(val) ? null : 'Invalid email'),
      password: (val) =>
        val.length <= 6
          ? 'Password should include at least 6 characters'
          : null,
    },
  });

  if (emailSent) return <AuthEmailSent email={form.values.email} />;
  const isFormInvalid = !!form.errors.email || !!form.errors.password;

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const email = form.values.email;
      const password = form.values.password;

      await authenticate({
        supabaseClient,
        method,
        email,
        password,
      });

      if (method === 'signup') {
        onSignup?.();
        setSubmitting(false);
        return;
      } else onSignin?.();

      // If there is a redirectedFrom URL, redirect to it
      // Otherwise, redirect to the homepage
      const { redirectedFrom: nextUrl } = router.query;
      router.push(nextUrl ? nextUrl.toString() : '/');
    } catch (error: any) {
      showNotification({
        title: 'Error',
        message: error?.message || error || 'Something went wrong',
        color: 'red',
      });
      setSubmitting(false);
    }
  };

  const title =
    language === 'vi'
      ? method === 'login'
        ? 'Chào mừng trở lại'
        : method === 'signup'
        ? 'Hãy bắt đầu'
        : 'Khôi phục mật khẩu'
      : method === 'login'
      ? 'Welcome back'
      : method === 'signup'
      ? 'Get started'
      : 'Recover password';

  const description =
    language === 'vi'
      ? method === 'login'
        ? 'Đăng nhập vào tài khoản của bạn'
        : method === 'signup'
        ? 'Tạo tài khoản mới'
        : 'Nhập địa chỉ email của bạn để khôi phục mật khẩu'
      : method === 'login'
      ? 'Login to your account'
      : method === 'signup'
      ? 'Create a new account'
      : 'Enter your email address to recover your password';

  const ctaTextDefault =
    language === 'vi'
      ? method === 'login'
        ? 'Đăng nhập'
        : method === 'signup'
        ? 'Đăng ký'
        : 'Khôi phục'
      : method === 'login'
      ? 'Login'
      : method === 'signup'
      ? 'Sign up'
      : 'Recover';

  const ctaTextSubmitting =
    language === 'vi'
      ? method === 'login'
        ? 'Đang đăng nhập'
        : method === 'signup'
        ? 'Đang đăng ký'
        : 'Đang khôi phục'
      : method === 'login'
      ? 'Logging in'
      : method === 'signup'
      ? 'Signing up'
      : 'Recovering';

  const ctaText = submitting ? ctaTextSubmitting : ctaTextDefault;

  return (
    <>
      <div className="absolute inset-0 mx-4 my-32 flex items-start justify-center md:mx-4 md:items-center lg:mx-32">
        <div className="flex w-full max-w-xl flex-col items-center gap-4 rounded-xl border border-zinc-700 bg-zinc-700/50 p-4 backdrop-blur-2xl md:p-8">
          <div className="text-center">
            <div className="bg-gradient-to-br from-yellow-200 via-green-200 to-green-300 bg-clip-text py-2 text-4xl font-semibold text-transparent md:text-5xl">
              {title}
            </div>

            <div className="text-xl font-semibold text-zinc-400">
              {description}
            </div>
          </div>

          <div className="grid w-full gap-2">
            <TextInput
              id="email"
              icon={<UserCircleIcon className="h-5" />}
              label="Email"
              placeholder="username@example.com"
              value={form.values.email}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                form.setFieldValue('email', event.currentTarget.value)
              }
              error={form.errors.email && 'Invalid email'}
              classNames={{
                label: 'text-zinc-200/80 mb-1',
                input:
                  'bg-zinc-300/10 border-zinc-300/10 placeholder-zinc-200/30',
              }}
              disabled={submitting}
              withAsterisk={false}
              required
            />

            {method === 'recover' || (
              <PasswordInput
                id="password"
                icon={<LockClosedIcon className="h-5" />}
                label={language === 'vi' ? 'Mật khẩu' : 'Password'}
                placeholder="••••••••"
                value={form.values.password}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  form.setFieldValue('password', event.currentTarget.value)
                }
                error={
                  form.errors.password &&
                  'Password should include at least 6 characters'
                }
                classNames={{
                  label: 'text-zinc-200/80 mb-1',
                  innerInput: 'placeholder-zinc-200/30',
                  input: !submitting
                    ? 'bg-zinc-300/10 border-zinc-300/10'
                    : 'font-semibold',
                  visibilityToggle: 'text-zinc-200/30 hover:text-zinc-200/50',
                }}
                disabled={submitting}
                withAsterisk={false}
                required
              />
            )}

            {method === 'recover' || (
              <button
                className={`${
                  method !== 'login' ? 'pointer-events-none opacity-0' : ''
                } ${
                  submitting
                    ? 'cursor-not-allowed text-zinc-200/30'
                    : 'text-zinc-200/50 hover:text-zinc-200'
                } w-fit place-self-end transition`}
                onClick={() => setMethod('recover')}
              >
                {language === 'vi' ? 'Quên mật khẩu?' : 'Forgot password?'}
              </button>
            )}
          </div>

          <div className="grid w-full gap-2 text-center">
            <Button
              className="bg-blue-300/10"
              variant="light"
              loading={submitting}
              onClick={handleAuth}
              disabled={isFormInvalid || method === 'recover'}
            >
              {ctaText}
            </Button>

            <div>
              <span className="text-zinc-200/30">
                {language === 'vi'
                  ? method === 'login'
                    ? 'Chưa có tài khoản?'
                    : 'Đã có tài khoản?'
                  : method === 'login'
                  ? "Don't have an account?"
                  : 'Already have an account?'}
              </span>{' '}
              <button
                className="font-semibold text-zinc-200/50 transition hover:text-zinc-200"
                onClick={() =>
                  setMethod(method === 'login' ? 'signup' : 'login')
                }
              >
                {language === 'vi'
                  ? method === 'login'
                    ? 'Đăng ký'
                    : 'Đăng nhập'
                  : method === 'login'
                  ? 'Sign up'
                  : 'Login'}
              </button>
            </div>
          </div>

          <Divider className="w-full border-zinc-300/10" variant="dashed" />
          <div className="text-center text-sm font-semibold text-zinc-500">
            By continuing, you agree to Tuturuuu&apos;s{' '}
            <Link
              href="https://tuturuuu.com/terms"
              className="text-zinc-400 underline decoration-zinc-400 underline-offset-2 transition hover:text-zinc-200 hover:decoration-zinc-200"
            >
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link
              href="https://tuturuuu.com/privacy"
              className="text-zinc-400 underline decoration-zinc-400 underline-offset-2 transition hover:text-zinc-200 hover:decoration-zinc-200"
            >
              Privacy Policy
            </Link>
            , and to receive periodic emails with updates.
          </div>

          <Divider className="w-full border-zinc-300/10" />
          <Select
            icon={<GlobeAltIcon className="h-5" />}
            label={language === 'vi' ? 'Ngôn ngữ' : 'Language'}
            placeholder={
              language === 'vi' ? 'Chọn ngôn ngữ' : 'Select language'
            }
            className="w-full"
            classNames={{
              label: 'text-zinc-200/80 mb-1',
              input: 'bg-zinc-300/10 border-zinc-300/10',
            }}
            value={language}
            onChange={(value) => setLanguage(value || 'en')}
            data={[
              { label: 'Tiếng Việt', value: 'vi' },
              { label: 'English', value: 'en' },
            ]}
          />
        </div>
      </div>
    </>
  );
};

export default AuthForm;
