import { Tooltip } from '@mantine/core';
import { SupportedColor } from '../../types/primitives/SupportedColors';

interface ColorOptionProps {
  color: SupportedColor;
  selectedColor: SupportedColor;
  onSelect: (color: SupportedColor) => void;
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
      case 'cyan':
        return 'border-cyan-300';
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
      case 'cyan':
        return 'bg-cyan-300';
      case 'green':
        return 'bg-green-300';
      case 'gray':
        return 'bg-gray-300';

      default:
        return 'bg-blue-300';
    }
  };

  const getLabelColor = () => {
    const colors = {
      red: `border-red-300/80 text-red-200 bg-[#302729]`,
      blue: `border-blue-300/80 text-blue-200 bg-[#252a32]`,
      sky: `border-sky-300/80 text-sky-200 bg-[#232c32]`,
      green: `border-green-300/80 text-green-200 bg-[#242e2a]`,
      yellow: `border-yellow-300/80 text-yellow-200 bg-[#302d1f]`,
      orange: `border-orange-300/80 text-orange-200 bg-[#302924]`,
      purple: `border-purple-300/80 text-purple-200 bg-[#2c2832]`,
      pink: `border-pink-300/80 text-pink-200 bg-[#2f272e]`,
      teal: `border-teal-300/80 text-teal-200 bg-[#202e2e]`,
      indigo: `border-indigo-300/80 text-indigo-200 bg-[#272832]`,
      cyan: `border-cyan-300/80 text-cyan-200 bg-[#212e31]`,
      gray: `border-gray-300/80 text-gray-200 bg-[#2b2c2e]`,
    };

    return colors[color];
  };

  return (
    <Tooltip
      label={color}
      classNames={{
        tooltip: `font-semibold border-2 py-0.5 px-2 capitalize ${getLabelColor()}`,
      }}
    >
      <button
        className={`h-fit w-fit justify-self-center rounded-full border-2 ${getBorderColor()} p-0.5 ${
          isSelected || 'border-opacity-30'
        } transition`}
        onClick={() => onSelect(color)}
      >
        <div className={`h-4 w-4 rounded-full ${getBackgroundColor()}`} />
      </button>
    </Tooltip>
  );
};

export default ColorOption;
