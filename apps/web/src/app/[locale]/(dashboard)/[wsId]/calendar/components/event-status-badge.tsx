import type { EventStatus } from '@tuturuuu/types/primitives/RSVP';
import { Badge } from '@tuturuuu/ui/badge';
import { Check, Clock, X, FileText, AlertTriangle } from '@tuturuuu/ui/icons';

interface EventStatusBadgeProps {
  status: EventStatus;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'minimal';
  className?: string;
}

const getStatusConfig = (status: EventStatus) => {
  switch (status) {
    case 'confirmed':
      return {
        label: 'Confirmed',
        color: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-300',
        icon: Check,
      };
    case 'active':
      return {
        label: 'Active',
        color: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900 dark:text-blue-300',
        icon: Clock,
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        color: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-300',
        icon: X,
      };
    case 'completed':
      return {
        label: 'Completed',
        color: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900 dark:text-gray-300',
        icon: Check,
      };
    case 'draft':
      return {
        label: 'Draft',
        color: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-300',
        icon: FileText,
      };
    default:
      return {
        label: 'Unknown',
        color: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900 dark:text-gray-300',
        icon: AlertTriangle,
      };
  }
};

const getTextColor = (colorString: string) => {
  // Extract text color class (text-*) from the color string
  const textColorMatch = colorString.match(/text-\S+/);
  return textColorMatch ? textColorMatch[0] : '';
};

export function EventStatusBadge({
  status,
  size = 'sm',
  variant = 'default',
  className = '',
}: EventStatusBadgeProps) {


  const config = getStatusConfig(status);
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-2',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  if (variant === 'minimal') {
    return (
      <div className={`flex items-center space-x-1 ${className}`}>
        <Icon className={`${iconSizes[size]} ${getTextColor(config.color)}`} />
        {size !== 'sm' && (
          <span className={`${sizeClasses[size]} ${getTextColor(config.color)}`}>
            {config.label}
          </span>
        )}
      </div>
    );
  }

  return (
    <Badge 
      variant="secondary" 
      className={`${config.color} ${sizeClasses[size]} ${className}`}
    >
      <Icon className={`${iconSizes[size]} mr-1`} />
      {config.label}
    </Badge>
  );
}
