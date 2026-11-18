import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mail/view/mail_message_date.dart';
import 'package:mobile/features/mail/view/mail_reader_identity.dart';
import 'package:mobile/l10n/l10n.dart';

/// Compact "To" recipient under a message sender, followed by the localized
/// date when the sender row has no room for it.
///
/// The date sits on the To line when both fit, and wraps below it with
/// [lineGap] of clearance otherwise. The sender above and the message
/// details panel below never touch the recipient or the date.
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

  /// Clearance between the recipient row and a date wrapped below it.
  static const double lineGap = AppSpacing.sm;

  /// Gap between the recipient and a date on the same line.
  static const double dateGap = AppSpacing.md;

  /// Clearance between the summary and the following details panel.
  static const double bottomGap = AppSpacing.md;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = AppTokens.of(context).colorScheme.mutedForeground;
    final to = address;
    return Padding(
      padding: const EdgeInsets.only(top: topGap, bottom: bottomGap),
      child: Wrap(
        key: const ValueKey('mail-recipient-summary'),
        spacing: dateGap,
        runSpacing: lineGap,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          if (to != null && to.isNotEmpty)
            Row(
              key: const ValueKey('mail-recipient-row'),
              mainAxisSize: MainAxisSize.min,
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
          if (date case final value?)
            Text(
              formatMailMessageDate(context, value),
              key: const ValueKey('mail-recipient-date'),
              style: theme.textTheme.bodyMedium?.copyWith(color: muted),
            ),
        ],
      ),
    );
  }
}
