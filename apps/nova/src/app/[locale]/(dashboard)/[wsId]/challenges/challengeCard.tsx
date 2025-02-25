'use client';

import { Challenge } from './challenges';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { ArrowRight, Star } from 'lucide-react';
import React, { useEffect, useState } from 'react';
interface Challenge {
  id: string;
  title: string;
  topic: string;
  description: string;
  created_at: string;
}
interface ChallengeCardProps {
  challenge: Challenge;
  wsId: string;
}

const ChallengeCard: React.FC<ChallengeCardProps> = ({ challenge, wsId }) => {
  const [isTestStarted, setIsTestStarted] = useState(false);
  const [isRedoTest, setIsRedoTest] = useState(false);

  useEffect(() => {
    const checkTestStatus = async () => {
      try {
        const response = await fetch(
          `/api/auth/workspace/${challenge.id}/nova/start-test`
        );
        const data = await response.json();

        if (data?.test_status === 'END') {
          setIsRedoTest(true);
          setIsTestStarted(false);
        } else if (data?.test_status === 'START') {
          setIsTestStarted(true);
          setIsRedoTest(false);
        } else {
          setIsTestStarted(false);
          setIsRedoTest(false);
        }
      } catch (error) {
        console.error('Error fetching test status:', error);
      }
    };

    checkTestStatus();
  }, [challenge.id, wsId]);

  const handleStartTestAgain = async (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();

    const confirmStart = window.confirm(
      'Are you sure you want to restart this challenge?'
    );

    if (confirmStart) {
      try {
        const response = await fetch(
          `/api/auth/workspace/${challenge.id}/nova/start-test`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              test_status: 'START',
              created_at: new Date().toISOString(),
            }),
          }
        );

        if (!response.ok) {
          throw new Error('Failed to restart challenge');
        }

        window.location.href = `/${wsId}/challenges/${challenge.id}`;
      } catch (error) {
        console.error('Error restarting challenge:', error);
      }
    }
  };

  const handleStartChallenge = async (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
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
        console.error('Error starting challenge:', error);
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
        {isTestStarted ? (
          <Button onClick={handleResumeTest} className="w-full gap-2">
            Resume Test <ArrowRight className="h-4 w-4" />
          </Button>
        ) : isRedoTest ? (
          <Button
            onClick={handleStartTestAgain}
            className="w-full gap-2 bg-blue-500 hover:bg-blue-700"
          >
            Redo Challenge <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleStartChallenge} className="w-full gap-2">
            Start Challenge <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default ChallengeCard;
