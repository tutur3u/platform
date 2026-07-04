import { createFileRoute } from '@tanstack/react-router';
import { FacebookMockupDemo } from '../../components/facebook-mockup/facebook-mockup-demo';
import { createPageHead } from '../../lib/platform/head';

export const Route = createFileRoute('/$locale/facebook-mockup')({
  component: FacebookMockupRoutePage,
  head: () =>
    createPageHead({
      description:
        'Create a realistic Facebook ad or page post mockup from static content and uploaded preview images.',
      title: 'Facebook Mockup',
    }),
});

function FacebookMockupRoutePage() {
  const { locale } = Route.useParams() as { locale: string };

  return (
    <div className="@lg:mx-24 @md:mx-10 mx-4 flex min-h-full flex-col gap-8 pt-24 pb-16">
      <div className="grid gap-4">
        <div>
          <h1 className="font-semibold text-4xl">Facebook Mockup</h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            Create a realistic Facebook ad or page post mockup with editable
            text, image uploads, reaction controls, and responsive previews.
          </p>
        </div>
        <div className="h-px bg-border" />
        <FacebookMockupDemo locale={locale} />
      </div>
    </div>
  );
}
