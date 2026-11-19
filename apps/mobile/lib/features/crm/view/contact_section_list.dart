import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/crm/utils/contact_sections.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_refresh_indicator.dart';

/// A Contacts section: title is owned by the shell, this is only the body.
class ContactSectionList extends StatelessWidget {
  const ContactSectionList({
    required this.records,
    required this.loading,
    required this.onRefresh,
    this.error,
    this.emptyMessage,
    this.onOpen,
    super.key,
  });

  final List<ContactSectionRecord> records;
  final bool loading;
  final String? error;
  final String? emptyMessage;
  final Future<void> Function() onRefresh;
  final void Function(ContactSectionRecord record)? onOpen;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (loading && records.isEmpty) {
      return AppPageListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Semantics(
            label: l10n.commonLoading,
            liveRegion: true,
            child: const AppSkeletonRows(count: 3),
          ),
        ],
      );
    }
    return NovaRefreshIndicator(
      onRefresh: onRefresh,
      child: AppPageListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (error != null && records.isEmpty)
            AppStateMessage(
              icon: LucideIcons.circleAlert,
              tone: AppTone.destructive,
              title: l10n.commonSomethingWentWrong,
              message: error,
              actionLabel: l10n.commonRetry,
              onAction: onRefresh,
            )
          else if (records.isEmpty)
            AppStateMessage(
              icon: LucideIcons.contact,
              title: l10n.contactsTitle,
              message: emptyMessage ?? l10n.contactsEmpty,
            )
          else
            for (var index = 0; index < records.length; index++)
              AppGroupedSlice(
                position: AppSlicePosition.of(index, records.length),
                child: AppRichRow(
                  title: records[index].title,
                  subtitle: records[index].subtitle,
                  trailing: records[index].trailing == null
                      ? null
                      : Text(records[index].trailing!),
                  onTap: onOpen == null ? null : () => onOpen!(records[index]),
                ),
              ),
        ],
      ),
    );
  }
}
