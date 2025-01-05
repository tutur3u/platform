'use client';

import App from './App';
import { useEffect, useState } from 'react';

export default function CrystalPage() {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized) return;

    setInitialized(true);
  }, [initialized]);

  if (!initialized) return null;
  return <App />;
}
