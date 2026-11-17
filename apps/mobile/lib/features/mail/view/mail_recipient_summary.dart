import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mail/view/mail_message_date.dart';
import 'package:mobile/features/mail/view/mail_reader_identity.dart';
import 'package:mobile/l10n/l10n.dart';

/// Compact "To" recipient and localized date shown under a message sender.
///
/// Each line keeps its own vertical clearance so the sender above and the
/// message details panel below never touch the recipient or the date.
class MailRecipientSummary extends StatelessWidget {
  const MailRecipientSummary({
    required this.address,
    required this.date,
    this.name,
    this.profile,
    super.key,
  });

  final String? address;
  final String? name;
  final Map<String, dynamic>? profile;
  final DateTime? date;

  /// Clearance between the sender row and the recipient row.
  static const double topGap = AppSpacing.sm;

  /// Clearance between the recipient row and the date.
  static const double lineGap = AppSpacing.sm;

  /// Clearance between the date and the following details panel.
  static const double bottomGap = AppSpacing.md;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = AppTokens.of(context).colorScheme.mutedForeground;
    final to = address;
    return Padding(
      padding: const EdgeInsets.only(top: topGap, bottom: bottomGap),
      child: Column(
        key: const ValueKey('mail-recipient-summary'),
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (to != null && to.isNotEmpty)
            Row(
              key: const ValueKey('mail-recipient-row'),
              children: [
                Text(
                  context.l10n.mailTo,
                  style: theme.textTheme.bodyMedium?.copyWith(color: muted),
                ),
                const SizedBox(width: AppSpacing.sm),
                Flexible(
                  child: MailReaderIdentity(
                    address: to,
                    name: name,
                    profile: profile,
                    compact: true,
                  ),
                ),
              ],
            ),
          if (date case final value?) ...[
            if (to != null && to.isNotEmpty) const SizedBox(height: lineGap),
            Text(
              formatMailMessageDate(context, value),
              key: const ValueKey('mail-recipient-date'),
              style: theme.textTheme.bodyMedium?.copyWith(color: muted),
            ),
          ],
        ],
      ),
    );
  }
}
