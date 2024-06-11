'use client';

import type { ButtonProps } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useForwardedRef } from '@/hooks/use-forwarded-ref';
import { useTheme } from 'next-themes';
import { forwardRef, useMemo, useState } from 'react';
import { HexColorPicker } from 'react-colorful';

interface ColorPickerProps {
  text?: string;
  value: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
}

const ColorPicker = forwardRef<
  HTMLInputElement,
  Omit<ButtonProps, 'value' | 'onChange' | 'onBlur'> & ColorPickerProps
>(
  (
    { disabled, value, onChange, onBlur, text, name, className, ...props },
    forwardedRef
  ) => {
    const { resolvedTheme } = useTheme();

    const ref = useForwardedRef(forwardedRef);
    const [open, setOpen] = useState(false);

    const parsedValue = useMemo(() => {
      return value || '#FFFFFF';
    }, [value]);

    const color = useMemo(() => {
      return ensureVisibleColor(parsedValue, resolvedTheme as 'light' | 'dark');
    }, [parsedValue, resolvedTheme]);

    return (
      <Popover onOpenChange={onChange ? setOpen : () => {}} open={open}>
        <PopoverTrigger asChild disabled={disabled} onBlur={onBlur}>
          <Button
            {...props}
            className={className}
            name={name}
            onClick={
              onChange
                ? () => {
                    setOpen(true);
                  }
                : undefined
            }
            size="icon"
            style={{
              padding: '0.5rem',
              color: color,
              backgroundColor: `${color}1A`, // 10% opacity in hex is 1A
              borderColor: color,
              borderWidth: '1px',
              borderStyle: 'solid',
            }}
            variant="outline"
            disabled={disabled}
          >
            {text || parsedValue}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full gap-4 flex flex-col items-center justify-center">
          <HexColorPicker color={parsedValue} onChange={onChange} />
          <Input
            maxLength={7}
            onChange={(e) => {
              if (onChange) onChange(e?.currentTarget?.value);
            }}
            ref={ref}
            value={parsedValue}
          />
        </PopoverContent>
      </Popover>
    );
  }
);
ColorPicker.displayName = 'ColorPicker';

export { ColorPicker };

function ensureVisibleColor(color: string, theme: 'light' | 'dark'): string {
  const getLuminance = (r: number, g: number, b: number) => {
    const a = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  };

  const getContrastRatio = (l1: number, l2: number) => {
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  const parseColor = (color: string) => {
    const num = parseInt(color.slice(1), 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return [r, g, b];
  };

  const adjustColor = (r: number, g: number, b: number, factor: number) => {
    r = Math.min(255, Math.max(0, r + factor));
    g = Math.min(255, Math.max(0, g + factor));
    b = Math.min(255, Math.max(0, b + factor));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  };

  const [r, g, b] = parseColor(color);
  const luminance = getLuminance(r, g, b);
  const backgroundLuminance = theme === 'light' ? 1 : 0;
  const contrastRatio = getContrastRatio(luminance, backgroundLuminance);

  // Adjust color to meet the minimum contrast ratio of 4.5:1
  const minimumContrastRatio = 4.5;
  let factor = 0;
  while (contrastRatio < minimumContrastRatio) {
    factor += theme === 'light' ? -10 : 10;
    const adjustedColor = adjustColor(r, g, b, factor);
    const [newR, newG, newB] = parseColor(adjustedColor);
    const newLuminance = getLuminance(newR, newG, newB);
    const newContrastRatio = getContrastRatio(
      newLuminance,
      backgroundLuminance
    );
    if (newContrastRatio >= minimumContrastRatio) {
      return adjustedColor;
    }
  }

  return color;
}
