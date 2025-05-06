'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useEffect, useState } from 'react';

const PDFViewer = dynamic(
  () => import('./pdf-viewer').then((mod) => mod.PDFViewer),
  { ssr: false }
);

const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];

export default function FileDisplay({
  path,
  file,
}: {
  path: string;
  file: StorageObject;
}) {
  const t = useTranslations();

  const supabase = createClient();
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchSignedUrl = async () => {
      if (!file.id || !file.name) return;
      
      const fullPath = `${path.endsWith('/') ? path : `${path}/`}${file.name}`;
      const { data, error } = await supabase.storage
        .from('workspaces')
        .createSignedUrl(fullPath, 3600);

      if (error) {
        console.error(error);
        return;
      }
      console.log(data);

      setSignedUrl(data?.signedUrl);
    };

    fetchSignedUrl();
  }, [file.id]);

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
