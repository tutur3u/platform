'use client';

import BlogDetailClient from './client';
import { createClient } from '@ncthub/supabase/next/client';
import { notFound } from 'next/navigation';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

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
  const supabase = createClient();
  const params = useParams();

  const [blogDetail, setBlogDetail] = useState<BlogDetail | null>(null);

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

  useEffect(() => {
    if (params.id) fetchBlogDetail();
  }, [params.id]);

  if (!blogDetail) return null;

  console.log('blogDetail', blogDetail);

  return <BlogDetailClient blog={blogDetail} />;
}
