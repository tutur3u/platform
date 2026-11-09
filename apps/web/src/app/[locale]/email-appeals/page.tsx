import type { Metadata } from 'next';
import EmailAppealConfirmation from './confirmation';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function EmailAppealConfirmationPage() {
  return <EmailAppealConfirmation />;
}
