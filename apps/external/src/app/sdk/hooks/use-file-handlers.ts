import { useCallback } from 'react';
import { downloadFile } from '../lib/api';

export function useFileHandlers(
  uploadPath: string,
  analytics: any,
  uploadMutation: any,
  deleteMutation: any,
  setUploadStatus: (status: string) => void,
  setIsUploading: (uploading: boolean) => void,
  addDeletingFile: (filePath: string) => void,
  removeDeletingFile: (filePath: string) => void
) {
  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Check storage limit before uploading
      if (analytics?.data) {
        const { totalSize, storageLimit } = analytics.data;
        const remainingSpace = storageLimit - totalSize;

        if (file.size > remainingSpace) {
          const remainingMB = (remainingSpace / 1024 / 1024).toFixed(2);
          const fileMB = (file.size / 1024 / 1024).toFixed(2);
          setUploadStatus(
            `❌ Storage limit exceeded: File size (${fileMB} MB) exceeds available space (${remainingMB} MB)`
          );
          setTimeout(() => setUploadStatus(''), 5000);
          event.target.value = '';
          return;
        }
      }

      setIsUploading(true);
      try {
        await uploadMutation.mutateAsync({
          file,
          path: uploadPath,
          onProgress: setUploadStatus,
        });
        setUploadStatus('✅ Successfully uploaded file');
        setTimeout(() => setUploadStatus(''), 2000);
      } catch (error) {
        setUploadStatus(
          `❌ Failed to upload: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        setTimeout(() => setUploadStatus(''), 5000);
      } finally {
        setIsUploading(false);
        event.target.value = '';
      }
    },
    [analytics, uploadPath, uploadMutation, setUploadStatus, setIsUploading]
  );

  const handleDownload = useCallback(
    async (filename: string, folderPath: string) => {
      try {
        await downloadFile(filename, folderPath);
      } catch (error) {
        console.error('Download error:', error);
        alert('Failed to download file');
      }
    },
    []
  );

  const handleDelete = useCallback(
    async (filename: string, folderPath: string) => {
      const filePath = folderPath ? `${folderPath}/${filename}` : filename;

      if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
        return;
      }

      addDeletingFile(filePath);

      try {
        await deleteMutation.mutateAsync([filePath]);
      } catch (error) {
        console.error('Delete error:', error);
        alert(
          `Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      } finally {
        removeDeletingFile(filePath);
      }
    },
    [addDeletingFile, removeDeletingFile, deleteMutation]
  );

  return {
    handleFileUpload,
    handleDownload,
    handleDelete,
  };
}
