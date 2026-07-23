'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createUserGroupPost,
  deleteUserGroupPost,
  listUserGroupPosts,
  type UserGroupPostRecipientSummary,
  updateUserGroupPost,
} from '@tuturuuu/internal-api/posts';
import type { UserGroupPost as DBUserGroupPost } from '@tuturuuu/types/db';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const PAGINATION_LIMIT = 10;

// Re-export the generated DB type for backward compatibility
export type UserGroupPost = DBUserGroupPost & {
  recipient_summary?: UserGroupPostRecipientSummary;
};

// Form input type for creating/editing posts (only fields that can be edited)
export interface UserGroupPostFormInput {
  id?: string;
  title: string | null;
  content: string | null;
  notes: string | null;
}

export interface GroupPostsInitialData {
  posts: UserGroupPost[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export function useGroupPostsInfiniteQuery(
  wsId: string,
  groupId: string,
  canViewPosts: boolean,
  initialData?: GroupPostsInitialData
) {
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const {
    data: postsInfiniteData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    error,
  } = useInfiniteQuery<{
    posts: UserGroupPost[];
    total: number;
    hasMore: boolean;
    nextCursor: string | null;
  }>({
    queryKey: ['group-posts', wsId, groupId],
    enabled: Boolean(wsId && groupId && canViewPosts),
    initialData: initialData
      ? { pages: [initialData], pageParams: [null as string | null] }
      : undefined,
    queryFn: async ({ pageParam }) => {
      const search = new URLSearchParams({
        limit: String(PAGINATION_LIMIT),
      });
      if (pageParam) {
        search.set('cursor', pageParam as string);
      }

      const payload = await listUserGroupPosts(wsId, groupId, {
        cursor: search.get('cursor'),
        limit: PAGINATION_LIMIT,
      });

      const posts = (payload.data ?? []) as unknown as UserGroupPost[];
      const hasMore = Boolean(payload.nextCursor);

      return {
        posts,
        total: payload.count ?? 0,
        hasMore,
        nextCursor: payload.nextCursor ?? null,
      };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      return lastPage.nextCursor;
    },
    staleTime: 30 * 1000,
  });

  // Flatten posts from all pages
  const posts = useMemo(
    () => postsInfiniteData?.pages.flatMap((page) => page.posts) ?? [],
    [postsInfiniteData]
  );

  const totalCount = useMemo(
    () => postsInfiniteData?.pages[0]?.total ?? 0,
    [postsInfiniteData]
  );

  // Intersection Observer for auto-loading
  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return {
    posts,
    totalCount,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    loadMoreRef,
    error,
    fetchNextPage,
  };
}

export function useUpsertPostMutation(
  groupId: string | undefined,
  wsId: string
) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (post: UserGroupPostFormInput) => {
      if (!groupId) throw new Error('Missing groupId');
      const payload = {
        title: post.title,
        content: post.content,
        notes: post.notes,
      };

      if (post.id) {
        await updateUserGroupPost(wsId, groupId, post.id, payload);
        return { kind: 'update' as const, id: post.id };
      }

      await createUserGroupPost(wsId, groupId, payload);
      return { kind: 'create' as const, id: post.id ?? '' };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['group-posts', wsId, groupId],
      });
      toast.success(t('common.saved'));
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('common.error'));
    },
  });
}

export function useDeletePostMutation(
  groupId: string | undefined,
  wsId: string
) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId: string) => {
      if (!groupId) throw new Error('Missing groupId');
      await deleteUserGroupPost(wsId, groupId, postId);
      return { postId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['group-posts', wsId, groupId],
      });
      toast.success(t('common.deleted'));
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('common.error'));
    },
  });
}

// Hook for managing post dialog state with performance optimization
export function usePostDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [post, setPost] = useState<UserGroupPostFormInput | undefined>();

  const openDialog = useCallback((postToEdit?: UserGroupPost) => {
    setPost(
      postToEdit || {
        title: '',
        content: '',
        notes: '',
      }
    );
    setIsOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setPost(undefined);
    setIsOpen(false);
  }, []);

  // Optimized input change handler using functional updates
  const updateField = useCallback(
    (field: keyof UserGroupPostFormInput, value: string) => {
      setPost((prev) => {
        if (!prev) return prev;
        // Only update if value actually changed
        if (prev[field] === value) return prev;
        return { ...prev, [field]: value };
      });
    },
    []
  );

  return {
    isOpen,
    post,
    openDialog,
    closeDialog,
    updateField,
    setIsOpen,
  };
}

// Hook for managing display configs
export function usePostConfigs() {
  const [configs, setConfigs] = useState({
    showContent: true,
    showStatus: true,
  });

  const setShowContent = useCallback((showContent: boolean) => {
    setConfigs((prev) => ({ ...prev, showContent }));
  }, []);

  const setShowStatus = useCallback((showStatus: boolean) => {
    setConfigs((prev) => ({ ...prev, showStatus }));
  }, []);

  return {
    configs,
    setShowContent,
    setShowStatus,
  };
}
