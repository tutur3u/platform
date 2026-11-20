import type { ExternalProjectPublicationExclusion } from '@tuturuuu/types';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import type { CmsStrings } from './cms-strings';

type Entry = {
  status: string;
  excludedAssets?: ExternalProjectPublicationExclusion[];
};

export function useCmsPublicationToast({
  publishAction,
  unpublishAction,
}: Pick<CmsStrings, 'publishAction' | 'unpublishAction'>) {
  const t = useTranslations('external-projects.epm');
  return (entry: Entry | Entry[]) => {
    const entries = Array.isArray(entry) ? entry : [entry];
    const excluded = entries.flatMap((item) =>
      item.status === 'published' ? (item.excludedAssets ?? []) : []
    );
    if (!excluded.length) {
      if (!Array.isArray(entry))
        toast.success(
          entry.status === 'published' ? publishAction : unpublishAction
        );
      return;
    }
    const reasonLabel = (
      reason: ExternalProjectPublicationExclusion['reason']
    ) =>
      reason === 'tooLarge'
        ? t('publish_media_size_limit')
        : t('publish_media_unavailable');
    toast.warning(t('publish_media_excluded'), {
      closeButton: true,
      duration: Infinity,
      description: (
        <ul className="max-h-48 list-disc overflow-y-auto pl-4">
          {excluded.map(({ assetId, label, reason }) => (
            <li key={assetId}>
              {t('publish_media_item', { label, reason: reasonLabel(reason) })}
            </li>
          ))}
        </ul>
      ),
    });
  };
}
