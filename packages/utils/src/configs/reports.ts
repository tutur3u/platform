import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';

// Report template configs
export const reportConfigs: (WorkspaceConfig & {
  defaultValue: string;
})[] = [
  {
    id: 'BRAND_LOGO_URL',
    type: 'URL',
    defaultValue: '',
  },
  {
    id: 'BRAND_NAME',
    type: 'TEXT',
    defaultValue: '',
  },
  {
    id: 'BRAND_LOCATION',
    type: 'TEXT',
    defaultValue: '',
  },
  {
    id: 'BRAND_PHONE_NUMBER',
    type: 'TEXT',
    defaultValue: '',
  },
  {
    id: 'REPORT_TITLE_PREFIX',
    type: 'TEXT',
    defaultValue: '',
  },
  {
    id: 'REPORT_TITLE_SUFFIX',
    type: 'TEXT',
    defaultValue: '',
  },
  {
    id: 'REPORT_DEFAULT_TITLE',
    type: 'TEXT',
    defaultValue: '',
  },
  {
    id: 'REPORT_INTRO',
    type: 'TEXT',
    defaultValue: '',
  },
  {
    id: 'REPORT_CONTENT_TEXT',
    type: 'TEXT',
    defaultValue: '',
  },
  {
    id: 'REPORT_SCORE_TEXT',
    type: 'TEXT',
    defaultValue: '',
  },
  {
    id: 'REPORT_FEEDBACK_TEXT',
    type: 'TEXT',
    defaultValue: '',
  },
  {
    id: 'REPORT_CONCLUSION',
    type: 'TEXT',
    defaultValue: '',
  },
  {
    id: 'REPORT_CLOSING',
    type: 'TEXT',
    defaultValue: '',
  },
];

// Lead generation email template configs
export const leadGenerationConfigs: (WorkspaceConfig & {
  defaultValue: string;
})[] = [
  // Shared brand configs (already in report template)
  {
    id: 'BRAND_LOGO_URL',
    type: 'URL',
    defaultValue: '',
  },
  {
    id: 'BRAND_NAME',
    type: 'TEXT',
    defaultValue: '',
  },
  {
    id: 'BRAND_LOCATION',
    type: 'TEXT',
    defaultValue: '',
  },
  {
    id: 'BRAND_PHONE_NUMBER',
    type: 'TEXT',
    defaultValue: '',
  },
  // Lead generation specific configs
  {
    id: 'LEAD_EMAIL_TITLE',
    type: 'TEXT',
    defaultValue: '',
  },
  {
    id: 'LEAD_EMAIL_GREETING',
    type: 'TEXT',
    defaultValue: '',
  },
  {
    id: 'LEAD_EMAIL_TABLE_HEADER_COMMENTS',
    type: 'TEXT',
    defaultValue: '',
  },
  {
    id: 'LEAD_EMAIL_TABLE_HEADER_SCORE',
    type: 'TEXT',
    defaultValue: '',
  },
  {
    id: 'LEAD_EMAIL_TABLE_SCORE_SCALE',
    type: 'TEXT',
    defaultValue: '',
  },
  {
    id: 'LEAD_EMAIL_FOOTER',
    type: 'TEXT',
    defaultValue: '',
  },
  {
    id: 'LEAD_EMAIL_SIGNATURE_TITLE',
    type: 'TEXT',
    defaultValue: '',
  },
  {
    id: 'LEAD_EMAIL_SIGNATURE_NAME',
    type: 'TEXT',
    defaultValue: '',
  },
];

// Combined list for backward compatibility
export const availableConfigs: (WorkspaceConfig & {
  defaultValue: string;
})[] = [
  ...reportConfigs,
  ...leadGenerationConfigs.filter(
    (config) => !reportConfigs.some((rc) => rc.id === config.id)
  ),
];
