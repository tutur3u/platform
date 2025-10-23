import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteFiles,
  fetchAnalytics,
  fetchFiles,
  uploadFile,
} from '../lib/api';

export function useStorageData(uploadPath: string) {
  const queryClient = useQueryClient();

  const analytics = useQuery({
    queryKey: ['analytics'],
    queryFn: fetchAnalytics,
  });

  const rootFiles = useQuery({
    queryKey: ['files', ''],
    queryFn: () => fetchFiles('', 50),
  });

  const folderFiles = useQuery({
    queryKey: ['files', uploadPath],
    queryFn: () => fetchFiles(uploadPath, 50),
    enabled: !!uploadPath,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFiles,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({
      file,
      path,
      onProgress,
    }: {
      file: File;
      path: string;
      onProgress?: (status: string) => void;
    }) => uploadFile(file, path, onProgress),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });

  const refreshData = () => {
    queryClient.invalidateQueries({ queryKey: ['files'] });
    queryClient.invalidateQueries({ queryKey: ['analytics'] });
  };

  return {
    analytics,
    rootFiles,
    folderFiles,
    deleteMutation,
    uploadMutation,
    refreshData,
  };
}
