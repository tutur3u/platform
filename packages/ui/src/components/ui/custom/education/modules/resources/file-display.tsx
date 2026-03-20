'use client';

import { createWorkspaceStorageSignedUrl } from '@tuturuuu/internal-api/storage';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const PDFViewer = dynamic(
  () =>
    import('@tuturuuu/ui/custom/education/modules/resources/pdf-viewer').then(
      (mod) => mod.PDFViewer
    ),
  { ssr: false }
);

const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];

type ResourceFile = {
  id?: string | null;
  name?: string | null;
};

export function FileDisplay({
  path,
  file,
}: {
  path: string;
  file: ResourceFile;
}) {
  const t = useTranslations();

  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchSignedUrl = async () => {
      if (!file.id || !file.name) return;

      const fullPath = `${path.endsWith('/') ? path : `${path}/`}${file.name}`;
      const wsId = fullPath.split('/')[0];
      if (!wsId) return;
      const relativePath = fullPath.slice(wsId.length + 1);

      try {
        const nextSignedUrl = await createWorkspaceStorageSignedUrl(
          wsId,
          relativePath,
          3600
        );
        setSignedUrl(nextSignedUrl);
      } catch (error) {
        console.error(error);
        return;
      }
    };

    fetchSignedUrl();
  }, [file.id, file.name, path]);

  if (!signedUrl) return null;

  if (
    imageExtensions.includes(file.name?.split('.').pop()?.toLowerCase() || '')
  )
    return (
      <Image
        src={signedUrl}
        className="h-64 w-64 rounded-lg object-cover md:h-96 md:w-96"
        width={1000}
        height={1000}
        alt={file.name || 'Unknown file'}
      />
    );

  if (file.name?.endsWith('.pdf')) {
    return <PDFViewer url={signedUrl} />;
  }

  return (
    <div className="opacity-50">
      {t('course-details-tabs.resource_preview_unavailable')}.
    </div>
  );
}
