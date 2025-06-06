import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { ArrowRight, BookOpen, Bot, Code, Zap } from '@tuturuuu/ui/icons';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export default async function HomePage({
  params,
}: {
  params: Promise<{
    wsId: string;
  }>;
}) {
  const { wsId } = await params;
  const t = await getTranslations('home-hero');

  const user = await getCurrentUser();
  return (
    <div className="container mx-auto space-y-8 px-4 py-12">
      {user && (
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-muted-foreground">
            {t('welcome', { username: user.display_name || '' })}
          </h2>
        </div>
      )}
      <div className="mb-12 text-center">
        <h1 className="mb-4 text-4xl font-extrabold tracking-tight lg:text-5xl">
          {t('badge')}
        </h1>
        <p className="mx-auto max-w-2xl text-xl text-ellipsis whitespace-nowrap text-muted-foreground">
          {t('title')}
        </p>
      </div>
      <div className="mb-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Link href={`/${wsId}/courses`}>
          <Card className="cursor-pointer bg-linear-to-br from-blue-500 to-purple-600 text-white transition-all duration-300 hover:scale-105 hover:shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                {t('cards.courses.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-blue-100">
                {t('cards.courses.description')}
              </CardDescription>
            </CardContent>
          </Card>
        </Link>
        <Link href={`/${wsId}/quizzes`}>
          <Card className="cursor-pointer bg-linear-to-br from-green-500 to-teal-600 text-white transition-all duration-300 hover:scale-105 hover:shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                {t('cards.quizzes.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-green-100">
                {t('cards.quizzes.description')}
              </CardDescription>
            </CardContent>
          </Card>
        </Link>
        <Link href={`/${wsId}/challenges`}>
          <Card className="flex h-full cursor-pointer flex-col bg-linear-to-br from-yellow-500 to-orange-600 text-white transition-all duration-300 hover:scale-105 hover:shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                {t('cards.challenges.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <CardDescription className="text-yellow-100">
                {t('cards.challenges.description')}
              </CardDescription>
            </CardContent>
          </Card>
        </Link>
        <Link href={`/${wsId}/ai-chat`}>
          <Card className="flex h-full cursor-pointer flex-col bg-linear-to-br from-red-500 to-pink-600 text-white transition-all duration-300 hover:scale-105 hover:shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                {t('cards.ai-chat.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <CardDescription className="text-red-100">
                {t('cards.ai-chat.description')}
              </CardDescription>
            </CardContent>
          </Card>
        </Link>
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        <Link href={`/${wsId}/certificates`}>
          <Button size="lg" className="gap-2">
            {t('get-certificate')} <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
