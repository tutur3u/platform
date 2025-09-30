import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';

/**
 * Helper type for lead email data
 */
export interface LeadEmailData {
  leadName?: string;
  className?: string;
  teacherName?: string;
  avgScore?: number;
  comments?: string;
  currentDate?: string;
}

/**
 * Helper type for all lead email config variables
 */
export interface LeadEmailConfig {
  // Required (shared with report-preview where possible)
  brandLogoUrl: string; // BRAND_LOGO_URL (shared)
  brandName: string; // BRAND_NAME (shared)
  brandPhone: string; // BRAND_PHONE_NUMBER (shared)
  emailTitle: string; // LEAD_EMAIL_TITLE
  emailGreeting: string; // LEAD_EMAIL_GREETING
  tableHeaderComments: string; // LEAD_EMAIL_TABLE_HEADER_COMMENTS
  tableHeaderScore: string; // LEAD_EMAIL_TABLE_HEADER_SCORE
  emailFooter: string; // LEAD_EMAIL_FOOTER
  signatureTitle: string; // LEAD_EMAIL_SIGNATURE_TITLE
  signatureName: string; // LEAD_EMAIL_SIGNATURE_NAME

  // Optional
  brandLocation?: string; // BRAND_LOCATION (shared, supports newlines)
  tableScoreScale?: string; // LEAD_EMAIL_TABLE_SCORE_SCALE
  brandLogoWidth?: string; // LEAD_EMAIL_BRAND_LOGO_WIDTH
  brandLogoHeight?: string; // LEAD_EMAIL_BRAND_LOGO_HEIGHT
  titleColor?: string; // LEAD_EMAIL_TITLE_COLOR
  emptyCommentsPlaceholder?: string; // LEAD_EMAIL_EMPTY_COMMENTS
  emptyScorePlaceholder?: string; // LEAD_EMAIL_EMPTY_SCORE
}

/**
 * Config keys for lead generation email template
 * Note: Some keys are shared with report-preview (BRAND_*) to reduce duplication
 */
export const LEAD_EMAIL_CONFIG_KEYS = {
  // Required - Shared with report-preview
  BRAND_LOGO_URL: 'BRAND_LOGO_URL', // Shared
  BRAND_NAME: 'BRAND_NAME', // Shared
  BRAND_PHONE: 'BRAND_PHONE_NUMBER', // Shared

  // Required - Lead email specific
  EMAIL_TITLE: 'LEAD_EMAIL_TITLE',
  EMAIL_GREETING: 'LEAD_EMAIL_GREETING',
  TABLE_HEADER_COMMENTS: 'LEAD_EMAIL_TABLE_HEADER_COMMENTS',
  TABLE_HEADER_SCORE: 'LEAD_EMAIL_TABLE_HEADER_SCORE',
  EMAIL_FOOTER: 'LEAD_EMAIL_FOOTER',
  SIGNATURE_TITLE: 'LEAD_EMAIL_SIGNATURE_TITLE',
  SIGNATURE_NAME: 'LEAD_EMAIL_SIGNATURE_NAME',

  // Optional - Shared with report-preview
  BRAND_LOCATION: 'BRAND_LOCATION', // Shared (supports \n for multiple lines)

  // Optional - Lead email specific
  TABLE_SCORE_SCALE: 'LEAD_EMAIL_TABLE_SCORE_SCALE',
  BRAND_LOGO_WIDTH: 'LEAD_EMAIL_BRAND_LOGO_WIDTH',
  BRAND_LOGO_HEIGHT: 'LEAD_EMAIL_BRAND_LOGO_HEIGHT',
  TITLE_COLOR: 'LEAD_EMAIL_TITLE_COLOR',
  EMPTY_COMMENTS: 'LEAD_EMAIL_EMPTY_COMMENTS',
  EMPTY_SCORE: 'LEAD_EMAIL_EMPTY_SCORE',
} as const;

/**
 * Extract lead email config from workspace configs
 * @throws Error if required configs are missing
 */
