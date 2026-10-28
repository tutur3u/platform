import 'package:flutter/material.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';
import 'package:mobile/l10n/l10n.dart';

/// The recorded answer, clamped to four lines with "Show full answer" whenever
/// the text really overflows at the current width and text scale.
class RecordedAnswer extends StatefulWidget {
  const RecordedAnswer({required this.answer, super.key});
  final String answer;
  @override
  State<RecordedAnswer> createState() => _RecordedAnswerState();
}

class _RecordedAnswerState extends State<RecordedAnswer> {
  static const _maxLines = 4;
  bool expanded = false;

  bool _overflows(BuildContext context, String text, double width) {
    final painter = TextPainter(
      text: TextSpan(text: text, style: DefaultTextStyle.of(context).style),
      textDirection: Directionality.of(context),
      textScaler: MediaQuery.textScalerOf(context),
      maxLines: _maxLines,
    )..layout(maxWidth: width);
    final exceeded = painter.didExceedMaxLines;
    painter.dispose();
    return exceeded;
  }

  @override
  Widget build(BuildContext context) {
    final text = context.l10n.mastermindResolvedAnswer(widget.answer);
    return LayoutBuilder(
      builder: (context, constraints) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            text,
            maxLines: expanded ? null : _maxLines,
            overflow: expanded ? null : TextOverflow.ellipsis,
          ),
          if (_overflows(context, text, constraints.maxWidth))
            TextButton(
              style: TextButton.styleFrom(
                minimumSize: const Size(
                  AppInterfaceTokens.minTouchTarget,
                  AppInterfaceTokens.minTouchTarget,
                ),
              ),
              onPressed: () => setState(() => expanded = !expanded),
              child: Text(
                expanded
                    ? context.l10n.mastermindAnswerCollapse
                    : context.l10n.mastermindAnswerExpand,
              ),
            ),
        ],
      ),
    );
  }
}
