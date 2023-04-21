import { CheckBadgeIcon } from '@heroicons/react/24/solid';
import { Text } from '@mantine/core';
import useTranslation from 'next-translate/useTranslation';

interface AuthEmailSentProps {
  email: string;
}

const AuthEmailSent = ({ email }: AuthEmailSentProps) => {
  const { t } = useTranslation('auth-email-sent');

  const emailSentP1 = t('email-sent-p1');
  const emailSentP2 = t('email-sent-p2');

  return (
    <>
      <div className="absolute inset-0 mx-4 my-32 flex items-start justify-center md:mx-4 md:items-center lg:mx-32">
        <div className="flex w-full max-w-xl flex-col items-center gap-4 rounded-xl bg-zinc-700/50 p-4 text-zinc-300/70 backdrop-blur-2xl md:p-8">
          <Text size="lg" mt="md" align="center">
            {emailSentP1}{' '}
            <span className="font-semibold text-zinc-100 underline">
              {email}
            </span>
            . {emailSentP2}
          </Text>
          <CheckBadgeIcon className="h-24 text-green-500" />
        </div>
      </div>
    </>
  );
};

export default AuthEmailSent;
