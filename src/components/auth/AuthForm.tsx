import { upperFirst } from '@mantine/hooks';
import { useForm } from '@mantine/form';

import { TextInput, PasswordInput, Button, Anchor, Stack } from '@mantine/core';

import { authenticate, AuthMethod } from '../../utils/auth-handler';
import { ChangeEvent, useState } from 'react';
import { useRouter } from 'next/router';
import AuthEmailSent from './AuthEmailSent';
import { useSessionContext } from '@supabase/auth-helpers-react';
import { EnvelopeIcon, LockClosedIcon } from '@heroicons/react/24/solid';

interface AuthFormProps {
  method: AuthMethod;
  emailSent: boolean;
  onMethodToggle?: () => void;
  onSignup?: () => void;
  onSignin?: () => void;
}

const AuthForm = ({
  method,
  emailSent = false,
  onMethodToggle,
  onSignup,
  onSignin,
}: AuthFormProps) => {
  const router = useRouter();
  const { supabaseClient } = useSessionContext();
  const [loading, setLoading] = useState(false);

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
    setLoading(true);

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
        setLoading(false);
        return;
      } else onSignin?.();

      // If there is a nextUrl, redirect to it
      // Otherwise, redirect to the homepage
      const { nextUrl } = router.query;
      router.push(nextUrl ? nextUrl.toString() : '/');
    } catch (error) {
      alert(error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const getCTAText = (method: AuthMethod, loading: boolean) => {
    if (loading)
      switch (method) {
        case 'login':
          return 'Logging in...';
        case 'signup':
          return 'Signing up...';
      }

    return upperFirst(method);
  };

  return (
    <form className="min-w-lg p-2">
      <Stack>
        <TextInput
          required
          label="Email"
          placeholder="example@tuturuuu.com"
          id="email"
          value={form.values.email}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            form.setFieldValue('email', event.currentTarget.value)
          }
          error={form.errors.email && 'Invalid email'}
          icon={<EnvelopeIcon className="w-5" />}
        />

        <PasswordInput
          required
          label="Password"
          placeholder="Your password"
          id="password"
          value={form.values.password}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            form.setFieldValue('password', event.currentTarget.value)
          }
          error={
            form.errors.password &&
            'Password should include at least 6 characters'
          }
          icon={<LockClosedIcon className="w-5" />}
        />
      </Stack>

      <div className="flex flex-col items-start md:flex-row md:justify-between md:items-center mt-4">
        <Anchor
          component="button"
          type="button"
          color="dimmed"
          onClick={onMethodToggle}
          size="xs"
        >
          {method === 'signup'
            ? 'Already have an account? Login'
            : "Don't have an account? Sign up"}
        </Anchor>

        <Button
          className="p-2 w-full md:w-fit mt-2 md:mt-0 rounded-lg"
          variant="light"
          type="submit"
          onClick={handleAuth}
          disabled={isFormInvalid}
        >
          {getCTAText(method, loading)}
        </Button>
      </div>
    </form>
  );
};

export default AuthForm;
