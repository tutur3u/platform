'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Loader2 } from '@tuturuuu/icons';
import {
  getWorkspaceUserProfileLinkDefaultConfigs,
  updateWorkspaceConfig,
} from '@tuturuuu/internal-api/workspace-configs';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_PROFILE_LINK_DEFAULTS,
  getProfileLinkDefaultsQueryKey,
  PROFILE_LINK_EXPIRATION_PRESETS,
  type ProfileLinkDefaults,
  type ProfileLinkExpirationPreset,
  resolveProfileLinkDefaults,
  serializeProfileLinkDefaults,
} from '@/features/user-profile-links/defaults';
import {
  PROFILE_LINK_FIELDS,
  type ProfileLinkField,
} from '@/features/user-profile-links/fields';

interface Props {
  wsId: string;
}

function hasSameDefaults(
  left: ProfileLinkDefaults,
  right: ProfileLinkDefaults
) {
  return (
    JSON.stringify(serializeProfileLinkDefaults(left)) ===
    JSON.stringify(serializeProfileLinkDefaults(right))
  );
}

function SwitchSetting({
  checked,
  help,
  id,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  help: string;
  id: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
      <div className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-muted-foreground text-sm">{help}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function SettingSection({
  children,
  help,
  label,
}: {
  children: ReactNode;
  help: string;
  label: string;
}) {
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <Label>{label}</Label>
      {children}
      <p className="text-muted-foreground text-sm">{help}</p>
    </div>
  );
}

function MaxUsesSetting({
  help,
  label,
  maxUses,
  onMaxUsesChange,
  onUnlimitedChange,
  placeholder,
  unlimited,
  unlimitedLabel,
}: {
  help: string;
  label: string;
  maxUses: string;
  onMaxUsesChange: (value: string) => void;
  onUnlimitedChange: (checked: boolean) => void;
  placeholder: string;
  unlimited: boolean;
  unlimitedLabel: string;
}) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="profile-link-default-max-uses">{label}</Label>
          <p className="text-muted-foreground text-sm">{help}</p>
        </div>
        <div className="flex items-center gap-2">
          <Label
            className="text-muted-foreground text-sm"
            htmlFor="profile-link-default-max-uses-unlimited"
          >
            {unlimitedLabel}
          </Label>
          <Switch
            id="profile-link-default-max-uses-unlimited"
            checked={unlimited}
            onCheckedChange={onUnlimitedChange}
          />
        </div>
      </div>
      <Input
        id="profile-link-default-max-uses"
        min={1}
        type="number"
        value={maxUses}
        disabled={unlimited}
        onChange={(event) => onMaxUsesChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function FieldsSetting({
  fields,
  help,
  label,
  onToggleField,
  translateField,
}: {
  fields: ProfileLinkField[];
  help: string;
  label: string;
  onToggleField: (field: ProfileLinkField, checked: boolean) => void;
  translateField: (field: ProfileLinkField) => string;
}) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="space-y-1">
        <Label>{label}</Label>
        <p className="text-muted-foreground text-sm">{help}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {PROFILE_LINK_FIELDS.map((field) => (
          <label key={field} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={fields.includes(field)}
              onCheckedChange={(checked) =>
                onToggleField(field, checked === true)
              }
            />
            {translateField(field)}
          </label>
        ))}
      </div>
    </div>
  );
}

