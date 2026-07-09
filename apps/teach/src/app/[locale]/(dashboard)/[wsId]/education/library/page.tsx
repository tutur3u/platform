import { ClipboardCheck, Layers, SwatchBook } from '@tuturuuu/icons';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { EducationContentSurface } from '@tuturuuu/ui/custom/education/shell/education-content-surface';
import { EducationPageHeader } from '@tuturuuu/ui/custom/education/shell/education-page-header';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export const metadata: Metadata = {
  title: 'Education Library',
  description: 'Manage reusable learning assets for courses and modules.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function EducationLibraryPage({ params }: Props) {
  const t = await getTranslations();
  const { wsId } = await params;

  const cards = [
    {
      description: t('ws-quizzes.description'),
      href: `/${wsId}/education/library/quizzes`,
      icon: <ClipboardCheck className="h-5 w-5 text-dynamic-green" />,
      title: t('workspace-education-tabs.library_quizzes'),
    },
    {
      description: t('ws-quiz-sets.description'),
      href: `/${wsId}/education/library/quiz-sets`,
      icon: <Layers className="h-5 w-5 text-dynamic-lime" />,
      title: t('workspace-education-tabs.library_quiz_sets'),
    },
    {
      description: t('ws-flashcards.description'),
      href: `/${wsId}/education/library/flashcards`,
      icon: <SwatchBook className="h-5 w-5 text-dynamic-sky" />,
      title: t('workspace-education-tabs.library_flashcards'),
    },
  ];

  return (
    <div className="space-y-5 p-4">
      <EducationPageHeader
        title={t('workspace-education-tabs.library')}
        description={t('workspace-education-tabs.library_description')}
      />

      <EducationContentSurface pattern>
        <div className="grid gap-4 md:grid-cols-3">
          {cards.map((card) => (
            <Link key={card.href} href={card.href}>
              <Card className="h-full border-border/60 transition-colors hover:border-foreground/25">
                <CardHeader className="space-y-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/5">
                    {card.icon}
                  </div>
                  <CardTitle>{card.title}</CardTitle>
                  <CardDescription>{card.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </EducationContentSurface>
    </div>
  );
}
