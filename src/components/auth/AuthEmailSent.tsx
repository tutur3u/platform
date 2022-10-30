import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { Text, Stack } from '@mantine/core';

const AuthEmailSent = ({ email }: { email: string }) => {
  return (
    <Stack>
      <Text size="lg" mt="md" color="muted" align="center">
        A confirmation email has been sent to your email{' '}
        <span className="font-semibold">{email}</span>. Click the link inside to
        finish your signup.
      </Text>
      <CheckCircleIcon className="h-20 text-green-500" />
    </Stack>
  );
};

export default AuthEmailSent;
