import { Text } from '@mantine/core';

interface AuthTitleProps {
  label: string;
}

const AuthTitle = ({ label }: AuthTitleProps) => (
  <Text size="xl" weight={500} align="center">
    {label}
  </Text>
);

export default AuthTitle;
