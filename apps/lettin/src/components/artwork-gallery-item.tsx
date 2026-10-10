'use client';
import type { LettinArtwork } from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';

export function ArtworkGalleryItem({
  item,
  index,
  count,
  disabled,
  onChange,
  onMove,
  onRemove,
}: {
  item: LettinArtwork;
  index: number;
  count: number;
  disabled: boolean;
  onChange: (item: LettinArtwork) => void;
  onMove: (offset: number) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('lettin');
  return (
    <fieldset
      disabled={disabled}
      className="space-y-3 rounded-lg border border-border p-4"
    >
      <legend className="px-2 text-sm">
        {t('galleryArtworkNumber', { number: index + 1 })}
      </legend>
      <label className="block space-y-1 text-sm">
        {t('imageUrl')}
        <Input
          value={item.image}
          maxLength={2000}
          onChange={(e) => onChange({ ...item, image: e.target.value })}
        />
      </label>
      <label className="block space-y-1 text-sm">
        {t('galleryAlt')}
        <Input
          value={item.alt}
          required
          maxLength={500}
          onChange={(e) => onChange({ ...item, alt: e.target.value })}
        />
      </label>
      <label className="block space-y-1 text-sm">
        {t('galleryCaption')}
        <Textarea
          value={item.caption}
          maxLength={1000}
          onChange={(e) => onChange({ ...item, caption: e.target.value })}
        />
      </label>
      <label className="block space-y-1 text-sm">
        {t('credit')}
        <Input
          value={item.credit}
          maxLength={200}
          onChange={(e) => onChange({ ...item, credit: e.target.value })}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={disabled || index === 0}
          onClick={() => onMove(-1)}
        >
          {t('galleryMoveUp')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled || index === count - 1}
          onClick={() => onMove(1)}
        >
          {t('galleryMoveDown')}
        </Button>
        <Button type="button" variant="ghost" onClick={onRemove}>
          {t('galleryRemove')}
        </Button>
      </div>
    </fieldset>
  );
}
