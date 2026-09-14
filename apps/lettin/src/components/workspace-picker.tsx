'use client';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
export function WorkspacePicker({
  current,
  workspaces,
}: {
  current: string;
  workspaces: { id: string; name?: string | null }[];
}) {
  const router = useRouter();
  const t = useTranslations('lettin');
  return (
    <select
      aria-label={t('workspace')}
      value={current}
      onChange={(e) => router.push(`/${e.target.value}`)}
      className="max-w-56 rounded-md border border-input bg-card px-3 py-2"
    >
      {workspaces.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name || t('workspace')}
        </option>
      ))}
    </select>
  );
}
