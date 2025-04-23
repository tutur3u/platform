import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { ArrowRight, BookOpen, Code, Trophy, Zap } from '@tuturuuu/ui/icons';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export default async function HomePage() {
  const t = await getTranslations('nova');
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mb-12 text-center">
        <h1 className="mb-4 text-4xl font-extrabold tracking-tight lg:text-5xl">
          {t('badge')}
        </h1>
        <p className="text-muted-foreground mx-auto max-w-2xl text-xl">
          {t('title')}
        </p>
      </div>
      <div className="mb-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              {t('cards.learn.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-blue-100">
              {t('cards.learn.description')}
            </CardDescription>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500 to-teal-600 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              {t('cards.practice.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-green-100">
              {t('cards.practice.description')}
            </CardDescription>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-yellow-500 to-orange-600 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              {t('cards.innovate.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-yellow-100">
              {t('cards.innovate.description')}
            </CardDescription>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500 to-pink-600 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              {t('cards.compete.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-red-100">
              {t('cards.compete.description')}
            </CardDescription>
          </CardContent>
        </Card>
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        <Link href="/challenges">
          <Button size="lg" className="gap-2">
            {t('challenge.cards.start-challenge')}{' '}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        <Link href="/leaderboard">
          <Button size="lg" variant="secondary" className="gap-2">
            {t('view-leaderboard')} <Trophy className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
