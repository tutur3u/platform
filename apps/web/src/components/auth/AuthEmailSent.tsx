import { CheckBadgeIcon, LockClosedIcon } from '@heroicons/react/24/solid';
import { Button, Divider, Text, TextInput } from '@mantine/core';
import useTranslation from 'next-translate/useTranslation';
import { useState } from 'react';
import LanguageSelector from '../selectors/LanguageSelector';
import Link from 'next/link';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthMethod } from '../../utils/auth-handler';
import { mutate } from 'swr';
import { useRouter } from 'next/router';
import { showNotification } from '@mantine/notifications';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface AuthEmailSentProps {
  email: string;
}

const AuthEmailSent = ({ email }: AuthEmailSentProps) => {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const { t } = useTranslation('auth-email-sent');

  const [code, setCode] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const emailSentP1 = t('email-sent-p1');
  const emailSentP2 = t('email-sent-p2');

  const confirm = t('signup:confirm');
  const loading = t('common:loading');

  const noticeP1 = t('auth:notice-p1');
  const noticeP2 = t('auth:notice-p2');

  const and = t('common:and');

  const tos = t('auth:tos');
  const privacy = t('auth:privacy');

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!email || !code) throw new Error('Please fill in all fields');
      setSubmitting(true);

      const { authenticate } = await import('../../utils/auth-handler');

      const authData: {
        supabase: SupabaseClient;
        method: AuthMethod;
        email: string;
        otp: string;
      } = {
        supabase,
        method: 'login',
        email,
        otp: code,
      };

      await authenticate(authData);

      mutate('/api/user');
      mutate('/api/workspaces/current');

      // If there is a redirectedFrom URL, redirect to it
      // Otherwise, redirect to the homepage
      const { redirectedFrom: nextUrl } = router.query;
      router.push(nextUrl ? nextUrl.toString() : '/onboarding');

      return true;
    } catch (error) {
      setSubmitting(false);
      showNotification({
        title: 'Error',
        message: typeof error === 'string' ? error : 'Something went wrong',
        color: 'red',
      });

      return false;
    }
  };

  return (
    <div className="absolute inset-0 mx-2 my-4 flex items-center justify-center md:mx-8 md:my-16 lg:mx-32">
      <div className="flex w-full max-w-xl flex-col items-center gap-2 rounded-lg border border-zinc-300/10 bg-zinc-700/50 p-4 backdrop-blur-2xl md:p-8">
        <div className="grid w-full gap-2">
          <CheckBadgeIcon className="h-32 w-full text-green-500" />

          <Text size="lg" align="center" className="text-zinc-300">
            {emailSentP1}{' '}
            <span className="font-semibold text-zinc-100 underline">
              {email}
            </span>
            . {emailSentP2}
          </Text>

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
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>

        <div className="grid w-full gap-2 text-center">
          <Button
            className="border border-blue-300/10 bg-blue-300/5 text-blue-300 hover:bg-blue-300/10"
            variant="light"
            loading={submitting}
            onClick={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            disabled={!code || submitting}
          >
            {submitting ? loading : confirm}
          </Button>

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

export default AuthEmailSent;
