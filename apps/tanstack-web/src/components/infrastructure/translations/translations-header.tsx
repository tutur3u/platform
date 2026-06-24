import { Languages } from '@tuturuuu/icons';
import { Separator } from '@tuturuuu/ui/separator';

type TranslationsHeaderProps = {
  description: string;
  title: string;
};

export function TranslationsHeader({
  description,
  title,
}: TranslationsHeaderProps) {
  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Languages className="h-5 w-5 text-primary" />
            <h1 className="font-bold text-2xl">{title}</h1>
          </div>
          <p className="text-foreground/80">{description}</p>
        </div>
      </div>
      <Separator />
    </>
  );
}
