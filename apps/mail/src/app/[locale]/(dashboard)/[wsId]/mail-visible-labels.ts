import type { MailLabel } from '@tuturuuu/internal-api';
import type { MailFolder } from './mail-folders';

export function visibleMailLabels(labels: MailLabel[], folder?: MailFolder) {
  return labels.filter(
    (label) => label.kind !== 'system' || label.slug !== folder
  );
}
