'use client';

import { Button } from '@tuturuuu/ui/button';
import React from 'react';

export default function LogButton() {
  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  };
  return (
    <div>
      <Button onClick={handleLogout} className="mt-4 bg-red-500 text-white">
        Log out
      </Button>
    </div>
  );
}