export default function ProfileLinkDefaultsSettings({ wsId }: Props) {
  const t = useTranslations('ws-settings');
  const commonT = useTranslations('common');
  const profileLinksT = useTranslations('ws-user-profile-links');
  const queryClient = useQueryClient();
  const queryKey = getProfileLinkDefaultsQueryKey(wsId);

  const { data: configValues, isLoading } = useQuery({
    queryKey,
    queryFn: () => getWorkspaceUserProfileLinkDefaultConfigs(wsId),
  });

  const resolvedDefaults = useMemo(
    () => resolveProfileLinkDefaults(configValues ?? {}),
    [configValues]
  );

  const [initialDefaults, setInitialDefaults] = useState<ProfileLinkDefaults>(
    DEFAULT_PROFILE_LINK_DEFAULTS
  );
  const [requiresAuth, setRequiresAuth] = useState(true);
  const [expirationPreset, setExpirationPreset] =
    useState<ProfileLinkExpirationPreset>('30d');
  const [maxUses, setMaxUses] = useState('1');
  const [maxUsesUnlimited, setMaxUsesUnlimited] = useState(false);
  const [prefillExistingValues, setPrefillExistingValues] = useState(true);
  const [fields, setFields] = useState<ProfileLinkField[]>([
    'display_name',
    'full_name',
  ]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (isLoading || initialized) return;

    setInitialDefaults(resolvedDefaults);
    setRequiresAuth(resolvedDefaults.requiresAuth);
    setExpirationPreset(resolvedDefaults.expirationPreset);
    setMaxUses(
      resolvedDefaults.maxUses === null ? '' : String(resolvedDefaults.maxUses)
    );
    setMaxUsesUnlimited(resolvedDefaults.maxUses === null);
    setPrefillExistingValues(resolvedDefaults.prefillExistingValues);
    setFields(resolvedDefaults.fields);
    setInitialized(true);
  }, [initialized, isLoading, resolvedDefaults]);

  const parsedMaxUses = Number.parseInt(maxUses, 10);
  const hasValidMaxUses =
    maxUsesUnlimited || (Number.isInteger(parsedMaxUses) && parsedMaxUses > 0);
  const currentDefaults: ProfileLinkDefaults | null =
    hasValidMaxUses && fields.length > 0
      ? {
          expirationPreset,
          fields,
          maxUses: maxUsesUnlimited ? null : parsedMaxUses,
          prefillExistingValues,
          requiresAuth,
        }
      : null;
  const isDirty =
    currentDefaults !== null &&
    !hasSameDefaults(currentDefaults, initialDefaults);

  const updateMutation = useMutation({
    mutationFn: async (defaults: ProfileLinkDefaults) => {
      const serialized = serializeProfileLinkDefaults(defaults);
      await Promise.all(
        Object.entries(serialized).map(([configId, value]) =>
          updateWorkspaceConfig(wsId, configId, value)
        )
      );
      return serialized;
    },
    onSuccess: (serialized, defaults) => {
      setInitialDefaults(defaults);
      queryClient.setQueryData(queryKey, serialized);
      queryClient.invalidateQueries({ queryKey });
      toast.success(t('profile_link_defaults_update_success'));
    },
    onError: () => {
      toast.error(t('profile_link_defaults_update_error'));
    },
  });

  const setFieldEnabled = (field: ProfileLinkField, checked: boolean) => {
    setFields((current) =>
      checked
        ? PROFILE_LINK_FIELDS.filter(
            (candidate) => candidate === field || current.includes(candidate)
          )
        : current.filter((candidate) => candidate !== field)
    );
  };

  if (!initialized) {
    return (
      <div className="flex justify-center rounded-lg border p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <section className="space-y-6 rounded-lg border border-border bg-foreground/5 p-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold text-lg">
            {t('profile_link_defaults')}
          </h3>
        </div>
        <p className="text-muted-foreground text-sm">
          {t('profile_link_defaults_description')}
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (currentDefaults) updateMutation.mutate(currentDefaults);
        }}
      >
        <SwitchSetting
          id="profile-link-default-requires-auth"
          checked={requiresAuth}
          onCheckedChange={setRequiresAuth}
          label={t('profile_link_defaults_require_auth_label')}
          help={t('profile_link_defaults_require_auth_help')}
        />

        <SettingSection
          label={t('profile_link_defaults_expiration_label')}
          help={t('profile_link_defaults_expiration_help')}
        >
          <Select
            value={expirationPreset}
            onValueChange={(value) =>
              setExpirationPreset(value as ProfileLinkExpirationPreset)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROFILE_LINK_EXPIRATION_PRESETS.map((preset) => (
                <SelectItem key={preset} value={preset}>
                  {t(`profile_link_defaults_expiration_${preset}` as never)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingSection>

        <MaxUsesSetting
          label={t('profile_link_defaults_max_uses_label')}
          help={t('profile_link_defaults_max_uses_help')}
          maxUses={maxUses}
          onMaxUsesChange={setMaxUses}
          unlimited={maxUsesUnlimited}
          onUnlimitedChange={setMaxUsesUnlimited}
          unlimitedLabel={t('profile_link_defaults_max_uses_unlimited')}
          placeholder={t('profile_link_defaults_max_uses_placeholder')}
        />

        <SwitchSetting
          id="profile-link-default-prefill"
          checked={prefillExistingValues}
          onCheckedChange={setPrefillExistingValues}
          label={t('profile_link_defaults_prefill_label')}
          help={t('profile_link_defaults_prefill_help')}
        />

        <FieldsSetting
          label={t('profile_link_defaults_fields_label')}
          help={t('profile_link_defaults_fields_help')}
          fields={fields}
          onToggleField={setFieldEnabled}
          translateField={(field) => profileLinksT(`field_${field}` as never)}
        />

        <Button
          type="submit"
          disabled={!isDirty || !currentDefaults || updateMutation.isPending}
        >
          {updateMutation.isPending ? commonT('saving') : commonT('save')}
        </Button>
      </form>
    </section>
  );
}
