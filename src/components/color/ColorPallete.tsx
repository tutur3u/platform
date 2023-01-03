import ColorOption from './ColorOption';

interface ColorPalleteProps {
  value: string;
  onChange: (color: string) => void;
}

const ColorPallete = ({ value, onChange }: ColorPalleteProps) => {
  const colors = [
    'yellow',
    'orange',
    'red',
    'pink',
    'purple',
    'indigo',
    'blue',
    'sky',
    'cyan',
    'teal',
    'green',
    'gray',
  ];

  return (
    <div className="grid grid-cols-6 gap-2">
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
