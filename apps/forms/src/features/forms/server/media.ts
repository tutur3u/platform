import type { SupabaseClient } from '@tuturuuu/supabase';
import type { Database } from '@tuturuuu/types';
import { createDefaultFormStudioInput } from '../schema';
import type { FormDefinition } from '../types';

export const DEFAULT_FORM_MEDIA =
  createDefaultFormStudioInput().theme.coverImage;

export function hasFormMedia(media: {
  storagePath?: string | null;
  url?: string | null;
}) {
  return Boolean(media.storagePath || media.url);
}

export function sanitizeFormMediaForStorage(
  media:
    | {
        storagePath?: string | null;
        url?: string | null;
        alt?: string | null;
      }
    | undefined
): {
  storagePath: string;
  url: string;
  alt: string;
} {
  return {
    storagePath: media?.storagePath ?? '',
    url: media?.storagePath ? '' : (media?.url ?? ''),
    alt: media?.alt ?? '',
  };
}

async function resolveFormMedia(
  supabase: SupabaseClient<Database>,
  media:
    | {
        storagePath?: string | null;
        url?: string | null;
        alt?: string | null;
      }
    | undefined
): Promise<{
  storagePath: string;
  url: string;
  alt: string;
}> {
  const normalized = {
    storagePath: media?.storagePath ?? DEFAULT_FORM_MEDIA.storagePath,
    url: media?.url ?? DEFAULT_FORM_MEDIA.url,
    alt: media?.alt ?? DEFAULT_FORM_MEDIA.alt,
  };

  if (!normalized.storagePath) {
    return normalized;
  }

  const { data, error } = await supabase.storage
    .from('workspaces')
    .createSignedUrl(normalized.storagePath, 60 * 60);

  if (error || !data?.signedUrl) {
    return normalized;
  }

  return {
    ...normalized,
    url: data.signedUrl,
  };
}

export async function resolveFormDefinitionMedia(
  supabase: SupabaseClient<Database>,
  definition: FormDefinition
) {
  const coverImage = await resolveFormMedia(
    supabase,
    definition.theme.coverImage
  );
  const sectionMediaEntries = await Promise.all(
    definition.sections.map(async (section) => [
      section.id,
      await resolveFormMedia(supabase, section.image),
    ])
  );
  const optionMediaEntries = await Promise.all(
    definition.sections.flatMap((section) =>
      section.questions.flatMap((question) =>
        question.options.map(
          async (option) =>
            [option.id, await resolveFormMedia(supabase, option.image)] as const
        )
      )
    )
  );
  const questionMediaEntries = await Promise.all(
    definition.sections.flatMap((section) =>
      section.questions.map(
        async (question) =>
          [
            question.id,
            await resolveFormMedia(supabase, question.image),
          ] as const
      )
    )
  );
  const resolvedSectionImages: FormDefinition['theme']['sectionImages'] =
    Object.fromEntries(sectionMediaEntries);
  const resolvedOptionImages = new Map(optionMediaEntries);
  const resolvedQuestionImages = new Map(questionMediaEntries);

  return {
    ...definition,
    theme: {
      ...definition.theme,
      coverImage,
      sectionImages: resolvedSectionImages,
    },
    sections: definition.sections.map((section) => ({
      ...section,
      image: resolvedSectionImages[section.id] ?? DEFAULT_FORM_MEDIA,
      questions: section.questions.map((question) => ({
        ...question,
        image: resolvedQuestionImages.get(question.id) ?? DEFAULT_FORM_MEDIA,
        options: question.options.map((option) => ({
          ...option,
          image: resolvedOptionImages.get(option.id) ?? DEFAULT_FORM_MEDIA,
        })),
      })),
    })),
  };
}
