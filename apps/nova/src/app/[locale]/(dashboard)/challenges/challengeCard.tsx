'use client';

import type { NovaChallenge, NovaChallengeStatus } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { ArrowRight, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';

interface ChallengeCardProps {
  challenge: NovaChallenge;
}

export default function ChallengeCard({ challenge }: ChallengeCardProps) {
  const router = useRouter();

  const [status, setStatus] = useState<NovaChallengeStatus | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      const challengeStatus = await fetchChallengeStatus(challenge.id);
      setStatus(challengeStatus);
    };
    fetchStatus();
  }, [challenge.id]);

  const handleStartChallenge = async () => {
    if (confirm('Are you sure you want to start this challenge?')) {
      const status = await fetchChallengeStatus(challenge.id);

      if (status?.status === 'IN_PROGRESS') {
        router.push(`/challenges/${challenge.id}`);
        return;
      }

      const response = await fetch(
        `/api/v1/challenges/${challenge.id}/status`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startTime: new Date().toISOString(),
            endTime: new Date(
              new Date().getTime() + (challenge.duration || 0) * 60000
            ).toISOString(),
            status: 'IN_PROGRESS',
          }),
        }
      );

      if (response.ok) {
        router.push(`/challenges/${challenge.id}`);
      }
    }
  };

  const handleResumeChallenge = async () => {
    router.push(`/challenges/${challenge.id}`);
  };

  const handleViewResults = async () => {
    router.push(`/challenges/${challenge.id}/results`);
  };

  return (
    <Card key={challenge.id} className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex">
          <span>{challenge.title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-grow">
        <p className="text-muted-foreground mb-4">{challenge.description}</p>
        <div className="flex items-center">
          <Clock className="h-4 w-4" />
          <span className="text-muted-foreground ml-2 text-sm">
            Duration: {challenge.duration} minutes
          </span>
        </div>
      </CardContent>
      <CardFooter>
        {status?.status === 'IN_PROGRESS' ? (
          <Button onClick={handleResumeChallenge} className="w-full gap-2">
            Resume Challenge <ArrowRight className="h-4 w-4" />
          </Button>
        ) : status?.status === 'ENDED' ? (
          <Button onClick={handleViewResults} className="w-full gap-2">
            View Results <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleStartChallenge} className="w-full gap-2">
            Start Challenge <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

async function fetchChallengeStatus(challengeId: string) {
  const response = await fetch(`/api/v1/challenges/${challengeId}/status`);
  return response.json();
}
