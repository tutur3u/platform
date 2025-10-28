import { create } from 'zustand';

interface SdkStore {
  uploadPath: string;
  setUploadPath: (path: string) => void;

  isUploading: boolean;
  setIsUploading: (uploading: boolean) => void;

  uploadStatus: string;
  setUploadStatus: (status: string) => void;

  deletingFiles: Set<string>;
  addDeletingFile: (filePath: string) => void;
  removeDeletingFile: (filePath: string) => void;

  imageUrls: Record<string, string>;
  setImageUrls: (urls: Record<string, string>) => void;
}

export const useSdkStore = create<SdkStore>((set) => ({
  uploadPath: 'gallery',
  setUploadPath: (path) => set({ uploadPath: path }),

  isUploading: false,
  setIsUploading: (uploading) => set({ isUploading: uploading }),

  uploadStatus: '',
  setUploadStatus: (status) => set({ uploadStatus: status }),

  deletingFiles: new Set(),
  addDeletingFile: (filePath) =>
    set((state) => ({
      deletingFiles: new Set(state.deletingFiles).add(filePath),
    })),
  removeDeletingFile: (filePath) =>
    set((state) => {
      const next = new Set(state.deletingFiles);
      next.delete(filePath);
      return { deletingFiles: next };
    }),

  imageUrls: {},
  setImageUrls: (urls) => set({ imageUrls: urls }),
}));
