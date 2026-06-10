'use client';

import { LoaderCircle, MessageCircle, QrCode, Radio } from '@tuturuuu/icons';
import type {
  ChatIntegrationKind,
  CreateChatIntegrationResponse,
} from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { toast } from '../sonner';
import { useCreateChatIntegration } from './hooks';

type IntegrationCard = {
  descriptionKey:
    | 'integration_discord_description'
    | 'integration_zalo_official_description'
    | 'integration_zalo_personal_description';
  icon: typeof MessageCircle;
  kind: ChatIntegrationKind;
  titleKey:
    | 'integration_discord'
    | 'integration_zalo_official'
    | 'integration_zalo_personal';
};

const INTEGRATION_CARDS = [
  {
    descriptionKey: 'integration_discord_description',
    icon: MessageCircle,
    kind: 'discord',
    titleKey: 'integration_discord',
  },
  {
    descriptionKey: 'integration_zalo_official_description',
    icon: Radio,
    kind: 'zalo-official',
    titleKey: 'integration_zalo_official',
  },
  {
    descriptionKey: 'integration_zalo_personal_description',
    icon: QrCode,
    kind: 'zalo-personal',
    titleKey: 'integration_zalo_personal',
  },
] as const satisfies IntegrationCard[];

interface CreateIntegrationPanelProps {
  onCreated: (result: CreateChatIntegrationResponse) => void;
}

export function CreateIntegrationPanel({
  onCreated,
}: CreateIntegrationPanelProps) {
  const t = useTranslations('chat');
  const createIntegration = useCreateChatIntegration();
  const pendingKind = createIntegration.variables?.kind ?? null;

  function create(kind: ChatIntegrationKind) {
    createIntegration.mutate(
      { kind },
      {
        onError: () => {
          toast.error(t('integration_create_failed'));
        },
        onSuccess: (result) => {
          toast.success(t('integration_create_success'));
          onCreated(result);
        },
      }
    );
  }

  return (
    <div className="grid gap-3">
      {INTEGRATION_CARDS.map((item) => {
        const Icon = item.icon;
        const isPending =
          createIntegration.isPending && pendingKind === item.kind;

        return (
          <button
            className="group flex min-h-24 w-full items-start gap-3 rounded-md border bg-background p-4 text-left transition-colors hover:border-foreground/35 hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
            disabled={createIntegration.isPending}
            key={item.kind}
            onClick={() => create(item.kind)}
            type="button"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground group-hover:text-foreground">
              {isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Icon className="size-4" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-sm">
                {t(item.titleKey)}
              </span>
              <span className="mt-1 block text-muted-foreground text-xs leading-5">
                {t(item.descriptionKey)}
              </span>
            </span>
            <span className="shrink-0 self-center rounded-md border px-2.5 py-1 font-medium text-xs">
              {t('integration_setup')}
            </span>
          </button>
        );
      })}
    </div>
  );
}
