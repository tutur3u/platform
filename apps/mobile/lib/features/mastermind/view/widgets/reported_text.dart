import 'package:flutter/material.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/presentation/hub_field.dart';
import 'package:mobile/l10n/l10n.dart';

/// A hub reading, or a muted em dash when there is none.
///
/// A missing, blank or literal "unknown" value is never shown as a word: it
/// renders `—` and reads "Not reported" to screen readers, followed by the
/// hub's own reason (for example "Not connected · Last checked 14:18") when
/// [field] carries a Forge v1 envelope that is not `ok`.
class ReportedText extends StatelessWidget {
  const ReportedText(
    this.value, {
    this.field,
    this.style,
    this.textAlign,
    this.maxLines,
    this.overflow,
    super.key,
  });

  /// The em dash shown in place of a missing reading.
  static const placeholder = '—';

  final String? value;
  final HubField? field;
  final TextStyle? style;
  final TextAlign? textAlign;
  final int? maxLines;
  final TextOverflow? overflow;

  /// The semantics label for a missing reading, with the hub's reason.
  static String notReportedLabel(AppLocalizations l10n, HubField? field) => [
    l10n.mastermindNotReported,
    if (field != null && field.status != 'ok') field.reason(l10n),
  ].join('. ');

  @override
  Widget build(BuildContext context) {
    if (HubField.isReported(value)) {
      return Text(
        value!.trim(),
        style: style,
        textAlign: textAlign,
        maxLines: maxLines,
        overflow: overflow,
      );
    }
    final muted = AppTokens.of(context).colorScheme.mutedForeground;
    return Semantics(
      label: notReportedLabel(context.l10n, field),
      excludeSemantics: true,
      child: Text(
        placeholder,
        style: (style ?? DefaultTextStyle.of(context).style).copyWith(
          color: muted,
        ),
        textAlign: textAlign,
      ),
    );
  }
}
