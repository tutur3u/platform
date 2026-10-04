import { MAX_SUPPORT_INQUIRY_NAME_LENGTH } from '@tuturuuu/utils/constants';

export function inquiryPrefillName(value: string): string {
  return Array.from(value).slice(0, MAX_SUPPORT_INQUIRY_NAME_LENGTH).join('');
}
