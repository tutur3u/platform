import { ReactNode } from 'react';
import { Paper } from '@mantine/core';
import React from 'react';

const AuthContainer = ({ children }: { children: ReactNode }) => (
  <div className="grid place-content-center min-h-screen">
    <div className="md:max-w-xl w-screen p-4">
      <Paper radius="md" p="xl" withBorder>
        {children}
      </Paper>
    </div>
  </div>
);

export default AuthContainer;
