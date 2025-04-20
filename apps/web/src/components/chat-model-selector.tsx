import { Model, models, providers } from '@tuturuuu/ai/models';
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
  setOpen: (open: boolean) => void;
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
        className="flex w-[calc(100vw-2rem)] flex-col-reverse rounded-b-none p-0 md:grid md:w-[48rem] md:grid-cols-2 xl:w-[64rem]"
        sideOffset={8}
        onInteractOutside={() => setOpen(false)}
      >
        <Command className="rounded-b-none border-b md:rounded-r-none md:border-b-0 md:border-r">
          <CommandInput placeholder="Search model..." />
          <CommandEmpty>No model found.</CommandEmpty>
          <CommandList>
            {providers.map((provider) => (
              <CommandGroup key={provider} heading={provider}>
                {models
                  .filter((m) => m.provider === provider)
                  .map((m) => (
                    <CommandItem
                      key={m.value}
                      value={m.value}
                      onSelect={(currentValue) => {
                        if (currentValue === model?.value) return;
                        if (m.disabled) return;

                        onChange(
                          models.find((m) => m.value === currentValue) as Model
                        );
                      }}
                      onClick={() => setPreviewModel(m)}
                      onMouseOver={() => setPreviewModel(m)}
                      className={cn(m.disabled && 'cursor-default opacity-50')}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          model?.value === m.value ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <div className="bg-foreground text-background rounded-full px-2 py-0.5">
                        {m.label}
                      </div>
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>

        <div>
          <div className="flex items-center px-2 pb-1 pt-3">
            <div className="text-sm font-semibold opacity-80">
              {previewModel?.provider}{' '}
            </div>
            <div className="bg-foreground/20 mx-2 h-4 w-[1px] rotate-[30deg]" />
            <div className="line-clamp-1 font-mono text-xs">
              {previewModel?.label}
            </div>
          </div>
          <Separator className="my-2" />
          <div className="p-2 pt-0">
            <div className="text-sm">{previewModel?.description}</div>
            {previewModel?.context != undefined && (
              <>
                <Separator className="my-2" />
                <div className="bg-foreground text-background rounded px-2 py-0.5 text-center text-sm font-semibold">
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
