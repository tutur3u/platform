import 'package:flutter/material.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/data/mail_settings_snapshot.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

class MailSettingsSelect extends StatelessWidget {
  const MailSettingsSelect({
    required this.title,
    required this.value,
    required this.choices,
    required this.onChanged,
    super.key,
  });
  final String title;
  final String value;
  final Map<String, String> choices;
  final ValueChanged<String>? onChanged;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(title, style: AppTokens.of(context).typography.small),
        const SizedBox(height: AppSpacing.xs),
        AppSelect<String>(
          title: title,
          value: value,
          options: [
            for (final entry in choices.entries)
              AppSelectOption(value: entry.key, label: entry.value),
          ],
          onChanged: onChanged,
        ),
      ],
    ),
  );
}

class MailSettingsPendingStatus extends StatelessWidget {
  const MailSettingsPendingStatus({
    required this.workspaceId,
    required this.mailboxId,
    super.key,
  });
  final String workspaceId;
  final String mailboxId;
  @override
  Widget build(BuildContext context) => ValueListenableBuilder(
    valueListenable: OfflineMutationQueue.instance.pending,
    builder: (context, pending, _) {
      final path =
          '${MailRepository.mailboxPath(workspaceId, mailboxId)}/settings';
      final edit = pending
          .where(
            (item) =>
                item.userId == currentCacheUserId() &&
                item.workspaceId == workspaceId &&
                item.feature == 'mail' &&
                item.method == 'PATCH' &&
                item.path == path,
          )
          .firstOrNull;
      if (edit == null) {
        return const SizedBox.shrink();
      }
      return PendingSyncFrame(
        workspaceId: workspaceId,
        entityId: edit.entityId ?? mailSettingsEntityId(mailboxId),
        feature: 'mail',
        child: const SizedBox.shrink(),
      );
    },
  );
}
