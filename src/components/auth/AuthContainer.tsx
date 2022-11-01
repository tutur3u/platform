import { ReactNode } from 'react';
import { Paper } from '@mantine/core';
import React from 'react';
import styles from './auth.module.css';

interface AuthContainerProps {
  children: ReactNode;
  showQR: boolean;
}

const AuthContainer = ({ children, showQR }: AuthContainerProps) => (
  <div
    className={`${styles.background} grid place-content-center min-h-screen`}
  >
    <div
      className={`${
        showQR ? 'md:w-[40rem]' : 'md:w-[30rem]'
      } w-screen p-4 transition duration-300`}
    >
      <Paper radius="md" p="xl" withBorder>
        <div>{children}</div>
      </Paper>
    </div>
  </div>
);

export default AuthContainer;
