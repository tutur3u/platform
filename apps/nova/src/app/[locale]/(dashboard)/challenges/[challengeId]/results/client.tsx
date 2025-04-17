'use client';

import ProblemCard from './components/ProblemCard';
import SessionCard from './components/SessionCard';
import { ResultsData } from './types';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { ArrowLeft, BookOpen } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { useRouter } from 'next/navigation';

interface Props {
  data: ResultsData;
}

export default function ResultClient({ data }: Props) {
  const router = useRouter();

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col">
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between">
          <div className="mb-4 flex items-center md:mb-0">
            <Button
              onClick={() => router.push('/challenges')}
              variant="outline"
              size="icon"
              className="mr-4 h-10 w-10 rounded-full"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-3xl font-bold">{data.challenge.title}</h1>
          </div>
        </div>

        {data.sessions.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <Card className="max-w-md">
              <CardHeader className="text-center">
                <div className="bg-muted text-muted-foreground mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                  <BookOpen className="h-10 w-10" />
                </div>
                <CardTitle>No data available</CardTitle>
                <CardDescription>
                  We couldn't find any results for this challenge.
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex justify-center">
                <Button
                  onClick={() => router.push('/challenges')}
                  className="w-full"
                >
                  Back to Challenges
                </Button>
              </CardFooter>
            </Card>
          </div>
        ) : (
          data.sessions.map((session, sessionIndex) => (
            <div key={sessionIndex} className="mb-8">
              <SessionCard session={session} sessionIndex={sessionIndex} />

              <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                {session.problems.map((problem, problemIndex) => (
                  <ProblemCard
                    key={problemIndex}
                    problem={problem}
                    problemIndex={problemIndex}
                    sessionIndex={sessionIndex}
                  />
                ))}
              </div>

              {sessionIndex < data.sessions.length - 1 && (
                <div className="col-span-full mt-8 w-full">
                  <Separator />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
