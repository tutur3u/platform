import { cn } from '../../../lib/utils';
import { Button } from '../button';
import ModifiableDialogTrigger from './modifiable-dialog-trigger';
import { Plus } from 'lucide-react';
import { ReactNode } from 'react';

interface Props<T> {
  data?: T & { id?: string };
  trigger?: ReactNode;
  form?: ReactNode;
  href?: string;
  pluralTitle: string;
  singularTitle?: string;
  description: string;
  action?: ReactNode;
  createTitle?: string;
  createDescription?: string;
  requireExpansion?: boolean;
  open?: boolean;
  // eslint-disable-next-line no-unused-vars
  setOpen?: (open: boolean) => void;
}

export default function FeatureSummary<T>({
  data,
  form,
  href,
  pluralTitle,
  singularTitle,
  description,
  action,
  open,
  createTitle,
  createDescription,
  requireExpansion,
  setOpen,
}: Props<T>) {
  return (
    <div className="border-border bg-foreground/5 flex flex-col justify-between gap-4 rounded-lg border p-4 md:flex-row md:items-start">
      <div>
        <h1 className="text-2xl font-bold">{pluralTitle}</h1>
        <p className="text-foreground/80">{description}</p>
      </div>

      <div className="flex flex-col items-center justify-center gap-2 md:flex-row">
        {action || (
          <ModifiableDialogTrigger
            data={data}
            trigger={
              <Button className="w-full md:w-fit" disabled={!form && !href}>
                <Plus className={cn('h-5 w-5', createTitle ? 'mr-2' : '')} />
                {createTitle}
              </Button>
            }
            form={form}
            open={open}
            setOpen={setOpen}
            createDescription={createDescription}
            requireExpansion={requireExpansion}
            title={singularTitle}
          />
        )}
      </div>
    </div>
  );
}
