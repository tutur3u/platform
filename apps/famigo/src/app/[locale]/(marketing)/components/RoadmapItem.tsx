'use client';

import { motion } from 'framer-motion';
import type React from 'react';

interface RoadmapItemProps {
  date: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color?: string; // Added color customization
}

const RoadmapItem = ({
  date,
  title,
  description,
  icon,
  color = 'primary',
}: RoadmapItemProps) => {
  // Get color classes based on color prop
  const getColorClasses = () => {
    switch (color) {
      case 'blue':
        return 'bg-blue-500 text-background dark:bg-blue-600';
      case 'purple':
        return 'bg-purple-500 text-background dark:bg-purple-600';
      case 'pink':
        return 'bg-pink-500 text-background dark:bg-pink-600';
      case 'orange':
        return 'bg-orange-500 text-background dark:bg-orange-600';
      case 'green':
        return 'bg-green-500 text-background dark:bg-green-600';
      default:
        return 'bg-primary text-background';
    }
  };

  // Line color classes
  const getLineClasses = () => {
    switch (color) {
      case 'blue':
        return 'bg-blue-500/20 dark:bg-blue-500/30';
      case 'purple':
        return 'bg-purple-500/20 dark:bg-purple-500/30';
      case 'pink':
        return 'bg-pink-500/20 dark:bg-pink-500/30';
      case 'orange':
        return 'bg-orange-500/20 dark:bg-orange-500/30';
      case 'green':
        return 'bg-green-500/20 dark:bg-green-500/30';
      default:
        return 'bg-primary/20 dark:bg-primary/30';
    }
  };

  // Text color classes
  const getTextClasses = () => {
    switch (color) {
      case 'blue':
        return 'text-blue-500 dark:text-blue-400';
      case 'purple':
        return 'text-purple-500 dark:text-purple-400';
      case 'pink':
        return 'text-pink-500 dark:text-pink-400';
      case 'orange':
        return 'text-orange-500 dark:text-orange-400';
      case 'green':
        return 'text-green-500 dark:text-green-400';
      default:
        return 'text-primary';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="flex gap-4"
    >
      <div className="relative flex flex-col items-center">
        <div
          className={`z-10 flex h-10 w-10 items-center justify-center rounded-full ${getColorClasses()} shadow-md`}
        >
          {icon}
        </div>
        <div className={`absolute h-full w-px ${getLineClasses()}`}></div>
      </div>
      <div className="pb-10">
        <div className={`font-medium ${getTextClasses()}`}>{date}</div>
        <h3 className="mb-2 text-lg font-bold">{title}</h3>
        <p className="text-muted-foreground">{description}</p>
      </div>
    </motion.div>
  );
};

export default RoadmapItem;
