'use client';

import { blogsData } from '../data';
import { Badge } from '@ncthub/ui/badge';
import { Button } from '@ncthub/ui/button';
import { ArrowLeft, Calendar, Clock, User } from '@ncthub/ui/icons';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

export default function BlogDetailPage({ params }: { params: { id: string } }) {
  const blog = blogsData.find((b) => b.id === params.id);

  if (!blog) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-16">
      {/* Back Button */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <Link href="/blogs">
          <Button variant="ghost" className="group">
            <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Back to Blogs
          </Button>
        </Link>
      </motion.div>

      <div className="mx-auto max-w-4xl">
        {/* Blog Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-8 space-y-6"
        >
          {/* Category Badge */}
          <Badge className="bg-[#5FC6E5] text-white">{blog.category}</Badge>

          {/* Title */}
          <h1 className="text-4xl leading-tight font-extrabold text-foreground md:text-5xl lg:text-6xl">
            {blog.title}
          </h1>

          {/* Meta Information */}
          <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span className="font-medium">{blog.author}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>
                {new Date(blog.date).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>{blog.readTime} read</span>
            </div>
          </div>
        </motion.div>

        {/* Featured Image */}
        {blog.imageUrl && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="relative mb-12 h-96 w-full overflow-hidden rounded-2xl"
          >
            <Image
              src={blog.imageUrl}
              alt={blog.title}
              fill
              className="object-cover"
            />
          </motion.div>
        )}

        {/* Blog Content */}
        <motion.article
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="prose prose-lg max-w-none prose-slate dark:prose-invert"
        >
          <ReactMarkdown
            components={{
              h1: ({ ...props }) => (
                <h1 className="mt-8 mb-6 text-3xl font-bold" {...props} />
              ),
              h2: ({ ...props }) => (
                <h2
                  className="mt-8 mb-4 border-b-1 border-muted pb-1 text-2xl font-bold text-[#5FC6E5]"
                  {...props}
                />
              ),
              h3: ({ ...props }) => (
                <h3 className="mt-6 mb-3 text-xl font-semibold" {...props} />
              ),
              p: ({ ...props }) => (
                <p className="mb-4 leading-relaxed" {...props} />
              ),
              ul: ({ ...props }) => (
                <ul className="mb-4 ml-6 list-disc space-y-2" {...props} />
              ),
              ol: ({ ...props }) => (
                <ol className="mb-4 ml-6 list-decimal space-y-2" {...props} />
              ),
              code: ({ inline, ...props }: any) =>
                inline ? (
                  <code
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm"
                    {...props}
                  />
                ) : (
                  <code
                    className="block rounded-lg bg-muted p-4 font-mono text-sm"
                    {...props}
                  />
                ),
              blockquote: ({ ...props }) => (
                <blockquote
                  className="border-l-4 border-[#5FC6E5] pl-4 text-muted-foreground italic"
                  {...props}
                />
              ),
            }}
          >
            {blog.content}
          </ReactMarkdown>
        </motion.article>

        {/* Back to Blogs Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mt-12 border-t pt-8"
        >
          <Link href="/blogs">
            <Button className="bg-[#5FC6E5] hover:bg-[#5FC6E5]/90">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to All Blogs
            </Button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
