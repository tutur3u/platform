'use client';

import { createClient } from '@ncthub/supabase/next/client';
import { notFound, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import BlogDetailClient from './client';

export interface BlogDetail {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  date_published: string;
  category: string;
  image_url?: string;
  read_time: string;
  views_count?: number;
  likes_count?: number;
  tags?: string[];
  is_published?: boolean;
  slug?: string;
}

export default function BlogDetailPage() {
  // TODO: Remove this notFound() when the blogs feature is ready to go live
  notFound();

  const supabase = createClient();
  const params = useParams();

  const [blogDetail, setBlogDetail] = useState<BlogDetail | null>(null);

  useEffect(() => {
    const fetchBlogDetail = async () => {
      if (!params.id || typeof params.id !== 'string') {
        notFound();
        return;
      }

      const { data, error } = await supabase
        .from('neo_blogs')
        .select('*')
        .eq('id', params.id)
        .eq('is_published', true)
        .single();

      if (error) {
        console.error('Error fetching blog:', error.message);
        return;
      }

      if (!data) {
        setBlogDetail(null);
        return;
      }

      // update views count
      await supabase
        .from('neo_blogs')
        .update({ views_count: (data.views_count || 0) + 1 })
        .eq('id', data.id);

      setBlogDetail(data as BlogDetail);
    };

    if (params.id) fetchBlogDetail();
  }, [params.id, supabase]);

  if (!blogDetail) return null;

  return <BlogDetailClient blog={blogDetail!} />;
}
