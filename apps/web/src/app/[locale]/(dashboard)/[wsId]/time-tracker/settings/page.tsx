import Loading from '../loading';
import { SettingsContent } from './settings-content';
import { Suspense } from 'react';

export default function SettingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SettingsContent />
    </Suspense>
  );
}
