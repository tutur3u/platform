import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { cookies } from 'next/headers';
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

interface Props {
  params: Promise<{
    shareCode: string;
  }>;
}

export default async function Image({ params }: Props) {
  const { shareCode } = await params;
  const t = await getTranslations('forms');
  const cookieStore = await cookies();
  const supabase = await createAdminClient();
  const { status, data } = await fetchSharedFormData(shareCode, {
    cookieHeader: cookieStore.toString(),
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
  const transformedCoverUrl =
    presentation.coverImagePath &&
    (await supabase.storage
      .from('workspaces')
      .createSignedUrl(presentation.coverImagePath, 60 * 60, {
        transform: {
          width: size.width,
          height: size.height,
          resize: 'cover',
          quality: 80,
        },
      })
      .then((result) => result.data?.signedUrl ?? ''));

  return createSharedFormSocialImage({
    form: data?.form,
    status,
    coverImageUrl: transformedCoverUrl,
    strings: {
      ...strings,
      openGraphAlt: t('shared.open_graph_alt', {
        title: presentation.title,
      }),
    },
  });
}
