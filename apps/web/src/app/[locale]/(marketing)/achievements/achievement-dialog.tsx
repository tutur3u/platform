'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@ncthub/ui/avatar';
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
import { ExternalLinkIcon, TrophyIcon, UsersIcon } from '@ncthub/ui/icons';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import type { Achievement } from './data';

const categoryColors = {
  Hackathon: 'default',
  Competition: 'success',
  Contest: 'warning',
  Tournament: 'secondary',
  Award: 'default',
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
    <Dialog key={achievement.name}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto md:min-w-2xl lg:min-w-3xl xl:min-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {achievement.name}
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
                <span className="font-semibold text-foreground text-lg">
                  {achievement.achievement}
                </span>
              </div>
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
                {!imageError ? (
                  <Image
                    src={achievement.image}
                    alt={achievement.name}
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
              {achievement.teamName
                ? `Team: ${achievement.teamName}`
                : 'Members'}
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {achievement.teamMembers.map((member) => (
                <div
                  key={member.name}
                  className="flex items-center gap-3 rounded-lg bg-muted/50 p-3"
                >
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={member.avatar} alt={member.name} />
                    <AvatarFallback>
                      {member.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-foreground text-xs md:text-base">
                        {member.name}
                      </p>
                      {member.isNctMember && (
                        <Badge
                          variant="outline"
                          className="shrink-0 border-[#5FC6E5]/50 px-1.5 py-0.5 text-[#5FC6E5] text-[10px]"
                        >
                          NCT
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-muted-foreground text-xs">
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
            <p className="text-muted-foreground leading-relaxed">
              {achievement.achievementDescription}
            </p>
          </div>

          {achievement.eventLink && (
            <div className="flex justify-end">
              <Button asChild variant="outline">
                <Link
                  href={achievement.eventLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2"
                >
                  <ExternalLinkIcon className="h-4 w-4" />
                  View Event
                </Link>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
