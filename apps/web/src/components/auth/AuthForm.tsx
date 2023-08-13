import { TextInput, Button, PasswordInput, Divider } from '@mantine/core';
import { ChangeEvent, useEffect, useState } from 'react';
import { LockClosedIcon, UserCircleIcon } from '@heroicons/react/24/solid';
import { AuthFormFields } from '../../utils/auth-handler';
import { useForm } from '@mantine/form';
import Link from 'next/link';
import useTranslation from 'next-translate/useTranslation';
import LanguageSelector from '../selectors/LanguageSelector';
import { useRouter } from 'next/router';
import { mutate } from 'swr';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export enum AuthFormMode {
  PasswordReset,
  AuthWithOTP,
  AuthWithPassword,
}

interface AuthFormProps {
  title: string;
  description: string;
  submitLabel: string;
  submittingLabel: string;
  secondaryAction?: {
    description?: string;
    label: string;
    href: string;
  };

  mode: AuthFormMode;
  step?: 1 | 2;
  steps?: number[];

  modeProps?: {
    label: string;
    onSwitch: () => void;
  };

  onSubmit?: ({ email, password, otp }: AuthFormFields) => Promise<boolean>;
  disabled?: boolean;
}

const AuthForm = ({
  title,
  description,
  submitLabel,
  submittingLabel,
  secondaryAction,

  mode = AuthFormMode.AuthWithOTP,
  step = 1,
  steps = [1],

  modeProps,

  onSubmit,
  disabled = false,
}: AuthFormProps) => {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        setSubmitting(true);

        const userPromise = mutate('/api/user');
        const workspacesPromise = mutate('/api/workspaces/current');
        const invitesPromise = mutate('/api/workspaces/invites');

        await Promise.all([userPromise, workspacesPromise, invitesPromise]);
        router.push('/onboarding');
      }
    };

    if (mode !== AuthFormMode.PasswordReset) checkSession();
  }, [supabase.auth, router, mode]);

  const { t } = useTranslation('auth');

  const form = useForm({
    initialValues: {
      email: '',
      password: '',
      otp: '',
      terms: true,
    },

    validate: {
      email: (val) => (/^\S+@\S+$/.test(val) ? null : 'Invalid email'),
      password: (val) =>
        val.length <= 8
          ? 'Password should include at least 8 characters'
          : null,
    },
  });

  const isFormInvalid =
    (mode === AuthFormMode.PasswordReset
      ? !form.values.password || form.values.password.length < 8
      : !form.values.email) ||
    (mode === AuthFormMode.AuthWithPassword &&
      (!form.values.password || form.values.password.length < 8)) ||
    (mode === AuthFormMode.AuthWithOTP &&
      ((step === 1 && !form.values.email) ||
        (step === 2 && !form.values.otp))) ||
    !!form.errors.email ||
    !!form.errors.password;

  const handleSubmit = async () => {
    if (isFormInvalid) return;
    setSubmitting(true);

    if (onSubmit) {
      const success = await onSubmit(form.values);
      if (!success) setSubmitting(false);
    }
  };

  // const SupabaseAuthOptions = {
  //   redirectTo: DEV_MODE
  //     ? 'http://localhost:7803/onboarding'
  //     : 'https://tuturuuu.com/onboarding',
  // };

  // async function handleSignInWithGoogle() {
  //   await supabase.auth.signInWithOAuth({
  //     provider: 'google',
  //     options: SupabaseAuthOptions,
  //   });
  // }

  const ctaText =
    step !== steps[steps.length - 1]
      ? submitting
        ? t('common:loading')
        : t('common:continue')
      : submitting
      ? submittingLabel
      : submitLabel;

  const noticeP1 = t('notice-p1');
  const noticeP2 = t('notice-p2');

  const and = t('common:and');

  const tos = t('tos');
  const privacy = t('privacy');

  return (
    <div className="absolute inset-0 mx-2 my-4 flex items-center justify-center md:mx-8 md:my-16 lg:mx-32">
      <div className="flex w-full max-w-xl flex-col items-center gap-2 rounded-lg border border-zinc-300/10 bg-zinc-700/50 p-4 backdrop-blur-2xl md:p-8">
        <div className="text-center">
          <div className="bg-gradient-to-br from-yellow-200 via-green-200 to-green-300 bg-clip-text py-2 text-4xl font-semibold text-transparent md:text-5xl">
            {title}
          </div>

          <div className="text-xl font-semibold text-zinc-200">
            {description}
          </div>
        </div>

        <div className="grid w-full gap-2">
          {mode !== AuthFormMode.PasswordReset && (
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
              disabled={
                submitting || (step === 2 && mode === AuthFormMode.AuthWithOTP)
              }
              withAsterisk={false}
              required
            />
          )}

          {(mode === AuthFormMode.PasswordReset ||
            mode === AuthFormMode.AuthWithPassword) && (
            <PasswordInput
              id="password"
              icon={<LockClosedIcon className="h-5" />}
              label={t('password')}
              placeholder="••••••••"
              value={form.values.password}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                form.setFieldValue('password', event.currentTarget.value)
              }
              error={
                form.errors.password &&
                'Password should include at least 8 characters'
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

          {step === 2 && mode === AuthFormMode.AuthWithOTP && (
            <TextInput
              label="Verification code"
              placeholder="••••••"
              classNames={{
                label: 'text-zinc-200/80 mb-1',
                input:
                  'bg-zinc-300/10 border-zinc-300/10 placeholder-zinc-200/30',
              }}
              icon={<LockClosedIcon className="h-5" />}
              disabled={submitting}
              value={form.values.otp}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                form.setFieldValue('otp', event.currentTarget.value)
              }
            />
          )}
        </div>

        <div className="grid w-full gap-2 text-center">
          <Divider className="w-full border-zinc-300/10" />

          <Button
            className="border border-blue-300/10 bg-blue-300/5 text-blue-300 hover:bg-blue-300/10"
            variant="light"
            loading={submitting}
            onClick={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            disabled={isFormInvalid || disabled}
          >
            {ctaText}
          </Button>

          {step === 2 && modeProps && (
            <Button
              variant="light"
              className="border border-zinc-300/10 bg-transparent font-semibold text-zinc-300 hover:bg-zinc-300/10"
              disabled={!modeProps?.onSwitch || submitting}
              onClick={modeProps.onSwitch}
            >
              {modeProps.label}
            </Button>
          )}

          {secondaryAction && (
            <div className="mt-2">
              {secondaryAction.description && (
                <>
                  <span className="text-zinc-200/30">
                    {secondaryAction.description}
                  </span>{' '}
                </>
              )}
              <Link
                href={secondaryAction.href}
                className="font-semibold text-zinc-200/50 transition hover:text-zinc-200"
              >
                {secondaryAction.label}
              </Link>
            </div>
          )}

          {/* {!recoveryMode && !resetPasswordMode && (
            <>
              <Divider className="w-full border-zinc-300/10" variant="dashed" />
              <div className="flex items-center justify-center gap-2">
                <Button
                  className="w-full rounded border border-zinc-300/10 bg-zinc-300/10 p-1 transition hover:bg-zinc-300/20"
                  onClick={handleSignInWithGoogle}
                  size="lg"
                >
                  <Image
                    width={30}
                    height={30}
                    src="/media/google-logo.png"
                    alt="Google logo"
                  />
                </Button>
              </div>
            </>
          )} */}

          <Divider className="w-full border-zinc-300/10" />
        </div>

        <div className="grid gap-2">
          <div className="text-center text-sm font-semibold text-zinc-300/60">
            {noticeP1}{' '}
            <Link
              href="/terms"
              className="text-zinc-200/80 underline decoration-zinc-200/80 underline-offset-2 transition hover:text-white hover:decoration-white"
            >
              {tos}
            </Link>{' '}
            {and}{' '}
            <Link
              href="/privacy"
              className="text-zinc-200/80 underline decoration-zinc-200/80 underline-offset-2 transition hover:text-white hover:decoration-white"
            >
              {privacy}
            </Link>{' '}
            {noticeP2}.
          </div>
          <LanguageSelector fullWidth transparent />
        </div>
      </div>
    </div>
  );
};

export default AuthForm;
