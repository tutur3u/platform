'use client';

import { type Achievement, achievements } from './data';
import { Avatar, AvatarFallback, AvatarImage } from '@ncthub/ui/avatar';
import { Badge } from '@ncthub/ui/badge';
import { Button } from '@ncthub/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ncthub/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ncthub/ui/dialog';
import {
  CalendarIcon,
  ExternalLinkIcon,
  TrophyIcon,
  UsersIcon,
} from '@ncthub/ui/icons';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
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

function AchievementCard({ achievement }: { achievement: Achievement }) {
  const [imageError, setImageError] = useState(false);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <motion.div variants={item}>
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
        </motion.div>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <TrophyIcon className="h-5 w-5 text-yellow-500" />
            {achievement.competitionName}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <Badge
                  variant={categoryColors[achievement.category]}
                  className="text-sm"
                >
                  {achievement.category} • {achievement.year}
                </Badge>
                <span className="text-lg font-semibold text-foreground">
                  {achievement.achievement}
                </span>
              </div>
              <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted">
                {!imageError ? (
                  <Image
                    src={achievement.image}
                    alt={achievement.competitionName}
                    fill
                    className="object-cover"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted">
                    <TrophyIcon className="h-16 w-16 text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <h4 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
              <UsersIcon className="h-4 w-4" />
              Team: {achievement.teamName}
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {achievement.teamMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 rounded-lg bg-muted/50 p-3"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={member.avatar} alt={member.name} />
                    <AvatarFallback>
                      {member.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {member.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {member.role}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-3 font-semibold text-foreground">
              Achievement Description
            </h4>
            <p className="leading-relaxed text-muted-foreground">
              {achievement.achievementDescription}
            </p>
          </div>

          <div className="flex justify-end">
            <Button asChild variant="outline">
              <Link
                href={achievement.eventLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2"
              >
                <ExternalLinkIcon className="h-4 w-4" />
                View Competition
              </Link>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AchievementsClient() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
    >
      {achievements.map((achievement) => (
        <AchievementCard key={achievement.id} achievement={achievement} />
      ))}
    </motion.div>
  );
}
