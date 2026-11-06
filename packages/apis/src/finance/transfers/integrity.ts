type TransferIntegrityIncident = {
  wsId: string;
  fromTransactionId: string;
  toTransactionId: string;
  linkError: string;
  cleanupError?: string;
};

export function notifyTransferIntegrityIncident(
  incident: TransferIntegrityIncident
) {
  console.error('[FinanceTransferIntegrityIncident]', incident);
  process.emit('finance-transfer-integrity-incident', incident);
}
