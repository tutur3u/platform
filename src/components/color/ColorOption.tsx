interface ColorOptionProps {
  color: string;
  selectedColor: string;
  onSelect: (color: string) => void;
}

const ColorOption = ({ color, selectedColor, onSelect }: ColorOptionProps) => {
  const isSelected = color === selectedColor;

  return (
    <button
      className={`h-fit w-fit rounded-full border-2 border-${color}-300 p-0.5 ${
        isSelected || 'border-opacity-30'
      } transition`}
      onClick={() => onSelect(color)}
    >
      <div className={`h-4 w-4 rounded-full bg-${color}-300`} />
    </button>
  );
};

export default ColorOption;
