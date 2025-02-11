import { getChallenges } from './challenges';
import { createClient } from '@tutur3u/supabase/next/server';
import { Badge } from '@tutur3u/ui/badge';
import { Button } from '@tutur3u/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tutur3u/ui/card';
import { ArrowRight, Star } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function ChallengesPage() {
  const database = await createClient();
  const {
    data: { user },
  } = await database.auth.getUser();

  if (!user?.id) {
    redirect('/login');
  }
  const challenges = getChallenges();

  return (
    <div className="container mx-auto p-6">
      <h1 className="mb-6 text-3xl font-bold">Prompt Engineering Challenges</h1>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {challenges.map((challenge) => (
          <Card key={challenge.id} className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-start justify-between">
                <span>{challenge.title}</span>
                <Badge variant="secondary">{challenge.topic}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-grow">
              <p className="mb-4 text-muted-foreground">
                {challenge.description}
              </p>
              <div className="flex items-center text-yellow-500">
                <Star className="mr-1 h-4 w-4 fill-current" />
                <Star className="mr-1 h-4 w-4 fill-current" />
                <Star className="mr-1 h-4 w-4 fill-current" />
                <Star className="mr-1 h-4 w-4 stroke-current" />
                <Star className="mr-1 h-4 w-4 stroke-current" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Difficulty
                </span>
              </div>
            </CardContent>
            <CardFooter>
              <Link
                href={`/playground?challenge=${challenge.id}`}
                className="w-full"
              >
                <Button className="w-full gap-2">
                  Start Challenge <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
