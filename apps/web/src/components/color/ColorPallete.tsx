import ColorOption from './ColorOption';
import { SupportedColor } from '@/types/primitives/SupportedColors';

interface ColorPalleteProps {
  value: SupportedColor;
  onChange: (color: SupportedColor) => void;
  variant?: 'default' | 'card';
  disabled?: boolean;
}

const ColorPallete = ({
  value,
  onChange,
  variant = 'default',
  disabled = false,
}: ColorPalleteProps) => {
  const colors: SupportedColor[] = [
    'yellow',
    'orange',
    'red',
    'pink',
    'purple',
    'indigo',
    'blue',
    'cyan',
    'green',
    'gray',
  ];

  return (
    <div
      className={`grid gap-2 ${
        variant === 'default' ? 'grid-cols-5' : 'grid-cols-2 md:grid-cols-5'
      }`}
    >
      {colors.map((color) => (
        <ColorOption
          key={color}
          color={color}
          selectedColor={value}
          onSelect={onChange}
          variant={variant}
          disabled={disabled}
        />
      ))}
    </div>
  );
};

export default ColorPallete;
