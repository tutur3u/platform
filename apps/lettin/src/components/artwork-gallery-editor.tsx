'use client';
import { useMutation } from '@tanstack/react-query';
import {
  type LettinArtwork,
  uploadLettinArtwork,
} from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { ArtworkGalleryItem } from './artwork-gallery-item';
import { galleryImage } from './gallery-model';

export function ArtworkGalleryEditor({
  wsId,
  worldId,
  items,
  onChange,
  onPendingChange,
}: {
  wsId: string;
  worldId: string;
  items: LettinArtwork[];
  onChange: (items: LettinArtwork[]) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const t = useTranslations('lettin');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const lease = useRef(0);
  useEffect(
    () => () => {
      lease.current += 1;
    },
    []
  );
  const upload = useMutation({
    mutationFn: (file: File) => uploadLettinArtwork(wsId, worldId, file),
    retry: false,
  });
  const full = items.length >= 12;
  const append = (image: string) =>
    onChange([...items, { image, alt: '', caption: '', credit: '' }]);
  const validUrl = url.startsWith('https://') && !!galleryImage(url);
  return (
    <section
      aria-label={t('artworkGallery')}
      className="space-y-4 rounded-lg border border-border p-4"
    >
      <h3>{t('artworkGallery')}</h3>
      <p className="text-muted-foreground text-sm">{t('galleryHint')}</p>
      <fieldset disabled={busy || full} className="space-y-3">
        <label className="block space-y-1 text-sm">
          {t('galleryAddUrl')}
          <Input
            value={url}
            maxLength={2000}
            placeholder="https://"
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={busy || full || !validUrl}
          onClick={() => {
            if (submitting.current || full || !validUrl) return;
            append(url);
            setUrl('');
          }}
        >
          {t('galleryAdd')}
        </Button>
        <label className="block space-y-1 text-sm">
          {t('galleryUpload')}
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = '';
              if (!file || submitting.current || full) return;
              const epoch = lease.current;
              submitting.current = true;
              setBusy(true);
              setFailed(false);
              onPendingChange(true);
              try {
                const result = await upload.mutateAsync(file);
                if (lease.current === epoch) append(result.image);
              } catch {
                if (lease.current === epoch) setFailed(true);
              } finally {
                if (lease.current === epoch) {
                  submitting.current = false;
                  setBusy(false);
                  onPendingChange(false);
                }
              }
            }}
          />
        </label>
        <p className="text-muted-foreground text-xs">{t('uploadHint')}</p>
      </fieldset>
      {busy && <p role="status">{t('galleryUploading')}</p>}
      {failed && <p role="alert">{t('requestFailed')}</p>}
      {items.map((item, index) => (
        <ArtworkGalleryItem
          key={index}
          item={item}
          index={index}
          count={items.length}
          disabled={busy}
          onChange={(value) =>
            onChange(items.map((current, i) => (i === index ? value : current)))
          }
          onMove={(offset) => {
            const next = [...items];
            const target = index + offset;
            if (target < 0 || target >= next.length) return;
            [next[index], next[target]] = [next[target]!, next[index]!];
            onChange(next);
          }}
          onRemove={() => onChange(items.filter((_, i) => i !== index))}
        />
      ))}
    </section>
  );
}
