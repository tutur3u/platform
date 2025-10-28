'use client';

import { useSdkStore } from '@/store/sdk-store';
import { Breadcrumb } from './components/breadcrumb';
import { ErrorDisplay } from './components/error-display';
import { FileGrid } from './components/file-grid';
import { StorageAnalytics } from './components/storage-analytics';
import { SuccessBanner } from './components/success-banner';
import { UploadSection } from './components/upload-section';
import { useFileHandlers } from './hooks/use-file-handlers';
import { useImageUrls } from './hooks/use-image-urls';
import { useStorageData } from './hooks/use-storage-data';

export default function SDKPage() {
  // Global state
  const {
    uploadPath,
    setUploadPath,
    isUploading,
    setIsUploading,
    uploadStatus,
    setUploadStatus,
    deletingFiles,
    addDeletingFile,
    removeDeletingFile,
    imageUrls,
    setImageUrls,
  } = useSdkStore();

  // Data fetching
  const {
    analytics,
    rootFiles,
    folderFiles,
    deleteMutation,
    uploadMutation,
    refreshData,
  } = useStorageData(uploadPath);

  // Load image URLs
  useImageUrls(folderFiles.data?.data, uploadPath, setImageUrls);

  // Event handlers
  const { handleFileUpload, handleDownload, handleDelete } = useFileHandlers(
    uploadPath,
    analytics.data,
    uploadMutation,
    deleteMutation,
    setUploadStatus,
    setIsUploading,
    addDeletingFile,
    removeDeletingFile
  );

  // Navigation handlers
  const handleFolderClick = (folderName: string) => {
    const newPath = uploadPath ? `${uploadPath}/${folderName}` : folderName;
    setUploadPath(newPath);
  };

  const handleNavigate = (path: string) => {
    setUploadPath(path);
  };

  // Error handling
  const error = analytics.error || rootFiles.error || folderFiles.error;
  if (error) {
    return <ErrorDisplay error={error as Error} />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-8">
      {/* Header */}
      <div>
        <h1 className="mb-4 font-bold text-3xl">
          Tuturuuu SDK - Storage Example
        </h1>
        <p className="text-gray-600">
          Demonstrating the Tuturuuu SDK for workspace storage operations
        </p>
      </div>

      {/* Upload Section */}
      <UploadSection
        uploadPath={uploadPath}
        setUploadPath={setUploadPath}
        isUploading={isUploading}
        uploadStatus={uploadStatus}
        onFileUpload={handleFileUpload}
      />

      {/* Storage Analytics */}
      <StorageAnalytics
        analytics={analytics.data}
        isLoading={analytics.isLoading}
      />

      {/* Breadcrumb Navigation */}
      <Breadcrumb currentPath={uploadPath} onNavigate={handleNavigate} />

      {/* Folder Files */}
      <FileGrid
        files={folderFiles.data}
        isLoading={folderFiles.isLoading}
        uploadPath={uploadPath}
        imageUrls={imageUrls}
        deletingFiles={deletingFiles}
        onDownload={handleDownload}
        onDelete={handleDelete}
        onRefresh={refreshData}
        onFolderClick={handleFolderClick}
      />

      {/* Success Banner */}
      <SuccessBanner />
    </div>
  );
}
