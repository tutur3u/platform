import { getTranslations } from 'next-intl/server';
import {
  fetchSharedFormData,
  getSharedFormPresentation,
} from './shared-form-data';
import {
  contentType,
  createSharedFormSocialImage,
  size,
} from './shared-form-social-image';

export { contentType, size };
export const runtime = 'edge';
export const revalidate = 3600;

interface Props {
  params: Promise<{
    shareCode: string;
  }>;
}

export default async function Image({ params }: Props) {
  const { shareCode } = await params;
  const t = await getTranslations('forms');
  const { status, data } = await fetchSharedFormData(shareCode, {
    revalidateSeconds: 3600,
  });
  const strings = {
    brand: t('brand'),
    fallbackTitle: t('shared.metadata_fallback_title'),
    fallbackDescription: t('shared.metadata_fallback_description'),
    protectedDescription: t('shared.metadata_protected_description'),
    unavailableDescription: t('shared.unavailable_description'),
    openGraphAlt: '',
  };
  const presentation = getSharedFormPresentation(data?.form, strings, status);

  return await createSharedFormSocialImage({
    form: data?.form,
    status,
    strings: {
      ...strings,
      openGraphAlt: t('shared.open_graph_alt', {
        title: presentation.title || strings.fallbackTitle,
      }),
    },
  });
}
