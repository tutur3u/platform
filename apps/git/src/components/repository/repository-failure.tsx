import { Card } from '@tuturuuu/ui/card';

export function RepositoryFailure({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <Card className="max-w-lg space-y-3 p-6 text-center">
        <h1 className="font-semibold text-2xl">{title}</h1>
        <p className="text-muted-foreground text-sm leading-6">{description}</p>
      </Card>
    </main>
  );
}
