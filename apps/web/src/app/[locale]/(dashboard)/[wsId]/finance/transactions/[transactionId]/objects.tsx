'use client';

import { TransactionObjectRowActions } from './row-actions';
import { joinPath } from '@/utils/path-helper';
import { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { Button } from '@tuturuuu/ui/button';
import { FileText, LayoutGrid, LayoutList } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

export function DetailObjects({
  wsId,
  transactionId,
  objects,
}: {
  wsId: string;
  transactionId: string;
  objects: StorageObject[];
}) {
  const [displayMode, setDisplayMode] = useState<'list' | 'grid'>('list');
  const t = useTranslations();

  return (
    <div className="h-fit space-y-2 rounded-lg border p-4">
      <div className="flex justify-between text-lg font-semibold">
        {t('invoices.files')}
        <div className="flex gap-2">
          <Button variant="ghost" size="xs" asChild>
            <Link
              href={`/${joinPath(wsId, 'drive')}?path=${joinPath('finance', 'transactions', transactionId)}`}
            >
              {t('sidebar_tabs.drive')}
            </Link>
          </Button>
          <div className="flex">
            <Button
              variant={displayMode === 'list' ? 'default' : 'secondary'}
              size="xs"
              className="rounded-tr-none rounded-br-none"
              onClick={() => setDisplayMode('list')}
            >
              <LayoutList />
            </Button>
            <Button
              variant={displayMode === 'grid' ? 'default' : 'secondary'}
              size="xs"
              className="rounded-tl-none rounded-bl-none"
              onClick={() => setDisplayMode('grid')}
            >
              <LayoutGrid />
            </Button>
          </div>
        </div>
      </div>
      <Separator />
      {displayMode === 'list' ? (
        <div className="space-y-2">
          {objects.map((object) => (
            <DetailObjectList
              key={object.id}
              wsId={wsId}
              transactionId={transactionId}
              object={object}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {objects.map((object) => (
            <DetailObjectGrid
              key={object.id}
              wsId={wsId}
              transactionId={transactionId}
              object={object}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DetailObjectList({
  wsId,
  transactionId,
  object,
}: {
  wsId: string;
  transactionId: string;
  object: StorageObject;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <FileText className="h-4 w-4 shrink-0" />

      <span className="flex-1 truncate">{object.name}</span>

      <div className="shrink-0">
        <TransactionObjectRowActions
          wsId={wsId}
          transactionId={transactionId}
          storageObj={object}
        />
      </div>
    </div>
  );
}

function DetailObjectGrid({
  wsId,
  transactionId,
  object,
}: {
  wsId: string;
  transactionId: string;
  object: StorageObject;
}) {
  return (
    <div className="space-y-4 rounded-lg bg-foreground/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <FileText className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{object.name}</span>
        <div className="shrink-0">
          <TransactionObjectRowActions
            wsId={wsId}
            transactionId={transactionId}
            storageObj={object}
          />
        </div>
      </div>

      <div className="relative aspect-square overflow-hidden rounded object-cover">
        {object.metadata?.preview?.signedUrl ? (
          <Image
            src={object.metadata.preview.signedUrl}
            alt=""
            className="h-full w-full object-cover"
            fill
          />
        ) : (
          <div className="h-full w-full rounded bg-background" />
        )}
      </div>
    </div>
  );
}
