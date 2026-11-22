import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:mobile/core/ui/ui.dart';

/// A decision's full description. Web keeps paragraphs, list markers,
/// **bold** and `code` and strips links, headings and paths, so this renders
/// only those: images show their alt text, links stay plain text, and no
/// HTML is interpreted.
class FleetMarkdownBody extends StatelessWidget {
  const FleetMarkdownBody({required this.data, super.key});

  final String data;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final body = tokens.typography.bodyLg.copyWith(color: colors.foreground);
    return MarkdownBody(
      data: data,
      selectable: true,
      softLineBreak: true,
      imageBuilder: (uri, title, alt) => Text(alt ?? '', style: body),
      styleSheet: MarkdownStyleSheet(
        p: body,
        strong: const TextStyle(fontWeight: FontWeight.w800),
        em: const TextStyle(fontStyle: FontStyle.italic),
        listBullet: body,
        a: body,
        code: tokens.typography.numeric.copyWith(
          color: colors.foreground,
          backgroundColor: colors.muted,
        ),
        pPadding: EdgeInsets.zero,
        blockSpacing: AppSpacing.md,
        listIndent: AppSpacing.xl,
        listBulletPadding: const EdgeInsets.only(right: AppSpacing.xs),
      ),
    );
  }
}
