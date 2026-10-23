import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/widgets/assistant_markdown_body.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantMessageText extends StatefulWidget {
  const AssistantMessageText({
    required this.data,
    required this.collapsible,
    super.key,
  });

  final String data;
  final bool collapsible;

  @override
  State<AssistantMessageText> createState() => _AssistantMessageTextState();
}

class _AssistantMessageTextState extends State<AssistantMessageText> {
  static const _collapsedLineCount = 4;

  var _expanded = false;

  @override
  void didUpdateWidget(covariant AssistantMessageText oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.data != widget.data) {
      _expanded = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.collapsible) {
      return AssistantMarkdownBody(data: widget.data, selectable: false);
    }

    final theme = Theme.of(context);
    final l10n = context.l10n;
    final markdownStyle = assistantMarkdownStyle(theme, subdued: false);
    final baseStyle =
        markdownStyle.p ??
        theme.textTheme.bodyMedium?.copyWith(height: 1.45) ??
        const TextStyle(fontSize: 14, height: 1.45);

    return LayoutBuilder(
      builder: (context, constraints) {
        final plainText = _markdownPlainText(widget.data);
        if (plainText.isEmpty) {
          return AssistantMarkdownBody(data: widget.data, selectable: false);
        }
        final painter = TextPainter(
          text: TextSpan(text: plainText, style: baseStyle),
          textDirection: Directionality.of(context),
          maxLines: _collapsedLineCount,
        )..layout(maxWidth: constraints.maxWidth);
        final shouldCollapse = painter.didExceedMaxLines;

        if (!shouldCollapse) {
          return AssistantMarkdownBody(data: widget.data, selectable: false);
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (_expanded)
              AssistantMarkdownBody(data: widget.data, selectable: false)
            else
              Text(
                plainText,
                maxLines: _collapsedLineCount,
                overflow: TextOverflow.fade,
                softWrap: true,
                style: baseStyle.copyWith(
                  color:
                      baseStyle.color ?? theme.colorScheme.onPrimaryContainer,
                ),
              ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () => setState(() => _expanded = !_expanded),
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.only(top: 8),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  visualDensity: VisualDensity.compact,
                ),
                child: Text(
                  _expanded
                      ? l10n.assistantSeeLessLabel
                      : l10n.assistantSeeMoreLabel,
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

String _markdownPlainText(String markdown) {
  return markdown
      .replaceAll(RegExp(r'```[\s\S]*?```'), ' ')
      .replaceAllMapped(RegExp('`([^`]*)`'), (match) => match.group(1) ?? '')
      .replaceAll(RegExp(r'!\[([^\]]*)\]\([^)]+\)'), r'$1')
      .replaceAll(RegExp(r'\[([^\]]+)\]\([^)]+\)'), r'$1')
      .replaceAll(RegExp(r'(^|\s)[#>*_~-]+', multiLine: true), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
}
