import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { Text, Stack } from '@mantine/core';

interface AuthEmailSentProps {
  email: string;
  emailSentP1: string;
  emailSentP2: string;
}

const AuthEmailSent = ({
  email,
  emailSentP1,
  emailSentP2,
}: AuthEmailSentProps) => {
  return (
    <>
      <div className="absolute inset-0 mx-4 my-32 flex items-start justify-center md:mx-4 md:items-center lg:mx-32">
        <div className="flex w-full max-w-xl flex-col items-center gap-4 rounded-xl bg-zinc-700/50 p-4 backdrop-blur-2xl md:p-8">
          <Text size="lg" mt="md" color="muted" align="center">
            {emailSentP1} <span className="font-semibold">{email}</span>.{' '}
            {emailSentP2}
          </Text>
          <CheckCircleIcon className="h-36 text-green-500" />
        </div>
      </div>
    </>
  );
};

export default AuthEmailSent;
