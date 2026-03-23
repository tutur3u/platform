'use client';

import { Badge } from '@ncthub/ui/badge';
import { Button } from '@ncthub/ui/button';
import { ArrowLeft, Calendar, Clock, User } from '@ncthub/ui/icons';
import { EditorContent, StarterKit, useEditor } from '@ncthub/ui/tiptap';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import type { BlogDetail } from './page';

export default function BlogDetailClient({ blog }: { blog: BlogDetail }) {
  // Parse content if it's a string
  const parsedContent =
    typeof blog.content === 'string'
      ? (() => {
          try {
            return JSON.parse(blog.content);
          } catch (error) {
            console.error('Failed to parse blog content:', error);
            return {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: blog.content }],
                },
              ],
            };
          }
        })()
      : blog.content;

  const editor = useEditor({
    editable: false,
    content: parsedContent,
    extensions: [StarterKit],
    editorProps: {
      attributes: {
        class: 'prose prose-lg max-w-none prose-slate dark:prose-invert',
      },
    },
  });

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
          <h1 className="font-extrabold text-4xl text-foreground leading-tight md:text-5xl lg:text-6xl">
            {blog.title}
          </h1>

          {/* Meta Information */}
          <div className="flex flex-wrap items-center gap-6 text-muted-foreground text-sm">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span className="font-medium">{blog.author}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>
                {new Date(blog.date_published).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>{blog.read_time} read</span>
            </div>
          </div>
        </motion.div>

        {/* Featured Image */}
        {blog.image_url && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="relative mb-12 h-96 w-full overflow-hidden rounded-2xl"
          >
            <Image
              src={blog.image_url}
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
        >
          <EditorContent editor={editor} />
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
