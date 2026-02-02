'use client';

import { Wallet } from '@tuturuuu/icons';
import { getIconComponentByKey } from '@tuturuuu/ui/custom/icon-picker';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import { getWalletImagePath } from './wallet-images';

interface WalletIconDisplayProps {
  /** The lucide icon key (from platform_icon enum) */
  icon?: string | null;
  /** The image source identifier (e.g., "bank/bidv") */
  imageSrc?: string | null;
  /** Size class for the icon/image */
  size?: 'sm' | 'md' | 'lg';
  /** Additional class names */
  className?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

const imageSizes = {
  sm: 16,
  md: 20,
  lg: 24,
};

/**
 * Displays a wallet icon or image.
 * Priority: imageSrc > icon > default Wallet icon
 */
export function WalletIconDisplay({
  icon,
  imageSrc,
  size = 'md',
  className,
}: WalletIconDisplayProps) {
  const sizeClass = sizeClasses[size];
  const imageSize = imageSizes[size];

  // Priority 1: Show image if imageSrc is set
  if (imageSrc) {
    return (
      <Image
        src={getWalletImagePath(imageSrc)}
        alt="Wallet"
        width={imageSize}
        height={imageSize}
        className={cn(sizeClass, 'rounded-sm object-contain', className)}
      />
    );
  }

  // Priority 2: Show lucide icon if icon is set
  if (icon) {
    const IconComponent = getIconComponentByKey(icon);
    if (IconComponent) {
      return <IconComponent className={cn(sizeClass, className)} />;
    }
  }

  // Fallback: Show default Wallet icon
  return <Wallet className={cn(sizeClass, className)} />;
}
