import { Paper } from '@mantine/core';
import React from 'react';

interface AuthWrapperProps {
  children: React.ReactNode;
}

export default function AuthWrapper({ children }: AuthWrapperProps) {
  return (
    <div className="grid place-content-center min-h-screen">
      <div className="md:max-w-md w-screen p-4">
        <Paper radius="md" p="xl" withBorder>
          {children}
        </Paper>
      </div>
    </div>
  );
}
