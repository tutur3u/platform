'use client';

import { blogsData } from './data';
import { Badge } from '@ncthub/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@ncthub/ui/card';
import { Award, Calendar, Clock, Sparkles, User } from '@ncthub/ui/icons';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';

// Category color mapping
const getCategoryColor = (category: string) => {
  const colors = {
    Announcement: 'bg-blue-500 text-white',
    Event: 'bg-purple-500 text-white',
    Tutorial: 'bg-green-500 text-white',
    Technology: 'bg-[#5FC6E5] text-white',
    'Project Showcase': 'bg-orange-500 text-white',
    Interview: 'bg-pink-500 text-white',
    Community: 'bg-yellow-500 text-white',
    Career: 'bg-indigo-500 text-white',
    Opinion: 'bg-red-500 text-white',
    Resources: 'bg-teal-500 text-white',
  };
  return colors[category as keyof typeof colors] || 'bg-gray-500 text-white';
};

export default function BlogsPageClient() {
  return (
    <div className="container mx-auto space-y-16 px-4 py-16">
      {/* Hero Section */}
      <div className="space-y-8 text-center">
        {/* Hero Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="inline-flex items-center gap-2"
        >
          <Sparkles className="h-5 w-5 text-[#FBC721]" />
          <Badge
            variant="outline"
            className="border-[#5FC6E5]/50 px-3 py-1 text-sm text-[#5FC6E5]"
          >
            Insights & Stories
          </Badge>
          <Sparkles className="h-5 w-5 text-[#FBC721]" />
        </motion.div>

        {/* Main Title */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-4xl leading-tight font-extrabold md:text-5xl lg:text-6xl"
        >
          <span>NEO Culture Tech</span>{' '}
          <span className="relative">
            <span className="border-b-4 border-[#FBC721] text-[#5FC6E5]">
              Blog
            </span>
            <motion.div
              className="absolute -top-2 -right-2"
              animate={{
                rotate: [0, 10, -10, 0],
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                repeatDelay: 3,
              }}
            >
              <Award className="h-5 w-5 text-[#FBC721] md:h-6 md:w-6" />
            </motion.div>
          </span>
        </motion.h1>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mx-auto max-w-3xl text-lg font-medium text-muted-foreground md:text-xl"
        >
          Stay updated with the latest tech insights, tutorials, and stories
          from our community. Explore our articles and join the conversation.
        </motion.p>
      </div>

      {/* Blog Grid */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.7 }}
        className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
      >
        {blogsData.map((blog, index) => (
          <motion.div
            key={blog.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.8 + index * 0.1 }}
            whileHover={{ y: -8 }}
          >
            <Link href={`/blogs/${blog.id}`}>
              <Card className="group h-full overflow-hidden transition-all duration-300 hover:border-[#5FC6E5]/50 hover:shadow-lg">
                {/* Blog Image */}
                {blog.imageUrl && (
                  <div className="relative h-48 w-full overflow-hidden">
                    <Image
                      src={blog.imageUrl}
                      alt={blog.title}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <Badge
                      variant="secondary"
                      className={`absolute top-4 left-4 ${getCategoryColor(blog.category)}`}
                    >
                      {blog.category}
                    </Badge>
                  </div>
                )}

                <CardHeader>
                  <CardTitle className="line-clamp-2 text-xl font-bold transition-colors group-hover:text-[#5FC6E5]">
                    {blog.title}
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <p className="line-clamp-3 text-sm text-muted-foreground">
                    {blog.excerpt}
                  </p>

                  {/* Meta Information */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      <span>{blog.author}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>
                        {new Date(blog.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{blog.readTime} read</span>
                    </div>
                  </div>

                  {/* Read More Link */}
                  <div className="pt-2">
                    <span className="inline-flex items-center text-sm font-medium text-[#5FC6E5] group-hover:underline">
                      Read More
                      <svg
                        className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
