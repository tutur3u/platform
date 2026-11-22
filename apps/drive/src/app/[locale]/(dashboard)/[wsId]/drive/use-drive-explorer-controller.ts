'use client';

import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useQueryStates } from 'nuqs';
import {
  startTransition,
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type DriveAccess,
  resolveDriveBrowserState,
} from './drive-browser-state';
import type { DriveDialogState, DrivePreviewState } from './drive-dialog-state';
import { downloadDriveFiles, getDriveObjectPath } from './drive-download';
import type { DriveItemActions } from './drive-item-menu';
import { getPathSegments } from './drive-selection';
import {
  type DriveSearchUpdate,
  driveSearchParamParsers,
} from './search-params';
import { getStoragePathSegmentDisplayName } from './storage-display-name';
import { useDriveDeleteMutation } from './use-drive-delete-mutation';
import {
  useInvalidateDriveQueries,
  useWorkspaceStorageDirectoryQuery,
} from './use-drive-queries';
import { useDriveSelectionState } from './use-drive-selection-state';
import { useDriveUploads } from './use-drive-uploads';

export function useDriveExplorerController(wsId: string, access: DriveAccess) {
  const t = useTranslations('drive');
  const [searchState, setSearchState] = useQueryStates(driveSearchParamParsers);
  const [dialog, setDialog] = useState<DriveDialogState>({ kind: 'none' });
  const [preview, setPreview] = useState<DrivePreviewState>({ kind: 'closed' });
  const fileInput = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(searchState.q);
  const invalidate = useInvalidateDriveQueries(wsId);
  const canManage = access === 'manage';
  const currentPath = searchState.path;

  const directoryQuery = useWorkspaceStorageDirectoryQuery(
    wsId,
    useMemo(
      () => ({ ...searchState, q: deferredQuery }),
      [deferredQuery, searchState]
    ),
    { enabled: access === 'manage' }
  );
  const items = directoryQuery.data?.items;
  const { error, status } = directoryQuery;
  const browserState = useMemo(
    () =>
      resolveDriveBrowserState({
        access,
        error,
        items,
        path: currentPath,
        query: searchState.q,
        status,
        type: searchState.type,
      }),
    [access, currentPath, error, items, searchState.q, searchState.type, status]
  );
  const visibleFiles = useMemo(
    () => (browserState.kind === 'ready' ? browserState.files : []),
    [browserState]
  );
  // Selection covers only what is on screen, so a type chip cannot leave
  // hidden files selected for a bulk action.
  const visibleItems = useMemo(
    () =>
      browserState.kind === 'ready'
        ? [...browserState.folders, ...browserState.files]
        : [],
    [browserState]
  );
  const selection = useDriveSelectionState({
    currentPath,
    items: visibleItems,
  });

  const update = useCallback(
    (next: DriveSearchUpdate) => {
      startTransition(() => {
        void setSearchState(next);
      });
    },
    [setSearchState]
  );
  const navigate = useCallback(
    (path: string) => {
      setPreview({ kind: 'closed' });
      update({ path: path || null, q: null, type: null });
    },
    [update]
  );
  const openFolder = useCallback(
    (name: string) => navigate(currentPath ? `${currentPath}/${name}` : name),
    [currentPath, navigate]
  );
  const closeDialog = useCallback(() => setDialog({ kind: 'none' }), []);

  const uploads = useDriveUploads({ onSettled: invalidate, wsId });
  const openFilePicker = useCallback(() => fileInput.current?.click(), []);
  const uploadFiles = useCallback(
    (files: Iterable<File>) => {
      if (canManage) uploads.enqueue(files, currentPath);
    },
    [canManage, currentPath, uploads]
  );

  const deleteMutation = useDriveDeleteMutation({
    currentPath,
    wsId,
    onSuccess: async () => {
      selection.setSelectedKeys([]);
      await invalidate();
    },
    onSettled: closeDialog,
  });

  const actions: DriveItemActions = useMemo(
    () => ({
      canManage,
      onCopyPath: (item: StorageObject) => {
        navigator.clipboard
          .writeText(getDriveObjectPath(currentPath, item))
          .then(
            () => toast.success(t('toasts.path_copied')),
            () => toast.error(t('toasts.copy_failed'))
          );
      },
      onDelete: (targets) => setDialog({ kind: 'delete', items: targets }),
      onDownload: (files) => {
        const onlyFiles = files.filter((file) => file.id);
        toast.promise(downloadDriveFiles(wsId, currentPath, onlyFiles), {
          loading: t('toasts.downloading', { count: onlyFiles.length }),
          success: t('toasts.downloaded', { count: onlyFiles.length }),
          error: t('toasts.download_failed'),
        });
      },
      onMove: (targets) => setDialog({ kind: 'move', items: targets }),
      onOpen: (item) =>
        item.id
          ? setPreview({ kind: 'open', fileId: item.id })
          : openFolder(item.name ?? ''),
      onRename: (item) => setDialog({ kind: 'rename', item }),
      onShare: (item) =>
        setDialog(
          item.id
            ? { kind: 'share-file', item }
            : { kind: 'share-folder', item }
        ),
    }),
    [canManage, currentPath, openFolder, t, wsId]
  );

  const segments = getPathSegments(currentPath);
  const folderLabel = segments.length
    ? getStoragePathSegmentDisplayName(segments.at(-1) ?? '')
    : t('files');

  return {
    actions,
    browserState,
    canManage,
    closeDialog,
    currentPath,
    deleteMutation,
    dialog,
    directoryQuery,
    fileInput,
    folderLabel,
    hasMore: directoryQuery.hasNextPage ?? false,
    invalidate,
    loadedCount: items?.length ?? 0,
    navigate,
    openFilePicker,
    openFolder,
    preview,
    searchState,
    selection,
    setDialog,
    setPreview,
    update,
    uploadFiles,
    uploads,
    visibleFiles,
  };
}

export type DriveExplorerController = ReturnType<
  typeof useDriveExplorerController
>;
