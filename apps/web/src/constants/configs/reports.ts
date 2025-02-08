import { WorkspaceConfig } from '@repo/types/primitives/WorkspaceConfig';

export const availableConfigs: (WorkspaceConfig & {
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
