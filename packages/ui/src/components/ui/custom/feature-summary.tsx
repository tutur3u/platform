import { cn } from '../../../lib/utils';
import { Button } from '../button';
import ModifiableDialogTrigger from './modifiable-dialog-trigger';
import { Cog, Plus } from 'lucide-react';
import { ReactNode } from 'react';

interface Props<T> {
  data?: T & { id?: string };
  defaultData?: T & { id?: string };
  trigger?: ReactNode;
  form?: ReactNode;
  href?: string;
  title?: ReactNode;
  pluralTitle?: string;
  singularTitle?: string;
  description?: ReactNode;
  action?: ReactNode;
  createTitle?: string;
  createDescription?: string;
  secondaryTriggerTitle?: string;
  secondaryTitle?: string;
  secondaryDescription?: string;
  requireExpansion?: boolean;
  primaryTrigger?: ReactNode;
  secondaryTrigger?: ReactNode;
  secondaryTriggerIcon?: ReactNode;
  showSecondaryTrigger?: boolean;
  disableSecondaryTrigger?: boolean;
  showCustomSecondaryTrigger?: boolean;
  showDefaultFormAsSecondary?: boolean;
  open?: boolean;
  // eslint-disable-next-line no-unused-vars
  setOpen?: (open: boolean) => void;
  onSecondaryTriggerClick?: () => void;
}

export default function FeatureSummary<T>({
  data,
  defaultData,
  form,
  href,
  title,
  pluralTitle,
  singularTitle,
  description,
  action,
  open,
  createTitle: primaryTriggerTitle,
  createDescription,
  requireExpansion,
  secondaryTriggerTitle,
  secondaryTitle,
  secondaryDescription,
  primaryTrigger = form || href ? (
    <Button size="xs" className="w-full md:w-fit" disabled={!form && !href}>
      <Plus className={cn('h-5 w-5', primaryTriggerTitle ? 'mr-1' : '')} />
      {primaryTriggerTitle}
    </Button>
  ) : undefined,
  secondaryTriggerIcon,
  disableSecondaryTrigger,
  secondaryTrigger = (
    <Button
      size="xs"
      variant="ghost"
      className="w-full md:w-fit"
      disabled={(!form && !href && !defaultData) || disableSecondaryTrigger}
    >
      {secondaryTriggerIcon || (
        <Cog className={cn('h-5 w-5', secondaryTriggerTitle ? 'mr-1' : '')} />
      )}
      {secondaryTriggerTitle}
    </Button>
  ),
  showSecondaryTrigger,
  showCustomSecondaryTrigger,
  showDefaultFormAsSecondary,
  setOpen,
}: Props<T>) {
  return (
    <div className="border-border bg-foreground/5 flex flex-col justify-between gap-4 rounded-lg border p-4 md:flex-row md:items-start">
      <div className="w-full">
        {title || <h1 className="w-full text-2xl font-bold">{pluralTitle}</h1>}
        {description && (
          <div className="text-foreground/80 whitespace-pre-wrap">
            {description}
          </div>
        )}
      </div>
      {(form ||
        action ||
        showDefaultFormAsSecondary ||
        (showSecondaryTrigger && !showCustomSecondaryTrigger) ||
        (showSecondaryTrigger && secondaryTrigger)) && (
        <div className="flex flex-col items-center justify-center gap-2 md:flex-row">
          {showDefaultFormAsSecondary ||
          (showSecondaryTrigger && !showCustomSecondaryTrigger) ? (
            <ModifiableDialogTrigger
              data={defaultData}
              trigger={secondaryTrigger}
              form={form}
              open={open}
              setOpen={setOpen}
              editDescription={secondaryDescription}
              requireExpansion={requireExpansion}
              title={secondaryTitle}
              forceDefault
            />
          ) : (
            showSecondaryTrigger && secondaryTrigger
          )}
          {action || (
            <ModifiableDialogTrigger
              data={data}
              trigger={primaryTrigger}
              form={form}
              open={open}
              setOpen={setOpen}
              createDescription={createDescription}
              requireExpansion={requireExpansion}
              title={singularTitle}
            />
          )}
        </div>
      )}
    </div>
  );
}
