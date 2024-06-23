'use client';

import { useParams } from 'next/navigation';

export default function LogoTitle() {
  const params = useParams();
  const hasWorkspace = !!params.wsId;

  if (hasWorkspace) return null;
  return <div className="text-lg md:text-2xl">Genius Junior</div>;
}
