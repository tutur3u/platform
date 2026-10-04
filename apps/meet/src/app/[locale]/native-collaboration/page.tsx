import { Suspense } from 'react';
import { NativeCollaboration } from '@/features/call/components/native-collaboration';
export default function Page() {
  return (
    <Suspense>
      <NativeCollaboration />
    </Suspense>
  );
}
