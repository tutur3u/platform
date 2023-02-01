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
import { mutate } from 'swr';

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

      // Update the user's profile
      mutate('/api/user');

      // If there is a nextUrl, redirect to it
      // Otherwise, redirect to the homepage
      const { nextUrl } = router.query;
      router.push(nextUrl ? nextUrl.toString() : '/');
    } catch (error) {
      alert(error || 'Something went wrong');
      setSubmitting(false);
    }
  };

  const title =
    language === 'vi'
      ? method === 'login'
        ? 'Đăng nhập'
        : method === 'signup'
        ? 'Đăng ký'
        : 'Khôi phục mật khẩu'
      : method === 'login'
      ? 'Login'
      : method === 'signup'
      ? 'Sign up'
      : 'Recover password';

  const ctaTextDefault =
    language === 'vi'
      ? method === 'login'
        ? 'Đăng nhập'
        : method === 'signup'
        ? 'Đăng ký'
        : 'Coming soon'
      : method === 'login'
      ? 'Login'
      : method === 'signup'
      ? 'Coming soon'
      : 'Coming soon';

  const ctaTextSubmitting =
    language === 'vi'
      ? method === 'login'
        ? 'Đang đăng nhập'
        : method === 'signup'
        ? 'Coming soon'
        : 'Coming soon'
      : method === 'login'
      ? 'Logging in'
      : method === 'signup'
      ? 'Coming soon'
      : 'Coming soon';

  const ctaText = submitting ? ctaTextSubmitting : ctaTextDefault;

  return (
    <>
      <Image
        src="/media/background/auth.jpg"
        alt="Featured background"
        width={1920}
        height={1080}
        className="fixed inset-0 h-screen w-screen object-cover"
      />

      <div className="absolute inset-0 z-10 mx-2 my-16 flex items-start justify-center md:mx-4 md:items-center lg:m-32">
        <div className="flex w-full max-w-xl flex-col items-center gap-4 rounded-xl bg-zinc-800/50 p-4 backdrop-blur-2xl md:p-8">
          <div className="w-fit bg-gradient-to-br from-yellow-200 via-green-200 to-green-300 bg-clip-text text-4xl font-semibold text-transparent md:text-6xl">
            Tuturuuu
          </div>

          <Divider className="w-full border-zinc-300/10" />
          <div className="text-4xl font-semibold">{title}</div>

          <div className="grid w-full gap-2">
            <TextInput
              id="username"
              icon={<UserCircleIcon className="h-5" />}
              label={language === 'vi' ? 'Tên đăng nhập' : 'Username'}
              placeholder={
                language === 'vi'
                  ? 'Tên đăng nhập hoặc email'
                  : 'Username or email'
              }
              value={form.values.email}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                form.setFieldValue('email', event.currentTarget.value)
              }
              error={form.errors.email && 'Invalid email'}
              classNames={{
                label: 'text-zinc-200/80',
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
                  label: 'text-zinc-200/80',
                  innerInput: 'placeholder-zinc-200/30',
                  input: !submitting ? 'bg-zinc-300/10 border-zinc-300/10' : '',
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
                } w-fit place-self-end transition duration-300`}
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
              disabled={isFormInvalid || method !== 'login'}
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
                className="font-semibold text-zinc-200/50 transition duration-300 hover:text-zinc-200"
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
                  : 'Sign in'}
              </button>
            </div>
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
              label: 'text-zinc-200/80',
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
