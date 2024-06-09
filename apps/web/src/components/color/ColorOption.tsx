import { SupportedColor } from '@/types/primitives/SupportedColors';
import { Tooltip } from '@mantine/core';
import useTranslation from 'next-translate/useTranslation';

interface ColorOptionProps {
  color: SupportedColor;
  selectedColor: SupportedColor;
  onSelect: (color: SupportedColor) => void;
  variant?: 'default' | 'card';
  disabled?: boolean;
}

const ColorOption = ({
  color,
  selectedColor,
  onSelect,
  variant = 'default',
  disabled = false,
}: ColorOptionProps) => {
  const isSelected = color === selectedColor;

  const getBorderColor = () => {
    switch (color) {
      case 'red':
        if (isSelected) return 'border-red-500 dark:border-red-300';
        return 'border-red-500/30 dark:border-red-300/30';

      case 'blue':
        if (isSelected) return 'border-blue-500 dark:border-blue-300';
        return 'border-blue-500/30 dark:border-blue-300/30';

      case 'green':
        if (isSelected) return 'border-green-500 dark:border-green-300';
        return 'border-green-500/30 dark:border-green-300/30';

      case 'yellow':
        if (isSelected) return 'border-yellow-500 dark:border-yellow-300';
        return 'border-yellow-500/30 dark:border-yellow-300/30';

      case 'orange':
        if (isSelected) return 'border-orange-500 dark:border-orange-300';
        return 'border-orange-500/30 dark:border-orange-300/30';

      case 'purple':
        if (isSelected) return 'border-purple-500 dark:border-purple-300';
        return 'border-purple-500/30 dark:border-purple-300/30';

      case 'pink':
        if (isSelected) return 'border-pink-500 dark:border-pink-300';
        return 'border-pink-500/30 dark:border-pink-300/30';

      case 'indigo':
        if (isSelected) return 'border-indigo-500 dark:border-indigo-300';
        return 'border-indigo-500/30 dark:border-indigo-300/30';

      case 'cyan':
        if (isSelected) return 'border-cyan-500 dark:border-cyan-300';
        return 'border-cyan-500/30 dark:border-cyan-300/30';

      case 'gray':
        if (isSelected) return 'border-gray-500 dark:border-gray-300';
        return 'border-gray-500/30 dark:border-gray-300/30';

      default:
        if (isSelected) return 'border-blue-500 dark:border-blue-300';
        return 'border-blue-500/30 dark:border-blue-300/30';
    }
  };

  const getBackgroundColor = () => {
    switch (color) {
      case 'red':
        return 'bg-red-500 dark:bg-red-300';

      case 'blue':
        return 'bg-blue-500 dark:bg-blue-300';

      case 'green':
        return 'bg-green-500 dark:bg-green-300';

      case 'yellow':
        return 'bg-yellow-500 dark:bg-yellow-300';

      case 'orange':
        return 'bg-orange-500 dark:bg-orange-300';

      case 'purple':
        return 'bg-purple-500 dark:bg-purple-300';

      case 'pink':
        return 'bg-pink-500 dark:bg-pink-300';

      case 'indigo':
        return 'bg-indigo-500 dark:bg-indigo-300';

      case 'cyan':
        return 'bg-cyan-500 dark:bg-cyan-300';

      case 'gray':
        return 'bg-gray-500 dark:bg-gray-300';

      default:
        return 'bg-blue-500 dark:bg-blue-300';
    }
  };

  const getLabelColor = () => {
    const colors = {
      red: 'border-red-500/80 text-red-600 dark:border-red-300/80 dark:text-red-200 bg-[#fcdada] dark:bg-[#302729]',
      blue: 'border-blue-500/80 text-blue-600 dark:border-blue-300/80 dark:text-blue-200 bg-[#d8e6fd] dark:bg-[#252a32]',
      green:
        'border-green-500/80 text-green-600 dark:border-green-300/80 dark:text-green-200 bg-[#d3f3df] dark:bg-[#242e2a]',
      yellow:
        'border-yellow-500/80 text-yellow-600 dark:border-yellow-300/80 dark:text-yellow-200 bg-[#fbf0ce] dark:bg-[#302d1f]',
      orange:
        'border-orange-500/80 text-orange-600 dark:border-orange-300/80 dark:text-orange-200 bg-[#fee3d0] dark:bg-[#302924]',
      purple:
        'border-purple-500/80 text-purple-600 dark:border-purple-300/80 dark:text-purple-200 bg-[#eeddfd] dark:bg-[#2c2832]',
      pink: 'border-pink-500/80 text-pink-600 dark:border-pink-300/80 dark:text-pink-200 bg-[#fbdaeb] dark:bg-[#2f272e]',
      indigo:
        'border-indigo-500/80 text-indigo-600 dark:border-indigo-300/80 dark:text-indigo-200 bg-[#e0e0fc] dark:bg-[#272832]',
      cyan: 'border-cyan-500/80 text-cyan-600 dark:border-cyan-300/80 dark:text-cyan-200 bg-[#cdf0f6] dark:bg-[#212e31]',
      gray: 'border-gray-500/80 text-gray-600 dark:border-gray-300/80 dark:text-gray-200 bg-[#e1e3e6] dark:bg-[#2b2c2e]',
    };

    return colors[color];
  };

  const { t } = useTranslation('calendar-event-configs');

  return (
    <Tooltip
      label={t(color.toLowerCase())}
      classNames={{
        tooltip: `font-semibold border-2 py-0.5 px-2 capitalize ${getLabelColor()}`,
      }}
      disabled={disabled}
    >
      <button
        className={`flex w-full border-2 p-0.5 ${
          variant === 'default' ? 'h-8 rounded-full' : 'h-16 rounded'
        } ${getBorderColor()} ${isSelected || 'border-opacity-30'} ${
          disabled && 'cursor-not-allowed opacity-30'
        } transition`}
        onClick={disabled ? undefined : () => onSelect(color)}
      >
        <div
          className={`h-full w-full ${
            isSelected || 'opacity-50 hover:opacity-80'
          } ${
            variant === 'default' ? 'rounded-full' : 'rounded-sm'
          } ${getBackgroundColor()} transition`}
        />
      </button>
    </Tooltip>
  );
};

export default ColorOption;
