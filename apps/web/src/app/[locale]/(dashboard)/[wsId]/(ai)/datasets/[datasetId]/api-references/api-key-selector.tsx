'use client';

import { Button } from '@ncthub/ui/button';
import { Key } from '@ncthub/ui/icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ncthub/ui/select';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

interface ApiKey {
  id: string;
  name: string;
  value: string;
}

interface Props {
  wsId: string;
  apiKeys: ApiKey[];
  // eslint-disable-next-line no-unused-vars
  onSelect?: (value: string) => void;
  defaultValue?: string;
}

export default function ApiKeySelector({
  wsId,
  apiKeys,
  onSelect,
  defaultValue,
}: Props) {
  const t = useTranslations('ws-api-keys');

  return (
    <div className="flex items-center gap-4">
      <div className="flex-1">
        {apiKeys.length > 0 ? (
          <Select onValueChange={onSelect} defaultValue={defaultValue}>
            <SelectTrigger className="border-muted-foreground/20 bg-muted/50">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder={t('select_api_key')} />
              </div>
            </SelectTrigger>
            <SelectContent>
              {apiKeys.map((key) => (
                <SelectItem key={key.id} value={key.value}>
                  {key.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-muted-foreground/20 bg-muted/50 px-3 py-2">
            <Key className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {t('no_api_keys_found')}
            </span>
          </div>
        )}
      </div>
      <Link href={`/${wsId}/api-keys`}>
        <Button
          variant={apiKeys.length > 0 ? 'outline' : 'default'}
          size="sm"
          className="whitespace-nowrap"
        >
          {apiKeys.length > 0 ? t('edit_key') : t('create_key')}
        </Button>
      </Link>
    </div>
  );
}
