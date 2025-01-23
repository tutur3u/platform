import { getChallenges } from './challenges';
import { createClient } from '@/utils/supabase/server';
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
import Link from 'next/link';
import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}
export default async function ChallengesPage({ params }: Props) {
  const database = await createClient();
  const {
    data: { user },
  } = await database.auth.getUser();
  const { wsId } = await params;
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
              <p className="text-muted-foreground mb-4">
                {challenge.description}
              </p>
              <div className="flex items-center text-yellow-500">
                <Star className="mr-1 h-4 w-4 fill-current" />
                <Star className="mr-1 h-4 w-4 fill-current" />
                <Star className="mr-1 h-4 w-4 fill-current" />
                <Star className="mr-1 h-4 w-4 stroke-current" />
                <Star className="mr-1 h-4 w-4 stroke-current" />
                <span className="text-muted-foreground ml-2 text-sm">
                  Difficulty
                </span>
              </div>
            </CardContent>
            <CardFooter>
              <Link
                href={`/${wsId}/challenges/${challenge.id}`}
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
