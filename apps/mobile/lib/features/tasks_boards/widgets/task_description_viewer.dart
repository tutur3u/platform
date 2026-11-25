import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/theme/dynamic_colors.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/tasks_boards/utils/task_description_render_cache.dart';
import 'package:mobile/features/tasks_boards/utils/tiptap_quill_colors.dart';
import 'package:mobile/features/tasks_boards/widgets/task_description_embed_builders.dart';

/// Payloads longer than this convert after the first frame when they are
/// not cached yet, so a sheet or screen opens without waiting on them.
const int _deferredConversionLength = 1500;

/// A read-only viewer for task descriptions that uses the same Quill renderer
/// as the editor for full feature parity.
///
/// Supports headings 1-6, lists, task lists, toggle blocks (open), tables,
/// mentions, images, videos, code blocks, blockquotes, horizontal rules,
/// links, text colours and all inline formatting.
///
/// Conversions are cached per payload. A long, uncached payload converts
/// after the first frame and shows a placeholder until then.
class TaskDescriptionViewer extends StatefulWidget {
  const TaskDescriptionViewer({required this.descriptionJson, super.key});

  /// The TipTap JSON description string.
  final String descriptionJson;

  @override
  State<TaskDescriptionViewer> createState() => _TaskDescriptionViewerState();
}

class _TaskDescriptionViewerState extends State<TaskDescriptionViewer> {
  QuillController? _controller;

  /// Bumps on every payload change so a deferred conversion for an older
  /// payload never lands.
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant TaskDescriptionViewer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.descriptionJson != widget.descriptionJson) _load();
  }

  void _load() {
    final generation = ++_generation;
    final payload = widget.descriptionJson;
    if (payload.length <= _deferredConversionLength ||
        hasTaskDescriptionViewerDelta(payload)) {
      _show(payload);
      return;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || generation != _generation) return;
      setState(() => _show(payload));
    });
  }

  void _show(String payload) {
    final document = Document.fromDelta(taskDescriptionViewerDelta(payload));
    final controller = _controller;
    if (controller == null) {
      _controller = QuillController(
        document: document,
        selection: const TextSelection.collapsed(offset: 0),
        readOnly: true,
      );
    } else {
      controller.document = document;
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  void _openLink(String url) {
    final uri = Uri.tryParse(url.trim());
    if (uri == null) return;
    unawaited(openMobileLink(context, uri));
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (controller == null) return const _TaskDescriptionPlaceholder();

    return QuillEditor.basic(
      controller: controller,
      config: QuillEditorConfig(
        customStyles: taskDescriptionStyles(context),
        onLaunchUrl: _openLink,
        embedBuilders: const [
          TaskDescriptionImageEmbedBuilder(),
          TaskDescriptionVideoEmbedBuilder(),
          TaskDescriptionMentionEmbedBuilder(),
          TaskDescriptionTableEmbedBuilder(),
          TaskDescriptionDividerEmbedBuilder(),
        ],
      ),
    );
  }
}

/// Quill styles from the app tokens, sized like the web description:
/// body text, a heading scale that steps down to body size at h6, tinted
/// code, ruled quotes and underlined links. The palette resolves the web's
/// swatch colours (`var(--red)`, `var(--calendar-bg-red)`) in the current
/// theme.
DefaultStyles taskDescriptionStyles(BuildContext context) {
  final tokens = AppTokens.of(context);
  final c = tokens.colorScheme;
  final body = tokens.typography.p.copyWith(
    color: c.foreground,
    height: 1.4,
    fontWeight: FontWeight.w400,
  );
  final mono = body.copyWith(
    fontFamily: 'monospace',
    fontSize: 14,
    height: 1.45,
  );

  DefaultTextBlockStyle block(
    TextStyle style, [
    VerticalSpacing spacing = const VerticalSpacing(0, AppSpacing.md),
    BoxDecoration? decoration,
    HorizontalSpacing horizontal = HorizontalSpacing.zero,
  ]) => DefaultTextBlockStyle(
    style,
    horizontal,
    spacing,
    VerticalSpacing.zero,
    decoration,
  );

  DefaultTextBlockStyle heading(double size, double top) => block(
    body.copyWith(fontSize: size, fontWeight: FontWeight.w700, height: 1.25),
    VerticalSpacing(top, AppSpacing.sm),
  );

  return DefaultStyles(
    palette: taskDescriptionThemePalette(context.dynamicColors),
    h1: heading(26, AppSpacing.lg),
    h2: heading(22, AppSpacing.lg),
    h3: heading(19, AppSpacing.md),
    h4: heading(17, AppSpacing.md),
    h5: heading(16, AppSpacing.sm),
    h6: heading(16, AppSpacing.sm),
    paragraph: block(body),
    lists: DefaultListBlockStyle(
      body,
      HorizontalSpacing.zero,
      const VerticalSpacing(0, AppSpacing.md),
      const VerticalSpacing(AppSpacing.xxs, AppSpacing.xxs),
      null,
      null,
    ),
    quote: block(
      body.copyWith(color: c.mutedForeground),
      const VerticalSpacing(AppSpacing.xs, AppSpacing.md),
      BoxDecoration(
        border: Border(left: BorderSide(color: c.border, width: 3)),
      ),
      const HorizontalSpacing(AppSpacing.md, 0),
    ),
    code: block(
      mono,
      const VerticalSpacing(AppSpacing.xs, AppSpacing.md),
      BoxDecoration(
        color: c.muted,
        borderRadius: BorderRadius.circular(AppRadius.sm),
      ),
    ),
    sizeSmall: body,
    sizeLarge: body,
    sizeHuge: body,
    link: body.copyWith(
      color: c.primary,
      decoration: TextDecoration.underline,
      decorationColor: c.primary,
    ),
    inlineCode: InlineCodeStyle(
      backgroundColor: c.muted,
      radius: const Radius.circular(AppSpacing.xs),
      style: mono.copyWith(fontSize: 14),
      header1: mono.copyWith(fontSize: 24),
      header2: mono.copyWith(fontSize: 20),
      header3: mono.copyWith(fontSize: 17),
    ),
  );
}

/// Muted lines in the description's place while a long payload converts.
class _TaskDescriptionPlaceholder extends StatelessWidget {
  const _TaskDescriptionPlaceholder();

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    Widget line(double widthFactor) => FractionallySizedBox(
      alignment: AlignmentDirectional.centerStart,
      widthFactor: widthFactor,
      child: Container(
        height: 14,
        margin: const EdgeInsets.only(bottom: AppSpacing.sm),
        decoration: BoxDecoration(
          color: c.muted,
          borderRadius: BorderRadius.circular(AppRadius.xs),
        ),
      ),
    );
    return ExcludeSemantics(
      child: Column(
        key: const ValueKey('task-description-placeholder'),
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [line(1), line(0.92), line(0.96), line(0.6)],
      ),
    );
  }
}
