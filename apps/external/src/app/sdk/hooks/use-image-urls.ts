import { useEffect } from 'react';
import { tuturuuu } from 'tuturuuu';
import { isImageFile } from '../lib/utils';

export function useImageUrls(
  files: any[] | undefined,
  uploadPath: string,
  setImageUrls: (urls: Record<string, string>) => void
) {
  useEffect(() => {
    const loadImageUrls = async () => {
      if (!files || files.length === 0) return;

      // Collect all image file paths
      const imagePaths: string[] = [];
      const imageFileNames: string[] = [];

      for (const file of files) {
        if (isImageFile(file.name)) {
          imagePaths.push(`${uploadPath}/${file.name}`);
          imageFileNames.push(file.name);
        }
      }

      if (imagePaths.length === 0) {
        setImageUrls({});
        return;
      }

      try {
        // Batch generate signed URLs using SDK method
        const result = await tuturuuu.storage.createSignedUrls(
          imagePaths,
          3600
        );

        // Map signed URLs back to file names
        const newUrls: Record<string, string> = {};
        result.data.forEach((item) => {
          if (item.signedUrl && !item.error) {
            // Extract just the filename from the full path
            const fileName = item.path.split('/').pop();
            if (fileName) {
              newUrls[fileName] = item.signedUrl;
            }
          }
        });

        // Log any errors for debugging
        if (result.errors && result.errors.length > 0) {
          console.warn(
            `Failed to generate ${result.errors.length} signed URLs:`,
            result.errors
          );
        }

        setImageUrls(newUrls);
      } catch (err) {
        console.error('Failed to load image URLs in batch:', err);
        setImageUrls({});
      }
    };

    loadImageUrls();
  }, [files, uploadPath, setImageUrls]);
}
