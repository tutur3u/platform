'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const PAGINATION_LIMIT = 10;

export interface UserGroupPost {
  id?: string;
  group_name?: string;
  title: string | null;
  content: string | null;
  notes: string | null;
  created_at?: string;
  post_approval_status?: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
}

export function useGroupPostsInfiniteQuery(
  wsId: string,
  groupId: string,
  canViewPosts: boolean
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
    queryFn: async ({ pageParam }) => {
      const supabase = createClient();

      let query = supabase
        .from('user_group_posts')
        .select('*', { count: 'exact' })
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(PAGINATION_LIMIT);

      if (pageParam) {
        query = query.lt('created_at', pageParam as string);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      const posts = (data ?? []) as UserGroupPost[];
      const hasMore = posts.length === PAGINATION_LIMIT;
      const nextCursor =
        hasMore && posts.length > 0
          ? (posts[posts.length - 1]?.created_at ?? null)
          : null;

      return {
        posts,
        total: count ?? 0,
        hasMore,
        nextCursor,
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
    mutationFn: async (post: UserGroupPost) => {
      if (!groupId) throw new Error('Missing groupId');
      const supabase = createClient();
      const payload = {
        title: post.title,
        content: post.content,
        notes: post.notes,
        group_id: groupId,
      };

      if (post.id) {
        const { error } = await supabase
          .from('user_group_posts')
          .update(payload)
          .eq('id', post.id)
          .eq('group_id', groupId);
        if (error) throw error;
        return { kind: 'update' as const, id: post.id };
      }

      const { data, error } = await supabase
        .from('user_group_posts')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw error;
      return { kind: 'create' as const, id: data.id };
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
      const supabase = createClient();
      const { error } = await supabase
        .from('user_group_posts')
        .delete()
        .eq('id', postId)
        .eq('group_id', groupId);
      if (error) throw error;
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
  const [post, setPost] = useState<UserGroupPost | undefined>();

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
    (field: keyof UserGroupPost, value: string) => {
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
