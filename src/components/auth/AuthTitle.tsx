import { Text } from '@mantine/core';

interface AuthTitleProps {
  label: string;
}

const AuthTitle = ({ label }: AuthTitleProps) => (
  <Text className="text-3xl" weight={700} align="center">
    {label}
  </Text>
);

export default AuthTitle;
