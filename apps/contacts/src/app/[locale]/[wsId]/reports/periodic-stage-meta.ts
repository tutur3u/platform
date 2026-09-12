export const PERIODIC_STAGES = [
  ['draft', 'drafts', 'missing_check'],
  ['pending', 'status_pending', 'pending_approval'],
  ['approved', 'approved_awaiting_delivery', 'approved_awaiting_delivery'],
  ['blocked', 'undeliverable', 'undeliverable'],
  ['queued', 'status_queued', 'queued'],
  ['processing', 'status_processing', 'processing'],
  ['sent', 'status_sent', 'sent'],
  ['failed', 'failed', 'delivery_failed'],
  ['skipped', 'status_skipped', 'skipped'],
  ['rejected', 'status_rejected', 'rejected'],
] as const;
