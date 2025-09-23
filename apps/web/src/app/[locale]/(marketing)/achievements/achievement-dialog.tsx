'use client';

import { Achievement } from './data';
import { Avatar } from '@ncthub/ui/avatar';
import { AvatarImage } from '@ncthub/ui/avatar';
import { AvatarFallback } from '@ncthub/ui/avatar';
import { Badge } from '@ncthub/ui/badge';
import { Button } from '@ncthub/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ncthub/ui/dialog';
import { ExternalLinkIcon } from '@ncthub/ui/icons';
import { UsersIcon } from '@ncthub/ui/icons';
import { TrophyIcon } from '@ncthub/ui/icons';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

const categoryColors = {
  Hackathon: 'default',
  Competition: 'success',
  Contest: 'warning',
  Tournament: 'secondary',
} as const;

export default function AchievementDialog({
  achievement,
  trigger,
}: {
  achievement: Achievement;
  trigger: React.ReactNode;
}) {
  const [imageError, setImageError] = useState(false);

  return (
    <Dialog key={achievement.id}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto md:min-w-2xl">
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
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
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
