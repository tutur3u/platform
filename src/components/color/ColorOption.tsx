interface ColorOptionProps {
  color: string;
  selectedColor: string;
  onSelect: (color: string) => void;
}

const ColorOption = ({ color, selectedColor, onSelect }: ColorOptionProps) => {
  const isSelected = color === selectedColor;

  const getBorderColor = () => {
    switch (color) {
      case 'yellow':
        return 'border-yellow-300';
      case 'orange':
        return 'border-orange-300';
      case 'red':
        return 'border-red-300';
      case 'pink':
        return 'border-pink-300';
      case 'purple':
        return 'border-purple-300';
      case 'indigo':
        return 'border-indigo-300';
      case 'blue':
        return 'border-blue-300';
      case 'sky':
        return 'border-sky-300';
      case 'cyan':
        return 'border-cyan-300';
      case 'teal':
        return 'border-teal-300';
      case 'green':
        return 'border-green-300';
      case 'gray':
        return 'border-gray-300';

      default:
        return 'border-blue-300';
    }
  };

  const getBackgroundColor = () => {
    switch (color) {
      case 'yellow':
        return 'bg-yellow-300';
      case 'orange':
        return 'bg-orange-300';
      case 'red':
        return 'bg-red-300';
      case 'pink':
        return 'bg-pink-300';
      case 'purple':
        return 'bg-purple-300';
      case 'indigo':
        return 'bg-indigo-300';
      case 'blue':
        return 'bg-blue-300';
      case 'sky':
        return 'bg-sky-300';
      case 'cyan':
        return 'bg-cyan-300';
      case 'teal':
        return 'bg-teal-300';
      case 'green':
        return 'bg-green-300';
      case 'gray':
        return 'bg-gray-300';

      default:
        return 'bg-blue-300';
    }
  };

  return (
    <button
      className={`h-fit w-fit rounded-full border-2 ${getBorderColor()} p-0.5 ${
        isSelected || 'border-opacity-30'
      } transition`}
      onClick={() => onSelect(color)}
    >
      <div className={`h-4 w-4 rounded-full ${getBackgroundColor()}`} />
    </button>
  );
};

export default ColorOption;
