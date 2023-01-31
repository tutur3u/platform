import { SupportedColor } from '../../types/primitives/SupportedColors';
import ColorOption from './ColorOption';

interface ColorPalleteProps {
  value: SupportedColor;
  onChange: (color: SupportedColor) => void;
}

const ColorPallete = ({ value, onChange }: ColorPalleteProps) => {
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
    <div className="grid grid-cols-5 gap-2">
      {colors.map((color) => (
        <ColorOption
          key={color}
          color={color}
          selectedColor={value}
          onSelect={onChange}
        />
      ))}
    </div>
  );
};

export default ColorPallete;
