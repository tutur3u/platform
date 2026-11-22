import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// One-tap inbox filters. Each maps to a search operator the Mail list API
/// already understands, so the filter needs no extra endpoint.
enum MailQuickFilter {
  all(null),
  unread('is:unread'),
  starred('is:starred'),
  attachments('has:attachment');

  const MailQuickFilter(this.operator);

  final String? operator;

  static MailQuickFilter parse(Object? name) => MailQuickFilter.values
      .firstWhere((value) => value.name == name, orElse: () => all);
}

/// The list query: the typed search plus the quick filter's operator.
String mailFilterQuery(String search, MailQuickFilter filter) => [
  search.trim(),
  ?filter.operator,
].where((part) => part.isNotEmpty).join(' ');

/// A horizontally scrolling row of filter chips above the inbox.
class MailQuickFilterBar extends StatelessWidget {
  const MailQuickFilterBar({
    required this.value,
    required this.onChanged,
    this.enabled = true,
    super.key,
  });

  final MailQuickFilter value;
  final ValueChanged<MailQuickFilter> onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    String label(MailQuickFilter filter) => switch (filter) {
      MailQuickFilter.all => l10n.commonAll,
      MailQuickFilter.unread => l10n.mailFilterUnread,
      MailQuickFilter.starred => l10n.mailStarred,
      MailQuickFilter.attachments => l10n.mailAttachments,
    };
    return Semantics(
      container: true,
      label: l10n.mailQuickFilter,
      child: AppHorizontalScrollView(
        child: Row(
          key: const ValueKey('mail-quick-filter'),
          children: [
            for (final filter in MailQuickFilter.values) ...[
              if (filter != MailQuickFilter.all)
                const SizedBox(width: AppSpacing.sm),
              AppChip(
                key: ValueKey('mail-quick-filter-${filter.name}'),
                selected: value == filter,
                inMutuallyExclusiveGroup: true,
                label: Text(label(filter)),
                onSelected: enabled
                    ? (_) {
                        if (value != filter) onChanged(filter);
                      }
                    : null,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