export function extractLeadEmailConfig(
  configs: WorkspaceConfig[]
): LeadEmailConfig {
  const getConfig = (id: string) => configs.find((c) => c.id === id)?.value;

  // Required configs
  const brandLogoUrl = getConfig(LEAD_EMAIL_CONFIG_KEYS.BRAND_LOGO_URL);
  const brandName = getConfig(LEAD_EMAIL_CONFIG_KEYS.BRAND_NAME);
  const brandPhone = getConfig(LEAD_EMAIL_CONFIG_KEYS.BRAND_PHONE);
  const emailTitle = getConfig(LEAD_EMAIL_CONFIG_KEYS.EMAIL_TITLE);
  const emailGreeting = getConfig(LEAD_EMAIL_CONFIG_KEYS.EMAIL_GREETING);
  const tableHeaderComments = getConfig(
    LEAD_EMAIL_CONFIG_KEYS.TABLE_HEADER_COMMENTS
  );
  const tableHeaderScore = getConfig(LEAD_EMAIL_CONFIG_KEYS.TABLE_HEADER_SCORE);
  const emailFooter = getConfig(LEAD_EMAIL_CONFIG_KEYS.EMAIL_FOOTER);
  const signatureTitle = getConfig(LEAD_EMAIL_CONFIG_KEYS.SIGNATURE_TITLE);
  const signatureName = getConfig(LEAD_EMAIL_CONFIG_KEYS.SIGNATURE_NAME);

  // Validate required configs
  const missingConfigs = [];
  if (!brandLogoUrl) missingConfigs.push(LEAD_EMAIL_CONFIG_KEYS.BRAND_LOGO_URL);
  if (!brandName) missingConfigs.push(LEAD_EMAIL_CONFIG_KEYS.BRAND_NAME);
  if (!brandPhone) missingConfigs.push(LEAD_EMAIL_CONFIG_KEYS.BRAND_PHONE);
  if (!emailTitle) missingConfigs.push(LEAD_EMAIL_CONFIG_KEYS.EMAIL_TITLE);
  if (!emailGreeting)
    missingConfigs.push(LEAD_EMAIL_CONFIG_KEYS.EMAIL_GREETING);
  if (!tableHeaderComments)
    missingConfigs.push(LEAD_EMAIL_CONFIG_KEYS.TABLE_HEADER_COMMENTS);
  if (!tableHeaderScore)
    missingConfigs.push(LEAD_EMAIL_CONFIG_KEYS.TABLE_HEADER_SCORE);
  if (!emailFooter) missingConfigs.push(LEAD_EMAIL_CONFIG_KEYS.EMAIL_FOOTER);
  if (!signatureTitle)
    missingConfigs.push(LEAD_EMAIL_CONFIG_KEYS.SIGNATURE_TITLE);
  if (!signatureName)
    missingConfigs.push(LEAD_EMAIL_CONFIG_KEYS.SIGNATURE_NAME);

  if (missingConfigs.length > 0) {
    throw new Error(
      `Missing required lead email configurations: ${missingConfigs.join(', ')}`
    );
  }

  return {
    // Required (safe to cast since we validated above)
    brandLogoUrl: brandLogoUrl!,
    brandName: brandName!,
    brandPhone: brandPhone!,
    emailTitle: emailTitle!,
    emailGreeting: emailGreeting!,
    tableHeaderComments: tableHeaderComments!,
    tableHeaderScore: tableHeaderScore!,
    emailFooter: emailFooter!,
    signatureTitle: signatureTitle!,
    signatureName: signatureName!,

    // Optional
    brandLocation:
      getConfig(LEAD_EMAIL_CONFIG_KEYS.BRAND_LOCATION) ?? undefined,
    tableScoreScale:
      getConfig(LEAD_EMAIL_CONFIG_KEYS.TABLE_SCORE_SCALE) ?? undefined,
    brandLogoWidth:
      getConfig(LEAD_EMAIL_CONFIG_KEYS.BRAND_LOGO_WIDTH) ?? undefined,
    brandLogoHeight:
      getConfig(LEAD_EMAIL_CONFIG_KEYS.BRAND_LOGO_HEIGHT) ?? undefined,
    titleColor: getConfig(LEAD_EMAIL_CONFIG_KEYS.TITLE_COLOR) ?? undefined,
    emptyCommentsPlaceholder:
      getConfig(LEAD_EMAIL_CONFIG_KEYS.EMPTY_COMMENTS) ?? undefined,
    emptyScorePlaceholder:
      getConfig(LEAD_EMAIL_CONFIG_KEYS.EMPTY_SCORE) ?? undefined,
  };
}

/**
 * Parse dynamic text with variable replacements
 */
export function parseLeadEmailDynamicText(
  text: string,
  data: LeadEmailData
): string {
  return text
    .replace(/{{leadName}}/g, data.leadName || '')
    .replace(/{{className}}/g, data.className || '')
    .replace(/{{teacherName}}/g, data.teacherName || '')
    .replace(
      /{{currentDate}}/g,
      data.currentDate || new Date().toLocaleDateString()
    )
    .replace(/{{avgScore}}/g, data.avgScore?.toString() || '');
}

/**
 * Get list of all required config keys
 */
export function getRequiredLeadEmailConfigKeys(): string[] {
  return [
    LEAD_EMAIL_CONFIG_KEYS.BRAND_LOGO_URL,
    LEAD_EMAIL_CONFIG_KEYS.BRAND_NAME,
    LEAD_EMAIL_CONFIG_KEYS.BRAND_PHONE,
    LEAD_EMAIL_CONFIG_KEYS.EMAIL_TITLE,
    LEAD_EMAIL_CONFIG_KEYS.EMAIL_GREETING,
    LEAD_EMAIL_CONFIG_KEYS.TABLE_HEADER_COMMENTS,
    LEAD_EMAIL_CONFIG_KEYS.TABLE_HEADER_SCORE,
    LEAD_EMAIL_CONFIG_KEYS.EMAIL_FOOTER,
    LEAD_EMAIL_CONFIG_KEYS.SIGNATURE_TITLE,
    LEAD_EMAIL_CONFIG_KEYS.SIGNATURE_NAME,
  ];
}

/**
 * Get list of all optional config keys
 */
export function getOptionalLeadEmailConfigKeys(): string[] {
  return [
    LEAD_EMAIL_CONFIG_KEYS.BRAND_LOCATION,
    LEAD_EMAIL_CONFIG_KEYS.TABLE_SCORE_SCALE,
    LEAD_EMAIL_CONFIG_KEYS.BRAND_LOGO_WIDTH,
    LEAD_EMAIL_CONFIG_KEYS.BRAND_LOGO_HEIGHT,
    LEAD_EMAIL_CONFIG_KEYS.TITLE_COLOR,
    LEAD_EMAIL_CONFIG_KEYS.EMPTY_COMMENTS,
    LEAD_EMAIL_CONFIG_KEYS.EMPTY_SCORE,
  ];
}

/**
 * Validate that all required configs are present
 * Returns array of missing config keys, or empty array if all present
 */
export function validateLeadEmailConfigs(configs: WorkspaceConfig[]): string[] {
  const configIds = new Set(configs.map((c) => c.id));
  const required = getRequiredLeadEmailConfigKeys();
  return required.filter((key) => !configIds.has(key));
}
