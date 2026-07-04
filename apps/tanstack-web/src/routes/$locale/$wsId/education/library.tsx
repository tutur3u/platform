import { createFileRoute } from '@tanstack/react-router';
import { ClipboardCheck, Layers, SwatchBook } from '@tuturuuu/icons';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { EducationContentSurface } from '@tuturuuu/ui/custom/education/shell/education-content-surface';
import { EducationPageHeader } from '@tuturuuu/ui/custom/education/shell/education-page-header';
import { createPageHead } from '../../../../lib/platform/head';
import {
  getMessages,
  resolveMessagesLocale,
} from '../../../../lib/platform/messages';

export const Route = createFileRoute('/$locale/$wsId/education/library')({
  component: EducationLibraryRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage reusable learning assets for courses and modules.',
      locale,
      title: 'Education Library',
    });
  },
});

function EducationLibraryRoutePage() {
  const { locale, wsId } = Route.useParams();
  const messages = getMessages(locale);
  const tabs = messages['workspace-education-tabs'];
  const cards = [
    {
      description: messages['ws-quizzes'].description,
      href: `/${locale}/${wsId}/education/library/quizzes`,
      icon: ClipboardCheck,
      title: tabs.library_quizzes,
    },
    {
      description: messages['ws-quiz-sets'].description,
      href: `/${locale}/${wsId}/education/library/quiz-sets`,
      icon: Layers,
      title: tabs.library_quiz_sets,
    },
    {
      description: messages['ws-flashcards'].description,
      href: `/${locale}/${wsId}/education/library/flashcards`,
      icon: SwatchBook,
      title: tabs.library_flashcards,
    },
  ];

  return (
    <div className="space-y-5 p-4">
      <EducationPageHeader
        description={tabs.library_description}
        title={tabs.library}
      />

      <EducationContentSurface pattern>
        <div className="grid gap-4 md:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;

            return (
              <a href={card.href} key={card.href}>
                <Card className="h-full border-border/60 transition-colors hover:border-foreground/25">
                  <CardHeader className="space-y-3">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/5">
                      <Icon className="h-5 w-5 text-foreground/70" />
                    </div>
                    <CardTitle>{card.title}</CardTitle>
                    <CardDescription>{card.description}</CardDescription>
                  </CardHeader>
                </Card>
              </a>
            );
          })}
        </div>
      </EducationContentSurface>
    </div>
  );
}
