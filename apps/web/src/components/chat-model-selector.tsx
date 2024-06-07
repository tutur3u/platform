import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Model, models, providers } from '@/data/models';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';

export function ChatModelSelector({
  model,
  onChange,
  className,
}: {
  model: Model;
  onChange: (value: Model) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [previewModel, setPreviewModel] = useState<Model>(model);

  const currentModel = models.find((m) => m.value === model.value);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (!o) setPreviewModel(model);
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`flex w-full ${className}`}
        >
          <div className="line-clamp-1 text-start">
            {model
              ? `${currentModel?.provider.toLowerCase()}/${currentModel?.label}`
              : 'Select model'}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="grid w-80 p-0 md:w-[48rem] md:grid-cols-2 xl:w-[64rem]">
        <Command className="rounded-b-none border-b md:rounded-r-none md:border-b-0 md:border-r">
          <CommandInput placeholder="Search model..." />
          <ScrollArea className="h-48 md:h-64">
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
                          onChange(
                            models.find(
                              (m) => m.value === currentValue
                            ) as Model
                          );

                          setOpen(false);
                        }}
                        onMouseOver={() => setPreviewModel(m)}
                        disabled={m.disabled}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            model.value === m.value
                              ? 'opacity-100'
                              : 'opacity-0'
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
          </ScrollArea>
        </Command>

        <div>
          <div className="flex items-center px-2 pb-1 pt-3">
            <div className="text-sm font-semibold opacity-80">
              {previewModel?.provider}{' '}
            </div>
            <div className="bg-foreground/20 mx-2 h-4 w-[1px] rotate-[30deg]" />
            <div className="line-clamp-1 text-xs">{previewModel?.label}</div>
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
