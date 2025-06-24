import { Button } from '../button';
import ModifiableDialogTrigger from './modifiable-dialog-trigger';
import { cn } from '@tuturuuu/utils/format';
import { Cog, Plus } from 'lucide-react';
import Link from 'next/link';
import { type ReactElement, ReactNode } from 'react';

interface FormProps<T> {
  data?: T;
  forceDefault?: boolean;
  onFinish?: () => void;
  form?: ReactElement<FormProps<T>>;
}

interface Props<T> {
  data?: T & { id?: string };
  defaultData?: T & { id?: string };
  trigger?: ReactNode;
  form?: ReactElement<FormProps<T>>;
  href?: string;
  secondaryHref?: string;
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
  secondaryHref,
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
    <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start">
      <div className="w-full">
        {title || <h1 className="w-full text-2xl font-bold">{pluralTitle}</h1>}
        {description && (
          <div className="whitespace-pre-wrap text-foreground/80">
            {description}
          </div>
        )}
      </div>
      {href && !form && <Link href={href}>{primaryTrigger}</Link>}
      {secondaryHref && !form && (
        <Link href={secondaryHref}>{secondaryTrigger}</Link>
      )}
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
