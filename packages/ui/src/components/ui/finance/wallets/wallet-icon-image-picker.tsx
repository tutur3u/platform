'use client';

import { Building2, Smartphone, Sparkles, Wallet, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import IconPicker, {
  getIconComponentByKey,
} from '@tuturuuu/ui/custom/icon-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import { useCallback, useMemo, useState } from 'react';
import {
  buildImageSrc,
  filterWalletImages,
  getWalletImagePath,
  WALLET_BANK_IMAGES,
  WALLET_MOBILE_IMAGES,
} from './wallet-images';

interface WalletIconImagePickerProps {
  /** Currently selected icon (lucide icon key) */
  icon?: string | null;
  /** Currently selected image source (e.g., "bank/bidv") */
  imageSrc?: string | null;
  /** Callback when icon changes (clears imageSrc) */
  onIconChange: (icon: string | null) => void;
  /** Callback when imageSrc changes (clears icon) */
  onImageSrcChange: (imageSrc: string | null) => void;
  /** Whether the picker is disabled */
  disabled?: boolean;
  /** Translations */
  translations?: {
    selectIconOrImage?: string;
    iconTab?: string;
    bankTab?: string;
    mobileTab?: string;
    searchPlaceholder?: string;
    clear?: string;
    selectIcon?: string;
    iconDescription?: string;
    searchIcons?: string;
    noIcon?: string;
  };
}

/**
 * Combined picker for wallet icons (Lucide) and images (bank/mobile payment logos).
 * Selecting one type automatically clears the other (mutual exclusivity).
 */
export function WalletIconImagePicker({
  icon,
  imageSrc,
  onIconChange,
  onImageSrcChange,
  disabled = false,
  translations = {},
}: WalletIconImagePickerProps) {
  const [open, setOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState('');
  const [mobileSearch, setMobileSearch] = useState('');

  const {
    selectIconOrImage = 'Select Icon or Image',
    iconTab = 'Icon',
    bankTab = 'Bank',
    mobileTab = 'Mobile',
    searchPlaceholder = 'Search...',
    clear = 'Clear',
    selectIcon = 'Select an icon',
    iconDescription = 'Choose an icon for this wallet',
    searchIcons = 'Search icons...',
    noIcon = 'No icon',
  } = translations;

  // Determine what to show in the trigger button
  const TriggerContent = useMemo(() => {
    if (imageSrc) {
      return (
        <Image
          src={getWalletImagePath(imageSrc)}
          alt="Wallet"
          width={20}
          height={20}
          className="h-5 w-5 rounded-sm object-contain"
        />
      );
    }
    if (icon) {
      const IconComponent = getIconComponentByKey(icon);
      if (IconComponent) {
        return <IconComponent className="h-5 w-5" />;
      }
    }
    return <Wallet className="h-5 w-5" />;
  }, [icon, imageSrc]);

  // Handle icon selection (clears image)
  const handleIconChange = useCallback(
    (newIcon: string | null) => {
      onIconChange(newIcon);
      if (newIcon) {
        onImageSrcChange(null); // Clear image when icon is selected
      }
    },
    [onIconChange, onImageSrcChange]
  );

  // Handle image selection (clears icon)
  const handleImageSelect = useCallback(
    (category: 'bank' | 'mobile', imageId: string) => {
      onImageSrcChange(buildImageSrc(category, imageId));
      onIconChange(null); // Clear icon when image is selected
      setOpen(false);
    },
    [onIconChange, onImageSrcChange]
  );

  // Handle clear
  const handleClear = useCallback(() => {
    onIconChange(null);
    onImageSrcChange(null);
    setOpen(false);
  }, [onIconChange, onImageSrcChange]);

  // Filter images based on search
  const filteredBankImages = useMemo(
    () => filterWalletImages(WALLET_BANK_IMAGES, bankSearch),
    [bankSearch]
  );

  const filteredMobileImages = useMemo(
    () => filterWalletImages(WALLET_MOBILE_IMAGES, mobileSearch),
    [mobileSearch]
  );

  // Determine default tab based on current selection
  const defaultTab = useMemo(() => {
    if (imageSrc?.startsWith('mobile/')) return 'mobile';
    if (imageSrc?.startsWith('bank/')) return 'bank';
    return 'icon';
  }, [imageSrc]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="h-10 w-10 p-0"
        >
          {TriggerContent}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{selectIconOrImage}</DialogTitle>
          <DialogDescription>
            {icon || imageSrc
              ? 'Change the icon or image for this wallet'
              : 'Choose an icon or image for this wallet'}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="icon" className="gap-1.5">
              <Sparkles className="h-4 w-4" />
              {iconTab}
            </TabsTrigger>
            <TabsTrigger value="bank" className="gap-1.5">
              <Building2 className="h-4 w-4" />
              {bankTab}
            </TabsTrigger>
            <TabsTrigger value="mobile" className="gap-1.5">
              <Smartphone className="h-4 w-4" />
              {mobileTab}
            </TabsTrigger>
          </TabsList>

          {/* Icon Tab */}
          <TabsContent value="icon" className="mt-4">
            <div className="flex items-center gap-2">
              <IconPicker
                value={icon}
                onValueChange={handleIconChange}
                disabled={disabled}
                allowClear
                title={selectIcon}
                description={iconDescription}
                searchPlaceholder={searchIcons}
                clearLabel={clear}
                defaultCategory="finance"
                triggerClassName="h-10 w-10"
              />
              <span className="text-muted-foreground text-sm">
                {icon || noIcon}
              </span>
            </div>
          </TabsContent>

          {/* Bank Tab */}
          <TabsContent value="bank" className="mt-4">
            <div className="space-y-3">
              <div className="relative">
                <Input
                  value={bankSearch}
                  onChange={(e) => setBankSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                />
                {bankSearch && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-1/2 right-1 h-6 w-6 -translate-y-1/2"
                    onClick={() => setBankSearch('')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                {filteredBankImages.length} bank
                {filteredBankImages.length !== 1 ? 's' : ''} available
              </p>
              <ScrollArea className="h-64">
                <TooltipProvider delayDuration={200}>
                  <div className="grid grid-cols-6 gap-2 pr-4">
                    {filteredBankImages.map((bank) => {
                      const isSelected = imageSrc === `bank/${bank.id}`;
                      return (
                        <Tooltip key={bank.id}>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant={isSelected ? 'default' : 'outline'}
                              className={cn(
                                'h-12 w-12 p-1',
                                isSelected && 'ring-2 ring-primary'
                              )}
                              onClick={() => handleImageSelect('bank', bank.id)}
                            >
                              <Image
                                src={getWalletImagePath(`bank/${bank.id}`)}
                                alt={bank.name}
                                width={40}
                                height={40}
                                className="h-full w-full rounded-sm object-contain"
                              />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" sideOffset={4}>
                            <p className="text-xs">{bank.name}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </TooltipProvider>
              </ScrollArea>
            </div>
          </TabsContent>

          {/* Mobile Payment Tab */}
          <TabsContent value="mobile" className="mt-4">
            <div className="space-y-3">
              <div className="relative">
                <Input
                  value={mobileSearch}
                  onChange={(e) => setMobileSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                />
                {mobileSearch && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-1/2 right-1 h-6 w-6 -translate-y-1/2"
                    onClick={() => setMobileSearch('')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                {filteredMobileImages.length} provider
                {filteredMobileImages.length !== 1 ? 's' : ''} available
              </p>
              <ScrollArea className="h-64">
                <TooltipProvider delayDuration={200}>
                  <div className="grid grid-cols-6 gap-2 pr-4">
                    {filteredMobileImages.map((mobile) => {
                      const isSelected = imageSrc === `mobile/${mobile.id}`;
                      return (
                        <Tooltip key={mobile.id}>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant={isSelected ? 'default' : 'outline'}
                              className={cn(
                                'h-12 w-12 p-1',
                                isSelected && 'ring-2 ring-primary'
                              )}
                              onClick={() =>
                                handleImageSelect('mobile', mobile.id)
                              }
                            >
                              <Image
                                src={getWalletImagePath(`mobile/${mobile.id}`)}
                                alt={mobile.name}
                                width={40}
                                height={40}
                                className="h-full w-full rounded-sm object-contain"
                              />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" sideOffset={4}>
                            <p className="text-xs">{mobile.name}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </TooltipProvider>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>

        {/* Clear button at the bottom */}
        {(icon || imageSrc) && (
          <div className="flex justify-end pt-2">
            <Button type="button" variant="outline" onClick={handleClear}>
              {clear}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
