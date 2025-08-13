import { DEV_MODE } from '@/constants/common';
import { notFound } from 'next/navigation';

export default function TestPage() {
  if (!DEV_MODE) notFound();
  return <div>Test</div>;
}
