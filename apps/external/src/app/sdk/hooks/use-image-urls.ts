import { useEffect } from 'react';
import { generateSignedUrl } from '../lib/api';
import { isImageFile } from '../lib/utils';

export function useImageUrls(
  files: any[] | undefined,
  uploadPath: string,
  setImageUrls: (urls: Record<string, string>) => void
) {
  useEffect(() => {
    const loadImageUrls = async () => {
      if (!files) return;

      const newUrls: Record<string, string> = {};

      for (const file of files) {
        if (isImageFile(file.name)) {
          try {
            const result = await generateSignedUrl(
              `${uploadPath}/${file.name}`,
              3600
            );
            newUrls[file.name] = result.data.signedUrl;
          } catch (err) {
            console.error(`Failed to load image URL for ${file.name}:`, err);
          }
        }
      }

      setImageUrls(newUrls);
    };

    loadImageUrls();
  }, [files, uploadPath, setImageUrls]);
}
