import { TextInput, Button, PasswordInput, Divider } from '@mantine/core';
import { ChangeEvent, useState } from 'react';
import { LockClosedIcon, UserCircleIcon } from '@heroicons/react/24/solid';
import { AuthFormFields } from '../../utils/auth-handler';
import { useForm } from '@mantine/form';
import Link from 'next/link';
import useTranslation from 'next-translate/useTranslation';
import LanguageSelector from '../selectors/LanguageSelector';

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

  disableForgotPassword?: boolean;
  hideForgotPassword?: boolean;
  recoveryMode?: boolean;
  resetPasswordMode?: boolean;
  disabled?: boolean;

  onSubmit?: ({ email, password }: AuthFormFields) => Promise<void>;
}

const AuthForm = ({
  title,
  description,
  submitLabel,
  submittingLabel,

  secondaryAction,

  disableForgotPassword = true,
  hideForgotPassword = true,
  recoveryMode = false,
  resetPasswordMode = false,
  disabled = false,

  onSubmit,
}: AuthFormProps) => {
  const { t } = useTranslation('auth');

  const [submitting, setSubmitting] = useState(false);

  const form = useForm({
    initialValues: {
      email: '',
      password: '',
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

  const isFormInvalid = !!form.errors.email || !!form.errors.password;

  const handleSubmit = async () => {
    if (isFormInvalid) return;

    const { email, password } = form.values;
    setSubmitting(true);
    if (onSubmit) await onSubmit({ email, password });
    setSubmitting(false);
  };

  const ctaText = submitting ? submittingLabel : submitLabel;

  const noticeP1 = t('notice-p1');
  const noticeP2 = t('notice-p2');

  const and = t('common:and');

  const tos = t('tos');
  const privacy = t('privacy');

  const forgotPasswordLabel = t('forgot-password');

  return (
    <div className="absolute inset-0 mx-2 my-4 flex items-center justify-center md:mx-8 md:my-16 lg:mx-32">
      <div className="flex w-full max-w-xl flex-col items-center gap-4 rounded-lg border border-zinc-300/10 bg-zinc-700/50 p-4 backdrop-blur-2xl md:p-8">
        <div className="text-center">
          <div className="bg-gradient-to-br from-yellow-200 via-green-200 to-green-300 bg-clip-text py-2 text-4xl font-semibold text-transparent md:text-5xl">
            {title}
          </div>

          <div className="text-xl font-semibold text-zinc-200">
            {description}
          </div>
        </div>

        <div className="grid w-full gap-2">
          {resetPasswordMode || (
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
          )}

          {recoveryMode || (
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

          {disableForgotPassword || (
            <Link
              href="/recover"
              className={`${
                hideForgotPassword && 'pointer-events-none opacity-0'
              } ${
                submitting
                  ? 'cursor-not-allowed text-zinc-200/30'
                  : 'text-zinc-200/50 hover:text-zinc-200'
              } w-fit place-self-end transition`}
            >
              {forgotPasswordLabel}
            </Link>
          )}
        </div>

        <div className="grid w-full gap-2 text-center">
          <Button
            className="bg-blue-300/10 text-blue-300 transition hover:bg-blue-300/20"
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

          {secondaryAction && (
            <div>
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
        </div>

        <Divider className="w-full border-zinc-300/10" variant="dashed" />
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
          {noticeP2}
        </div>
        <LanguageSelector fullWidth transparent />
      </div>
    </div>
  );
};

export default AuthForm;
