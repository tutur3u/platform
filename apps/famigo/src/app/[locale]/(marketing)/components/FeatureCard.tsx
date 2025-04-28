'use client';

import { motion } from 'framer-motion';
import React from 'react';

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}

const FeatureCard = ({ icon, title, description, color }: FeatureCardProps) => {
  // Get background color classes based on the color prop
  const getBgColorClasses = () => {
    switch (color) {
      case 'red':
        return 'bg-red-500/10 text-red-500 dark:bg-red-500/20 dark:text-red-400';
      case 'amber':
        return 'bg-amber-500/10 text-amber-500 dark:bg-amber-500/20 dark:text-amber-400';
      case 'blue':
        return 'bg-blue-500/10 text-blue-500 dark:bg-blue-500/20 dark:text-blue-400';
      case 'green':
        return 'bg-green-500/10 text-green-500 dark:bg-green-500/20 dark:text-green-400';
      case 'purple':
        return 'bg-purple-500/10 text-purple-500 dark:bg-purple-500/20 dark:text-purple-400';
      default:
        return 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary';
    }
  };

  // Get border color classes based on the color prop
  const getBorderColorClasses = () => {
    switch (color) {
      case 'red':
        return 'border-red-500/10 dark:border-red-500/20';
      case 'amber':
        return 'border-amber-500/10 dark:border-amber-500/20';
      case 'blue':
        return 'border-blue-500/10 dark:border-blue-500/20';
      case 'green':
        return 'border-green-500/10 dark:border-green-500/20';
      case 'purple':
        return 'border-purple-500/10 dark:border-purple-500/20';
      default:
        return 'border-foreground/10 dark:border-foreground/5';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      whileHover={{ y: -5 }}
      transition={{ duration: 0.3 }}
      className={`rounded-xl border ${getBorderColorClasses()} bg-background/50 dark:bg-background/20 p-6 backdrop-blur-sm`}
    >
      <div
        className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${getBgColorClasses()}`}
      >
        {icon}
      </div>
      <h3 className="mb-2 text-xl font-bold">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </motion.div>
  );
};

export default FeatureCard;
