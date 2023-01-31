import { EnvelopeIcon } from '@heroicons/react/24/solid';
import { Anchor, Button, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useRouter } from 'next/router';
import { ChangeEvent } from 'react';
import AuthContainer from './AuthContainer';
import AuthTitle from './AuthTitle';

export default function ResetPasswordPage() {
  const router = useRouter();

  const form = useForm({
    initialValues: {
      email: '',
      terms: true,
    },

    validate: {
      email: (val) => (/^\S+@\S+$/.test(val) ? null : 'Invalid email'),
    },
  });

  const handleLogin = async () => {
    router.push('/login');
  };

  return (
    <>
      <AuthContainer showQR={false}>
        <AuthTitle label="Forgot password?" />
        <div className="mt-6 grid grid-cols-1 gap-3 transition duration-300">
          <div className="max-md:text-lg">
            Please enter your email address to reset your password.
          </div>
          <form>
            <TextInput
              required
              label="Email"
              placeholder="example@tuturuuu.com"
              id="email"
              value={form.values.email}
              error={form.errors.email && 'Invalid email'}
              icon={<EnvelopeIcon className="w-5" />}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                form.setFieldValue('email', event.currentTarget.value)
              }
            />
          </form>
          <div className="mt-2 flex flex-col items-start md:flex-row md:items-center md:justify-between">
            <Anchor
              component="button"
              type="button"
              color="dimmed"
              size="xs"
              onClick={handleLogin}
            >
              Login with your email
            </Anchor>

            <Button
              className="mt-2 w-full rounded-lg p-2 md:mt-0 md:w-fit"
              variant="light"
              type="submit"
            >
              Reset password
            </Button>
          </div>
        </div>
      </AuthContainer>
    </>
  );
}
