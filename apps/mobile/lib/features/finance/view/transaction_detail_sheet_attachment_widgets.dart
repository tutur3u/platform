part of 'transaction_detail_sheet.dart';

const int _maxTransactionAttachmentCount = 10;
const int _maxTransactionAttachmentSizeBytes = 50 * 1024 * 1024;

enum _TransactionAttachmentStatus {
  pending,
  uploading,
  queued,
  uploaded,
  error,
}

class _TransactionAttachmentDraft {
  const _TransactionAttachmentDraft({
    required this.id,
    required this.file,
    required this.size,
    this.status = _TransactionAttachmentStatus.pending,
  });
  final String id;
  final PlatformFile file;
  final int size;
  final _TransactionAttachmentStatus status;
  _TransactionAttachmentDraft copyWith({_TransactionAttachmentStatus? status}) {
    return _TransactionAttachmentDraft(
      id: id,
      file: file,
      size: size,
      status: status ?? this.status,
    );
  }
}

String _formatAttachmentSize(int bytes) {
  if (bytes >= 1024 * 1024) {
    final value = bytes / (1024 * 1024);
    return '${value.toStringAsFixed(value >= 10 ? 0 : 1)} MB';
  }
  if (bytes >= 1024) {
    final value = bytes / 1024;
    return '${value.toStringAsFixed(value >= 10 ? 0 : 1)} KB';
  }

  return '$bytes B';
}

class _FormSectionCard extends StatelessWidget {
  const _FormSectionCard({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      padding: const EdgeInsets.all(14),
      radius: 22,
      backgroundColor: FinancePalette.of(context).elevatedPanel,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: shad.Theme.of(
                    context,
                  ).typography.small.copyWith(fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
          const shad.Gap(10),
          child,
        ],
      ),
    );
  }
}

class _TransactionAttachmentPicker extends StatelessWidget {
  const _TransactionAttachmentPicker({
    required this.attachments,
    required this.isSaving,
    required this.onPickAttachments,
    required this.onRemoveAttachment,
  });

  final List<_TransactionAttachmentDraft> attachments;
  final bool isSaving;
  final VoidCallback onPickAttachments;
  final ValueChanged<String> onRemoveAttachment;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final canAdd =
        !isSaving && attachments.length < _maxTransactionAttachmentCount;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          context.l10n.financeAttachmentHint(
            _maxTransactionAttachmentCount,
            _formatAttachmentSize(_maxTransactionAttachmentSizeBytes),
          ),
          style: theme.typography.textSmall.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
        const shad.Gap(12),
        shad.OutlineButton(
          onPressed: canAdd ? onPickAttachments : null,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.upload_file_rounded, size: 18),
              const shad.Gap(8),
              Flexible(
                child: Text(
                  context.l10n.financeAddAttachments,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
        const shad.Gap(10),
        if (attachments.isEmpty)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: theme.colorScheme.card,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: theme.colorScheme.border.withValues(alpha: 0.72),
              ),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.attach_file_rounded,
                  size: 18,
                  color: theme.colorScheme.mutedForeground,
                ),
                const shad.Gap(10),
                Expanded(
                  child: Text(
                    context.l10n.financeAttachmentEmpty,
                    style: theme.typography.textSmall.copyWith(
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ),
                ),
              ],
            ),
          )
        else ...[
          Text(
            context.l10n.financeAttachmentCount(attachments.length),
            style: theme.typography.xSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
              fontWeight: FontWeight.w700,
            ),
          ),
          const shad.Gap(8),
          ...attachments.map(
            (attachment) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _TransactionAttachmentTile(
                attachment: attachment,
                isSaving: isSaving,
                onRemove: () => onRemoveAttachment(attachment.id),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _TransactionAttachmentTile extends StatelessWidget {
  const _TransactionAttachmentTile({
    required this.attachment,
    required this.isSaving,
    required this.onRemove,
  });

  final _TransactionAttachmentDraft attachment;
  final bool isSaving;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final statusLabel = switch (attachment.status) {
      _TransactionAttachmentStatus.pending => _formatAttachmentSize(
        attachment.size,
      ),
      _TransactionAttachmentStatus.uploading =>
        context.l10n.financeAttachmentUploading,
      _TransactionAttachmentStatus.queued => context.l10n.offlineEditQueued,
      _TransactionAttachmentStatus.uploaded =>
        context.l10n.financeAttachmentUploaded,
      _TransactionAttachmentStatus.error =>
        context.l10n.financeAttachmentUploadFailed(1),
    };
    final statusColor = switch (attachment.status) {
      _TransactionAttachmentStatus.error => theme.colorScheme.destructive,
      _TransactionAttachmentStatus.uploaded => FinancePalette.of(
        context,
      ).positive,
      _TransactionAttachmentStatus.queued => theme.colorScheme.primary,
      _ => theme.colorScheme.mutedForeground,
    };

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.72),
        ),
      ),
      child: Row(
        children: [
          Icon(
            Icons.insert_drive_file_outlined,
            size: 20,
            color: theme.colorScheme.mutedForeground,
          ),
          const shad.Gap(10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  attachment.file.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const shad.Gap(3),
                Text(
                  statusLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.xSmall.copyWith(
                    color: statusColor,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const shad.Gap(8),
          shad.IconButton.ghost(
            density: shad.ButtonDensity.compact,
            onPressed:
                isSaving ||
                    attachment.status == _TransactionAttachmentStatus.uploading
                ? null
                : onRemove,
            icon: const Icon(Icons.close_rounded, size: 18),
          ),
        ],
      ),
    );
  }
}
