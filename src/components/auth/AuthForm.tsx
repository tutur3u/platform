import { useToggle, upperFirst } from '@mantine/hooks';
import { useForm } from '@mantine/form';

import {
  TextInput,
  PasswordInput,
  Text,
  Paper,
  Group,
  Button,
  Checkbox,
  Anchor,
  Stack,
} from '@mantine/core';

import { authenticate, AuthMethod } from '../../utils/auth-handler';
import { ChangeEvent, useState } from 'react';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import { useSessionContext } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/router';

const AuthForm = () => {
  const router = useRouter();
  const { supabaseClient } = useSessionContext();

  const [method, toggle] = useToggle<AuthMethod>(['login', 'signup']);
  const [emailSent, setEmailSent] = useState<boolean>(false);
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

  const isFormInvalid = !!form.errors.email || !!form.errors.password;

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const email = form.values.email;
      const password = form.values.password;

      await authenticate({ supabaseClient, method, email, password });

      if (method === 'signup') {
        setEmailSent(true);
        setLoading(false);
        return;
      }

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
    <Paper radius="md" p="xl" withBorder>
      <Text size="xl" weight={500} align="center">
        {emailSent ? 'One more step...' : upperFirst(method)}
      </Text>

      {emailSent ? (
        <Stack>
          <Text size="lg" mt="md" color="muted" align="center">
            A confirmation email has been sent to your email{' '}
            <span className="font-semibold">{form.values.email}</span>. Click
            the link inside to finish your signup.
          </Text>
          <CheckCircleIcon className="h-20 text-green-500" />
        </Stack>
      ) : (
        <form>
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
            />

            {method === 'signup' && (
              <Checkbox
                label="I accept terms and conditions"
                checked={form.values.terms}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  form.setFieldValue('terms', event.currentTarget.checked)
                }
              />
            )}
          </Stack>

          <Group position="apart" mt="xl">
            <Anchor
              component="button"
              type="button"
              color="dimmed"
              onClick={() => toggle()}
              size="xs"
            >
              {method === 'signup'
                ? 'Already have an account? Login'
                : "Don't have an account? Sign up"}
            </Anchor>

            <Button
              variant="light"
              type="submit"
              onClick={handleAuth}
              disabled={isFormInvalid}
            >
              {getCTAText(method, loading)}
            </Button>
          </Group>
        </form>
      )}
    </Paper>
  );
};

export default AuthForm;
