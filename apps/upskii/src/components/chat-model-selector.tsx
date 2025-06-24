import { type Model, models } from '@tuturuuu/ai/models';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import { Check } from '@tuturuuu/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';

export function ChatModelSelector({
  open,
  model,
  className,
  setOpen,
  onChange,
}: {
  open: boolean;
  model?: Model;
  className?: string;
  // eslint-disable-next-line no-unused-vars
  setOpen: (open: boolean) => void;
  // eslint-disable-next-line no-unused-vars
  onChange: (value: Model) => void;
}) {
  const [previewModel, setPreviewModel] = useState<Model | undefined>(model);

  const currentModel = model
    ? models.find((m) => m.value === model.value)
    : undefined;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (!o) setPreviewModel(model);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('flex w-full', className)}
          disabled={open}
        >
          <div className="line-clamp-1 text-start">
            {model
              ? `${currentModel?.provider.toLowerCase()}/${currentModel?.label}`
              : 'Select model'}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="flex w-[calc(100vw-2rem)] flex-col-reverse rounded-b-none p-0 md:grid md:w-3xl md:grid-cols-2 xl:w-5xl"
        sideOffset={8}
        onInteractOutside={() => setOpen(false)}
      >
        <Command className="rounded-b-none border-b md:rounded-r-none md:border-r md:border-b-0">
          <CommandInput placeholder="Search model..." />
          <CommandEmpty>No model found.</CommandEmpty>
          <CommandList>
            <CommandGroup key="Google" heading="Google">
              {models
                .filter((m) => m.provider === 'Google')
                .map((m) => (
                  <CommandItem
                    key={`${m.provider}-${m.value}`}
                    value={`${m.provider}-${m.value}`}
                    onSelect={(currentValue) => {
                      if (m.disabled) return;
                      if (currentValue === `${model?.provider}-${model?.value}`)
                        return;

                      onChange(
                        models.find(
                          (m) => `${m.provider}-${m.value}` === currentValue
                        ) as Model
                      );
                    }}
                    onClick={() => setPreviewModel(m)}
                    onMouseOver={() => setPreviewModel(m)}
                    className={cn(m.disabled && 'cursor-default opacity-50')}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        `${m.provider}-${m.value}` ===
                          `${model?.provider}-${model?.value}`
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                    <div className="rounded-full bg-foreground px-2 py-0.5 text-background">
                      {m.label}
                    </div>
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>

        <div>
          <div className="flex items-center px-2 pt-3 pb-1">
            <div className="text-sm font-semibold opacity-80">
              {previewModel?.provider}{' '}
            </div>
            <div className="mx-2 h-4 w-px rotate-30 bg-foreground/20" />
            <div className="line-clamp-1 font-mono text-xs">
              {previewModel?.label}
            </div>
          </div>
          <Separator className="my-2" />
          <div className="p-2 pt-0">
            <div className="text-sm">{previewModel?.description}</div>
            {previewModel?.context !== undefined && (
              <>
                <Separator className="my-2" />
                <div className="rounded bg-foreground px-2 py-0.5 text-center text-sm font-semibold text-background">
                  {Intl.NumberFormat('en-US', {
                    style: 'decimal',
                  }).format(previewModel.context)}{' '}
                  tokens
                </div>
              </>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
