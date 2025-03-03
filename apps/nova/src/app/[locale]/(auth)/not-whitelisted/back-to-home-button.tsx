'use client';

import { Button } from '@tuturuuu/ui/button';
import { useRouter } from 'next/navigation';

export default function BackToHomeButton() {
  const router = useRouter();

  const handleClick = () => {
    router.push('/');
  };

  return <Button onClick={handleClick}>Back To Home</Button>;
}
