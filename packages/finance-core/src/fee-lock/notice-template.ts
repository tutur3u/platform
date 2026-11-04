import {
  FEE_NOTICE_PLACEHOLDER_PATTERN,
  type FeeNoticeTemplate,
} from './notice';

// Save-time template validation: unknown placeholders are rejected, not
// dropped. M3's private.fee_notice_template_save enforces the same allowlists.

export const FEE_NOTICE_TEMPLATE_LIMITS = {
  body: 2000,
  item_format: 200,
  item_separator: 20,
  payment_line: 300,
} as const;

/** Allowlisted placeholders per template field; anything else is rejected. */
export const FEE_NOTICE_PLACEHOLDERS = {
  body: 'centre_name month student_name class_name tuition tuition_amount session_count items items_with_prefix total payment_line'.split(
    ' '
  ),
  item_format: 'name price unit quantity amount'.split(' '),
  payment_line: 'centre_name month student_name class_name'.split(' '),
};

export type FeeNoticeTemplateIssue =
  | { field: keyof typeof FEE_NOTICE_TEMPLATE_LIMITS; code: 'too_long' }
  | {
      field: 'body' | 'item_format' | 'payment_line';
      code: 'unknown_placeholder';
      name: string;
    };

export function validateFeeNoticeTemplate(
  template: Pick<FeeNoticeTemplate, keyof typeof FEE_NOTICE_TEMPLATE_LIMITS>
): FeeNoticeTemplateIssue[] {
  const issues: FeeNoticeTemplateIssue[] = [];
  for (const [field, limit] of Object.entries(FEE_NOTICE_TEMPLATE_LIMITS)) {
    const key = field as keyof typeof FEE_NOTICE_TEMPLATE_LIMITS;
    if (template[key].length > limit)
      issues.push({ field: key, code: 'too_long' });
  }
  for (const [field, allowed] of Object.entries(FEE_NOTICE_PLACEHOLDERS)) {
    const key = field as keyof typeof FEE_NOTICE_PLACEHOLDERS;
    for (const match of template[key].matchAll(
      FEE_NOTICE_PLACEHOLDER_PATTERN
    )) {
      const name = match[1] ?? '';
      if (!allowed.includes(name)) {
        issues.push({ field: key, code: 'unknown_placeholder', name });
      }
    }
  }
  return issues;
}
