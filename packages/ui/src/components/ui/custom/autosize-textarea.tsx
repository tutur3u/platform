'use client';

import { cn } from '@tuturuuu/utils/format';
import * as React from 'react';
import { useImperativeHandle } from 'react';

interface UseAutosizeTextAreaProps {
  textAreaRef: HTMLTextAreaElement | null;
  minHeight?: number;
  maxHeight?: number;
}

export const useAutosizeTextArea = ({
  textAreaRef,
  maxHeight = Number.MAX_SAFE_INTEGER,
  minHeight = 0,
}: UseAutosizeTextAreaProps) => {
  const [init, setInit] = React.useState(true);
  
  React.useEffect(() => {
    // We need to reset the height momentarily to get the correct scrollHeight for the textarea
    const offsetBorder = 2;
    if (textAreaRef) {
      if (init) {
        textAreaRef.style.minHeight = `${minHeight + offsetBorder}px`;
        if (maxHeight > minHeight) {
          textAreaRef.style.maxHeight = `${maxHeight}px`;
        }
        setInit(false);
      }
      textAreaRef.style.height = `${minHeight + offsetBorder}px`;
      const scrollHeight = textAreaRef.scrollHeight;
      // We then set the height directly, outside of the render loop
      // Trying to set this with state or a ref will product an incorrect value.
      if (scrollHeight > maxHeight) {
        textAreaRef.style.height = `${maxHeight}px`;
      } else {
        textAreaRef.style.height = `${scrollHeight + offsetBorder}px`;
      }
    }
  }, [init, minHeight, maxHeight, textAreaRef]);
};

export type AutosizeTextAreaRef = {
  textArea: HTMLTextAreaElement;
  maxHeight: number;
  minHeight: number;
};

type AutosizeTextAreaProps = {
  maxHeight?: number;
  minHeight?: number;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const AutosizeTextarea = React.forwardRef<
  AutosizeTextAreaRef,
  AutosizeTextAreaProps
>(
  (
    {
      maxHeight = Number.MAX_SAFE_INTEGER,
      minHeight = 52,
      className,
      onChange,
      value,
      ...props
    }: AutosizeTextAreaProps,
    ref: React.Ref<AutosizeTextAreaRef>
  ) => {
    const textAreaRef = React.useRef<HTMLTextAreaElement | null>(null);
    const contentRef = React.useRef<string>('');

    useAutosizeTextArea({
      textAreaRef: textAreaRef.current,
      maxHeight,
      minHeight,
    });

    useImperativeHandle(ref, () => ({
      textArea: textAreaRef.current as HTMLTextAreaElement,
      focus: () => textAreaRef.current?.focus(),
      maxHeight,
      minHeight,
    }));

    // Trigger auto-size when value changes
    React.useEffect(() => {
      const currentValue = value as string || props?.defaultValue as string || '';
      if (currentValue !== contentRef.current && textAreaRef.current) {
        contentRef.current = currentValue;
        const offsetBorder = 2;
        textAreaRef.current.style.height = `${minHeight + offsetBorder}px`;
        const scrollHeight = textAreaRef.current.scrollHeight;
        if (scrollHeight > maxHeight) {
          textAreaRef.current.style.height = `${maxHeight}px`;
        } else {
          textAreaRef.current.style.height = `${scrollHeight + offsetBorder}px`;
        }
      }
    }, [value, props?.defaultValue, minHeight, maxHeight]);

    return (
      <textarea
        {...props}
        value={value}
        ref={textAreaRef}
        className={cn(
          'scrollbar-none flex w-full overflow-auto rounded-md border border-input bg-background px-3 py-2 text-sm ring-0 ring-transparent outline-hidden placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-transparent focus-visible:ring-offset-0 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        onChange={(e) => {
          contentRef.current = e.target.value;
          onChange?.(e);
        }}
      />
    );
  }
);
AutosizeTextarea.displayName = 'AutosizeTextarea';
