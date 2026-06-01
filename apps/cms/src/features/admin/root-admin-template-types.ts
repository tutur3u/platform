import type { CanonicalExternalProject, Json } from '@tuturuuu/types';

export type TemplateMutationPayload = {
  adapter: CanonicalExternalProject['adapter'];
  allowed_collections: CanonicalExternalProject['allowed_collections'];
  allowed_features: CanonicalExternalProject['allowed_features'];
  delivery_profile: Json;
  display_name: string;
  id: string;
  is_active: boolean;
  metadata: Json;
};

export type TemplateDialogStrings = {
  activeLabel: string;
  allSiteTypes: string;
  createTemplateAction: string;
  createTemplateDescription: string;
  createTemplateTitle: string;
  developerDetailsTitle: string;
  developerSettingsHint: string;
  developerSettingsLabel: string;
  displayNameLabel: string;
  emptyTemplateDescription: string;
  emptyTemplateTitle: string;
  inactiveLabel: string;
  invalidDeveloperSettings: string;
  recommendedSectionsLabel: string;
  saveTemplateAction: string;
  searchPlaceholder: string;
  siteTypeLabel: string;
  templateKeyLabel: string;
  templateManagerDescription: string;
  templateManagerTitle: string;
};
