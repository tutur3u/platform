import { useTranslations } from 'next-intl';

/** Reader guidance only; publication and permissions remain authoritative. */
export function ContentNotice({ notice }: { notice?: string }) {
  const t = useTranslations('lettin');
  if (!notice?.trim()) return null;
  return (
    <div className="mb-4 break-words border border-border bg-muted p-3 text-sm">
      <strong className="block">{t('contentNotice')}</strong>
      <p className="whitespace-pre-wrap">{notice}</p>
    </div>
  );
}
