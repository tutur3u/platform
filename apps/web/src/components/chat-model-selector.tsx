'use client';

import { Check, ChevronsUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useState } from 'react';
import { ScrollArea } from './ui/scroll-area';
import { Model, defaultModel, models, providers } from '@/data/models';
import { Separator } from './ui/separator';

export function ChatModelSelector() {
  const [open, setOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<Model>(defaultModel);
  const [previewModel, setPreviewModel] = useState<Model>(defaultModel);

  const currentModel = models.find((model) => model.value === previewModel);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (!o) setPreviewModel(selectedModel);
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-64 justify-between"
        >
          {selectedModel
            ? models.find((model) => model.value === selectedModel)?.label
            : 'Select model'}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="grid w-[32rem] grid-cols-2 gap-2 p-0"
        align="start"
      >
        <Command className="rounded-r-none border-r">
          <CommandInput placeholder="Search model..." />
          <ScrollArea className="h-64">
            <CommandEmpty>No model found.</CommandEmpty>
            {/* <CommandGroup> */}
            {/* {models.map((model) => (
                <CommandItem
                  key={model.value}
                  value={model.value}
                  onSelect={(currentValue) => {
                    setValue(currentValue === value ? '' : currentValue);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === model.value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className="bg-foreground text-background rounded-full px-2 py-0.5">
                    {model.label}
                  </div>
                </CommandItem>
              ))} */}
            {providers.map((provider) => (
              <CommandGroup key={provider} heading={provider}>
                {models
                  .filter((model) => model.provider === provider)
                  .map((model) => (
                    <CommandItem
                      key={model.value}
                      value={model.value}
                      onSelect={(currentValue) => {
                        setSelectedModel(
                          currentValue === selectedModel
                            ? defaultModel
                            : (currentValue as Model)
                        );

                        setOpen(false);
                      }}
                      //   disabled={model.disabled}
                      onMouseOver={() => setPreviewModel(model.value)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          selectedModel === model.value
                            ? 'opacity-100'
                            : 'opacity-0'
                        )}
                      />
                      <div className="bg-foreground text-background rounded-full px-2 py-0.5">
                        {model.label}
                      </div>
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </ScrollArea>
        </Command>

        <div className="p-2 pl-0">
          <div className="flex items-center">
            <div className="font-semibold opacity-80">
              {currentModel?.provider}{' '}
            </div>
            <div className="bg-foreground/20 mx-2 hidden h-4 w-[1px] rotate-[30deg] md:block" />
            <div>{currentModel?.model}</div>
          </div>
          <Separator className="my-2" />
          <div>{currentModel?.description}</div>
          <div className="text-sm opacity-80">
            {currentModel?.context} context window
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
