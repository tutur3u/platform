'use client';

import AchievementDialog from './achievement-dialog';
import { type Achievement } from './data';
import { Badge } from '@ncthub/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ncthub/ui/card';
import { CalendarIcon, TrophyIcon, UsersIcon } from '@ncthub/ui/icons';
import { cn } from '@ncthub/utils/format';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useState } from 'react';

const categoryColors = {
  Hackathon: 'default',
  Competition: 'success',
  Contest: 'warning',
  Tournament: 'secondary',
} as const;

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export function TopThreeAchivements({
  achievements,
}: {
  achievements: Achievement[];
}) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="mx-auto grid max-w-[80%] grid-cols-1 gap-6 md:grid-cols-2"
    >
      {achievements.map((achievement, index) => (
        <AchievementDialog
          key={achievement.id}
          achievement={achievement}
          trigger={
            <motion.div
              variants={item}
              className={cn(
                index === 0 && 'col-span-1 md:col-span-2',
                index === 1 && 'col-span-1',
                index === 2 && 'col-span-1'
              )}
            >
              {index === 0 ? (
                <SpecialAchievementCard achievement={achievement} />
              ) : (
                <AchievementCard achievement={achievement} />
              )}
            </motion.div>
          }
        />
      ))}
    </motion.div>
  );
}

export function OtherAchivements({
  achievements,
}: {
  achievements: Achievement[];
}) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
    >
      {achievements.map((achievement) => (
        <AchievementDialog
          key={achievement.id}
          achievement={achievement}
          trigger={
            <motion.div variants={item}>
              <AchievementCard achievement={achievement} />
            </motion.div>
          }
        />
      ))}
    </motion.div>
  );
}

function SpecialAchievementCard({ achievement }: { achievement: Achievement }) {
  const [imageError, setImageError] = useState(false);

  return (
    <Card className="group relative aspect-video cursor-pointer overflow-hidden transition-all duration-200 hover:scale-[1.02] hover:shadow-lg">
      {/* Background Image */}
      <div className="absolute inset-0">
        {!imageError ? (
          <Image
            src={achievement.image}
            alt={achievement.competitionName}
            fill
            className="object-cover transition-transform duration-200 group-hover:scale-105"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <TrophyIcon className="h-24 w-24 text-muted-foreground" />
          </div>
        )}
        {/* Dark overlay for better text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
      </div>

      {/* Content Overlay */}
      <div className="relative z-10 flex h-full flex-col p-6 text-white">
        {/* Top section with badges */}
        <div className="flex justify-end">
          <span className="flex items-center gap-2 text-sm font-medium text-white/90">
            <CalendarIcon className="h-4 w-4" />
            {achievement.year}
          </span>
        </div>

        {/* Center section with main headers */}
        <div className="flex flex-1 items-center justify-center">
          <div className="space-y-4 text-center">
            <h2 className="text-5xl leading-tight font-extrabold text-white">
              {achievement.competitionName}
            </h2>
            <h3 className="text-4xl font-semibold text-white/95">
              {achievement.achievement}
            </h3>
          </div>
        </div>

        {/* Bottom section with team information */}
        <div className="flex items-center justify-center gap-2 text-white/80">
          <UsersIcon className="h-5 w-5" />
          <span className="font-medium">{achievement.teamName}</span>
          <span>•</span>
          <span>{achievement.teamMembers.length} members</span>
        </div>
      </div>
    </Card>
  );
}

function AchievementCard({ achievement }: { achievement: Achievement }) {
  const [imageError, setImageError] = useState(false);

  return (
    <Card className="group flex h-full cursor-pointer flex-col justify-between transition-all duration-200 hover:scale-[1.02] hover:shadow-lg">
      <CardHeader>
        <div className="relative mb-4 aspect-video w-full overflow-hidden rounded-lg bg-muted">
          {!imageError ? (
            <Image
              src={achievement.image}
              alt={achievement.competitionName}
              fill
              className="object-cover transition-transform duration-200 group-hover:scale-105"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <TrophyIcon className="h-12 w-12 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="mb-2 flex items-center justify-between">
          <Badge
            variant={categoryColors[achievement.category]}
            className="text-xs"
          >
            {achievement.category}
          </Badge>
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <CalendarIcon className="h-3 w-3" />
            {achievement.year}
          </span>
        </div>
        <CardTitle className="line-clamp-2 text-lg leading-tight">
          {achievement.competitionName}
        </CardTitle>
        <CardDescription className="text-base font-medium text-foreground">
          {achievement.achievement}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <UsersIcon className="h-4 w-4" />
          <span className="font-medium">{achievement.teamName}</span>
          <span>•</span>
          <span>{achievement.teamMembers.length} members</span>
        </div>
      </CardContent>
    </Card>
  );
}
