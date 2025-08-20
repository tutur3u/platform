import { Suspense } from 'react';
import Loading from '../loading';
import { SettingsContent } from './settings-content';

export default function SettingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SettingsContent />
    </Suspense>
  );
}
