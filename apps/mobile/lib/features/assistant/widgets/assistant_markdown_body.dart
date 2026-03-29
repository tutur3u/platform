import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:markdown/markdown.dart' as md;
import 'package:mobile/features/assistant/widgets/assistant_mermaid_diagram.dart';
import 'package:url_launcher/url_launcher.dart';

class AssistantMarkdownBody extends StatelessWidget {
  const AssistantMarkdownBody({
    required this.data,
    this.subdued = false,
    super.key,
  });

  final String data;
  final bool subdued;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return MarkdownBody(
      data: data,
      selectable: true,
      blockSyntaxes: const [_MermaidFenceSyntax()],
      builders: {
        'mermaid-diagram': _MermaidDiagramBuilder(subdued: subdued),
      },
      onTapLink: (text, href, title) {
        if (href == null || href.trim().isEmpty) {
          return;
        }
        unawaited(_openMarkdownLink(href));
      },
      styleSheet: assistantMarkdownStyle(theme, subdued: subdued),
    );
  }
}

MarkdownStyleSheet assistantMarkdownStyle(
  ThemeData theme, {
  required bool subdued,
}) {
  final textTheme = theme.textTheme;
  final bodyColor = subdued
      ? theme.colorScheme.onSurfaceVariant
      : theme.colorScheme.onSurface;
  final baseTextStyle = textTheme.bodyMedium?.copyWith(
    color: bodyColor,
    height: 1.45,
  );

  return MarkdownStyleSheet.fromTheme(theme).copyWith(
    p: baseTextStyle,
    a: baseTextStyle?.copyWith(
      color: theme.colorScheme.primary,
      decoration: TextDecoration.underline,
    ),
    h1: textTheme.titleLarge?.copyWith(
      color: bodyColor,
      fontWeight: FontWeight.w700,
    ),
    h2: textTheme.titleMedium?.copyWith(
      color: bodyColor,
      fontWeight: FontWeight.w700,
    ),
    h3: textTheme.titleSmall?.copyWith(
      color: bodyColor,
      fontWeight: FontWeight.w600,
    ),
    h4: textTheme.titleSmall?.copyWith(
      color: bodyColor,
      fontWeight: FontWeight.w600,
    ),
    h5: textTheme.bodyLarge?.copyWith(
      color: bodyColor,
      fontWeight: FontWeight.w600,
    ),
    h6: textTheme.bodyMedium?.copyWith(
      color: bodyColor,
      fontWeight: FontWeight.w600,
    ),
    strong: baseTextStyle?.copyWith(fontWeight: FontWeight.w700),
    em: baseTextStyle?.copyWith(fontStyle: FontStyle.italic),
    del: baseTextStyle,
    blockquote: textTheme.bodyMedium?.copyWith(
      color: theme.colorScheme.onSurfaceVariant,
      height: 1.45,
      fontStyle: FontStyle.italic,
    ),
    blockquotePadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    blockquoteDecoration: BoxDecoration(
      color: theme.colorScheme.surface.withValues(alpha: 0.4),
      borderRadius: BorderRadius.circular(10),
      border: Border.all(
        color: theme.colorScheme.outlineVariant.withValues(alpha: 0.7),
      ),
    ),
    listBullet: baseTextStyle,
    code: textTheme.bodySmall?.copyWith(
      color: bodyColor,
      fontFamily: 'monospace',
      backgroundColor: theme.colorScheme.surface.withValues(alpha: 0.45),
    ),
    codeblockPadding: const EdgeInsets.all(10),
    codeblockDecoration: BoxDecoration(
      color: theme.colorScheme.surface.withValues(alpha: 0.45),
      borderRadius: BorderRadius.circular(10),
      border: Border.all(
        color: theme.colorScheme.outlineVariant.withValues(alpha: 0.7),
      ),
    ),
    tableBorder: TableBorder.all(color: theme.colorScheme.outlineVariant),
    tableHead: textTheme.bodySmall?.copyWith(
      color: bodyColor,
      fontWeight: FontWeight.w700,
    ),
    tableBody: textTheme.bodySmall?.copyWith(color: bodyColor),
    tableCellsPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
    horizontalRuleDecoration: BoxDecoration(
      border: Border(
        top: BorderSide(
          color: theme.colorScheme.outlineVariant.withValues(alpha: 0.8),
        ),
      ),
    ),
  );
}

class _MermaidFenceSyntax extends md.BlockSyntax {
  const _MermaidFenceSyntax();

  static final RegExp _openingPattern = RegExp(
    r'^ {0,3}(?<fence>`{3,}|~{3,})mermaid(?:\s+.*)?\s*$',
  );

  @override
  RegExp get pattern => _openingPattern;

  @override
  md.Node parse(md.BlockParser parser) {
    final openingMatch = _openingPattern.firstMatch(parser.current.content)!;
    final fence = openingMatch.namedGroup('fence')!;
    final closingPattern = RegExp('^ {0,3}${RegExp.escape(fence)}\\s*\$');
    final lines = <String>[];

    parser.advance();
    while (!parser.isDone) {
      final currentLine = parser.current.content;
      if (closingPattern.hasMatch(currentLine)) {
        parser.advance();
        break;
      }

      lines.add(currentLine);
      parser.advance();
    }

    final diagram = lines.join('\n').trimRight();
    return md.Element('mermaid-diagram', [md.Text(diagram)]);
  }
}

class _MermaidDiagramBuilder extends MarkdownElementBuilder {
  _MermaidDiagramBuilder({required this.subdued});

  final bool subdued;

  @override
  bool isBlockElement() => true;

  @override
  Widget? visitElementAfterWithContext(
    BuildContext context,
    md.Element element,
    TextStyle? preferredStyle,
    TextStyle? parentStyle,
  ) {
    final definition = element.textContent.trim();
    if (definition.isEmpty) {
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: AssistantMermaidDiagramCard(
        definition: definition,
        subdued: subdued,
      ),
    );
  }
}

Future<void> _openMarkdownLink(String href) async {
  final uri = Uri.tryParse(href.trim());
  if (uri == null) {
    return;
  }

  await launchUrl(uri, mode: LaunchMode.externalApplication);
}
