import { createFileRoute } from '@tanstack/react-router';
import { BookText, Sparkles } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { createPageHead } from '../../../../../../../../lib/platform/head';
import {
  getMessages,
  resolveMessagesLocale,
} from '../../../../../../../../lib/platform/messages';

type ModuleExtraContentRouteParams = {
  locale: string;
  wsId: string;
  courseId: string;
  moduleId: string;
};

type ModuleExtraContentMessages = {
  title: string;
  generateWithAi: string;
};

export const Route = createFileRoute(
  '/$locale/$wsId/education/courses/$courseId/modules/$moduleId/extra-content'
)({
  component: ModuleExtraContentRoutePage,
  head: ({ params }) => {
    const { locale } = params as unknown as ModuleExtraContentRouteParams;
    const messages = getModuleExtraContentMessages(locale);

    return createPageHead({
      description:
        'Manage Extra Content in the Module area of your Tuturuuu workspace.',
      locale: resolveMessagesLocale(locale),
      title: messages.title,
    });
  },
});

function ModuleExtraContentRoutePage() {
  const { courseId, locale, moduleId, wsId } =
    Route.useParams() as unknown as ModuleExtraContentRouteParams;
  const messages = getModuleExtraContentMessages(locale);

  void wsId;
  void courseId;
  void moduleId;

  return (
    <div className="grid gap-4">
      <FeatureSummary
        secondaryTrigger={
          <Button disabled size="xs" variant="ghost">
            <Sparkles />
            {messages.generateWithAi}
          </Button>
        }
        showSecondaryTrigger
        title={
          <div className="flex items-center justify-between gap-4">
            <h1 className="flex w-full items-center gap-2 font-bold text-lg md:text-2xl">
              <BookText className="h-5 w-5" />
              {messages.title}
            </h1>
          </div>
        }
      />
    </div>
  );
}

function getModuleExtraContentMessages(
  locale: unknown
): ModuleExtraContentMessages {
  const messagesLocale = resolveMessagesLocale(locale);
  const messages = getMessages(messagesLocale);

  return {
    generateWithAi: messages.common.generate_with_ai,
    title: messages['course-details-tabs'].extra_reading,
  };
}
