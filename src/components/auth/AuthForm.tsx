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
import { useState } from 'react';

const AuthForm = () => {
  const [type, toggle] = useToggle<AuthMethod>(['login', 'register']);
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

      await authenticate(type, email, password);
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
        case 'register':
          return 'Registering...';
      }

    return upperFirst(method);
  };

  return (
    <Paper radius="md" p="xl" withBorder>
      <Text size="xl" weight={500} align="center">
        {upperFirst(type)}
      </Text>

      <form>
        <Stack>
          <TextInput
            required
            label="Email"
            placeholder="example@tuturuuu.com"
            id="email"
            value={form.values.email}
            onChange={(event) =>
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
            onChange={(event) =>
              form.setFieldValue('password', event.currentTarget.value)
            }
            error={
              form.errors.password &&
              'Password should include at least 6 characters'
            }
          />

          {type === 'register' && (
            <Checkbox
              label="I accept terms and conditions"
              checked={form.values.terms}
              onChange={(event) =>
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
            {type === 'register'
              ? 'Already have an account? Login'
              : "Don't have an account? Register"}
          </Anchor>

          <Button
            variant="light"
            type="submit"
            onClick={handleAuth}
            disabled={isFormInvalid}
          >
            {getCTAText(type, loading)}
          </Button>
        </Group>
      </form>
    </Paper>
  );
};

export default AuthForm;
