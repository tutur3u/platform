import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { ArrowRight, BookOpen } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

const lessons = [
  {
    id: 'introduction',
    title: 'Introduction to Prompt Engineering',
    description:
      'Learn the basics of crafting effective prompts for AI models.',
    duration: '15 min',
  },
  {
    id: 'basic-techniques',
    title: 'Basic Techniques in Prompt Engineering',
    description:
      'Explore fundamental strategies for creating powerful prompts.',
    duration: '25 min',
  },
  {
    id: 'advanced-strategies',
    title: 'Advanced Strategies in Prompt Engineering',
    description:
      'Master complex techniques for generating high-quality AI responses.',
    duration: '30 min',
  },
  {
    id: 'best-practices',
    title: 'Best Practices in Prompt Engineering',
    description: 'Learn industry-standard practices for optimal prompt design.',
    duration: '20 min',
  },
];

export default async function LearnPage() {
  const database = await createClient();
  const {
    data: { user },
  } = await database.auth.getUser();

  if (!user?.id) {
    redirect('/login');
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="mb-6 text-3xl font-bold">Learn Prompt Engineering</h1>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {lessons.map((lesson) => (
          <Card key={lesson.id} className="flex flex-col">
            <CardHeader>
              <CardTitle>{lesson.title}</CardTitle>
              <CardDescription>{lesson.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-grow flex-col justify-between">
              <div className="mt-4 flex items-center justify-between">
                <span className="flex items-center text-muted-foreground">
                  <BookOpen className="mr-2 h-4 w-4" />
                  {lesson.duration}
                </span>
                <Link href={`/learn/${lesson.id}`}>
                  <Button variant="outline" className="gap-2">
                    Start Lesson <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
