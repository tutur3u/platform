'use client';

import { Challenge } from './challenges';
import { Badge } from '@repo/ui/components/ui/badge';
import { Button } from '@repo/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/ui/card';
import { ArrowRight, Star } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ChallengeCardProps {
  challenge: Challenge;
  wsId: string;
}

const ChallengeCard: React.FC<ChallengeCardProps> = ({ challenge, wsId }) => {
  const [isTestStarted, setIsTestStarted] = useState(false);

  // Check if the test has started or not
  useEffect(() => {
    const checkTestStarted = async () => {
      const response = await fetch(
        `/api/auth/workspace/${challenge.id}/nova/start-test`
      );
      const data = await response.json();

      if (data?.test_status === 'START') {
        setIsTestStarted(true); // Set to true if test is started
      } else {
        setIsTestStarted(false); // Set to false if test isn't started
      }
    };

    checkTestStarted();
  }, [challenge.id, wsId]);

  const handleButton = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    const confirmStart = window.confirm(
      'Are you sure you want to start this challenge?'
    );

    if (confirmStart) {
      try {
        const response = await fetch(
          `/api/auth/workspace/${challenge.id}/nova/start-test`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              duration: challenge.duration,
              test_status: 'START',
            }),
          }
        );

        if (!response.ok) {
          throw new Error('Failed to update problem history');
        }

        window.location.href = `/${wsId}/challenges/${challenge.id}`;
      } catch (error) {
        console.error('Error: ', error);
      }
    }
  };

  const handleResumeTest = () => {
    window.location.href = `/${wsId}/challenges/${challenge.id}`;
  };

  return (
    <Card key={challenge.id} className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-start justify-between">
          <span>{challenge.title}</span>
          <Badge variant="secondary">{challenge.topic}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-grow">
        <p className="text-muted-foreground mb-4">{challenge.description}</p>
        <div className="flex items-center text-yellow-500">
          <Star className="mr-1 h-4 w-4 fill-current" />
          <Star className="mr-1 h-4 w-4 fill-current" />
          <Star className="mr-1 h-4 w-4 fill-current" />
          <Star className="mr-1 h-4 w-4 stroke-current" />
          <Star className="mr-1 h-4 w-4 stroke-current" />
          <span className="text-muted-foreground ml-2 text-sm">Difficulty</span>
        </div>
      </CardContent>
      <CardFooter>
        <Button
          onClick={isTestStarted ? handleResumeTest : handleButton}
          className="w-full gap-2"
        >
          {isTestStarted ? 'Resume test' : 'Start Challenge'}{' '}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
};

export default ChallengeCard;
