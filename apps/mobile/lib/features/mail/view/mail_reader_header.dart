import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mail/view/mail_message_date.dart';
import 'package:mobile/features/mail/view/mail_reader_identity.dart';
import 'package:mobile/features/mail/view/mail_recipient_summary.dart';

/// Where a message's date goes in the reader header.
///
/// The date sits right-aligned on the sender row while the sender keeps at
/// least [minSenderWidth] beside it. At narrow widths or with large text the
/// sender row and the recipient line both see the same width, so they agree
/// on moving the date to follow the To recipient instead.
abstract final class MailReaderDatePlacement {
  /// Room the sender avatar and a readable slice of the name keep.
  static const double minSenderWidth = 120;

  /// Gap between the sender and the date.
  static const double gap = AppSpacing.sm;

  static TextStyle? style(BuildContext context) => Theme.of(context)
      .textTheme
      .bodyMedium
      ?.copyWith(color: AppTokens.of(context).colorScheme.mutedForeground);

  /// Whether [date] fits on the sender row in [maxWidth].
  static bool onSenderRow(
    BuildContext context,
    double maxWidth,
    DateTime? date,
  ) {
    if (date == null) return false;
    if (!maxWidth.isFinite) return true;
    final painter = TextPainter(
      text: TextSpan(
        text: formatMailMessageDate(context, date),
        style: DefaultTextStyle.of(context).style.merge(style(context)),
      ),
      textDirection: Directionality.of(context),
      textScaler: MediaQuery.textScalerOf(context),
      maxLines: 1,
    )..layout();
    final dateWidth = painter.width;
    painter.dispose();
    return maxWidth - dateWidth - gap >= minSenderWidth;
  }
}

/// The sender identity with the message date right-aligned beside it.
class MailReaderSenderRow extends StatelessWidget {
  const MailReaderSenderRow({
    required this.address,
    this.name,
    this.profile,
    this.date,
    super.key,
  });

  final String address;
  final String? name;
  final Map<String, dynamic>? profile;
  final DateTime? date;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final date = this.date;
      final showDate = MailReaderDatePlacement.onSenderRow(
        context,
        constraints.maxWidth,
        date,
      );
      return Row(
        key: const ValueKey('mail-sender-row'),
        children: [
          Expanded(
            child: Align(
              alignment: AlignmentDirectional.centerStart,
              child: MailReaderIdentity(
                address: address,
                name: name,
                profile: profile,
              ),
            ),
          ),
          if (showDate && date != null) ...[
            const SizedBox(width: MailReaderDatePlacement.gap),
            Text(
              formatMailMessageDate(context, date),
              key: const ValueKey('mail-sender-date'),
              maxLines: 1,
              softWrap: false,
              style: MailReaderDatePlacement.style(context),
            ),
          ],
        ],
      );
    },
  );
}

/// The To recipient, followed by the date when the sender row has no room.
class MailReaderRecipientLine extends StatelessWidget {
  const MailReaderRecipientLine({
    required this.address,
    this.name,
    this.profile,
    this.date,
    super.key,
  });

  final String? address;
  final String? name;
  final Map<String, dynamic>? profile;
  final DateTime? date;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) => MailRecipientSummary(
      address: address,
      name: name,
      profile: profile,
      date:
          MailReaderDatePlacement.onSenderRow(
            context,
            constraints.maxWidth,
            date,
          )
          ? null
          : date,
    ),
  );
}
