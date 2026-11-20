import { createFileRoute } from '@tanstack/react-router';
import { ArrowRight, BookOpen, GraduationCap } from '@tuturuuu/icons';
import { appPath } from '@tuturuuu/start-bridge/app-url';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { Route as Root } from './__root';

export const Route = createFileRoute('/')({
  head: () => ({
    links: [{ rel: 'canonical', href: 'https://tuturuuu.com/lms' }],
  }),
  component: Landing,
});

function Landing() {
  const copy = Root.useLoaderData() === 'vi' ? vi : en;
  const areas = [
    { ...copy.teach, id: 'teach', Icon: GraduationCap },
    { ...copy.learn, id: 'learn', Icon: BookOpen },
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-8 md:py-20">
      <h1 className="text-balance font-semibold text-4xl tracking-tight">
        {copy.title}
      </h1>
      <p className="mt-3 text-muted-foreground">{copy.description}</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {areas.map(({ action, description, id, Icon, title }) => (
          <Card key={id}>
            <CardHeader>
              <Icon aria-hidden className="mb-2 size-6 text-muted-foreground" />
              <CardTitle className="text-xl">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <a href={appPath(`/${id}/dashboard`)}>
                  {action} <ArrowRight aria-hidden />
                </a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
