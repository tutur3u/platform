import { readEmailAppealAccess } from '@/lib/email-appeals/flag';
import EmailAppealList from './email-appeal-list';

export default async function EmailAppealSettings({ wsId }: { wsId: string }) {
  try {
    if (!(await readEmailAppealAccess(wsId))) return null;
    return <EmailAppealList wsId={wsId} />;
  } catch {
    return null;
  }
}
