'use client';

import { motion } from 'framer-motion';
import React from 'react';

interface TeamMemberProps {
  name: string;
  role: string;
  bio: string;
  icon: React.ReactNode;
  color?: string;
}

const TeamMember = ({
  name,
  role,
  bio,
  icon,
  color = 'primary',
}: TeamMemberProps) => {
  // Get gradient colors based on the color prop
  const getGradientClasses = () => {
    switch (color) {
      case 'blue':
        return 'from-blue-500/20 to-indigo-500/20 dark:from-blue-600/30 dark:to-indigo-600/30';
      case 'purple':
        return 'from-purple-500/20 to-fuchsia-500/20 dark:from-purple-600/30 dark:to-fuchsia-600/30';
      case 'pink':
        return 'from-pink-500/20 to-rose-500/20 dark:from-pink-600/30 dark:to-rose-600/30';
      case 'green':
        return 'from-green-500/20 to-emerald-500/20 dark:from-green-600/30 dark:to-emerald-600/30';
      case 'orange':
        return 'from-orange-500/20 to-amber-500/20 dark:from-orange-600/30 dark:to-amber-600/30';
      default:
        return 'from-primary/20 to-purple-500/20 dark:from-primary/30 dark:to-purple-600/30';
    }
  };

  // Text color based on the color prop
  const getTextColorClass = () => {
    switch (color) {
      case 'blue':
        return 'text-blue-500/80 dark:text-blue-400/80';
      case 'purple':
        return 'text-purple-500/80 dark:text-purple-400/80';
      case 'pink':
        return 'text-pink-500/80 dark:text-pink-400/80';
      case 'green':
        return 'text-green-500/80 dark:text-green-400/80';
      case 'orange':
        return 'text-orange-500/80 dark:text-orange-400/80';
      default:
        return 'text-primary/80 dark:text-primary/80';
    }
  };

  // Icon color based on the color prop
  const getIconColorClass = () => {
    switch (color) {
      case 'blue':
        return 'text-blue-500 dark:text-blue-400';
      case 'purple':
        return 'text-purple-500 dark:text-purple-400';
      case 'pink':
        return 'text-pink-500 dark:text-pink-400';
      case 'green':
        return 'text-green-500 dark:text-green-400';
      case 'orange':
        return 'text-orange-500 dark:text-orange-400';
      default:
        return 'text-primary dark:text-primary';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      whileHover={{ y: -5 }}
      transition={{ duration: 0.3 }}
      className="border-foreground/10 bg-background/50 dark:border-foreground/5 dark:bg-background/20 rounded-xl border p-6 text-center backdrop-blur-sm"
    >
      <div
        className={`bg-linear-to-br mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full ${getGradientClasses()} shadow-md`}
      >
        <div className={getIconColorClass()}>{icon}</div>
      </div>
      <h3 className="mb-1 text-xl font-bold">{name}</h3>
      <p className={`mb-3 text-sm ${getTextColorClass()}`}>{role}</p>
      <p className="text-muted-foreground text-sm">{bio}</p>

      {/* Add hover effect with a gradient line */}
      <div className="via-foreground/20 bg-linear-to-r mx-auto mt-4 h-1 w-0 rounded-full from-transparent to-transparent transition-all duration-300 group-hover:w-full"></div>
    </motion.div>
  );
};

export default TeamMember;
