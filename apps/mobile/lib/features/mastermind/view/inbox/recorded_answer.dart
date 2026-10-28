import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';

class RecordedAnswer extends StatefulWidget {
  const RecordedAnswer({required this.answer, super.key});
  final String answer;
  @override
  State<RecordedAnswer> createState() => _RecordedAnswerState();
}

class _RecordedAnswerState extends State<RecordedAnswer> {
  bool expanded = false;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        context.l10n.mastermindResolvedAnswer(widget.answer),
        maxLines: expanded ? null : 4,
        overflow: expanded ? null : TextOverflow.ellipsis,
      ),
      if (widget.answer.length > 200)
        TextButton(
          style: TextButton.styleFrom(minimumSize: const Size(44, 44)),
          onPressed: () => setState(() => expanded = !expanded),
          child: Text(
            expanded
                ? context.l10n.mastermindAnswerCollapse
                : context.l10n.mastermindAnswerExpand,
          ),
        ),
    ],
  );
}
