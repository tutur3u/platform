part of 'task_board_detail_page.dart';

class _TaskDescriptionRichEditor extends StatefulWidget {
  const _TaskDescriptionRichEditor({
    required this.initialValue,
    required this.enabled,
    required this.hintText,
    required this.onChanged,
    this.onRequestImageUpload,
  });

  final String initialValue;
  final bool enabled;
  final String hintText;
  final ValueChanged<String> onChanged;
  final Future<String?> Function()? onRequestImageUpload;

  @override
  State<_TaskDescriptionRichEditor> createState() =>
      _TaskDescriptionRichEditorState();
}

class _TaskDescriptionRichEditorState
    extends State<_TaskDescriptionRichEditor> {
  QuillController? _controller;
  bool _isApplyingExternalState = false;

  QuillController get _resolvedController {
    final existing = _controller;
    if (existing != null) {
      return existing;
    }

    final created = QuillController(
      document: tipTapJsonToQuillDocument(widget.initialValue),
      selection: const TextSelection.collapsed(offset: 0),
      readOnly: !widget.enabled,
    )..addListener(_handleDocumentChange);
    _controller = created;
    return created;
  }

  @override
  void didUpdateWidget(covariant _TaskDescriptionRichEditor oldWidget) {
    super.didUpdateWidget(oldWidget);
    final controller = _resolvedController;

    if (oldWidget.initialValue != widget.initialValue) {
      _isApplyingExternalState = true;
      controller
        ..document = tipTapJsonToQuillDocument(widget.initialValue)
        ..updateSelection(
          const TextSelection.collapsed(offset: 0),
          ChangeSource.local,
        );
      _isApplyingExternalState = false;
    }

    if (oldWidget.enabled != widget.enabled) {
      controller.readOnly = !widget.enabled;
    }
  }

  @override
  void dispose() {
    final controller = _controller;
    if (controller != null) {
      controller
        ..removeListener(_handleDocumentChange)
        ..dispose();
    }
    super.dispose();
  }

  void _handleDocumentChange() {
    if (_isApplyingExternalState) {
      return;
    }

    final serialized = quillDocumentToTipTapJson(_resolvedController.document);
    widget.onChanged(serialized ?? '');
    if (mounted) {
      setState(() {});
    }
  }

  bool _isAttributeActive(String key, [dynamic value]) {
    final active = _resolvedController.getSelectionStyle().attributes[key];
    if (active == null) {
      return false;
    }
    if (value == null) {
      return true;
    }
    return active.value == value;
  }

  bool get _isTaskListActive {
    final value = _resolvedController
        .getSelectionStyle()
        .attributes['list']
        ?.value;
    return value == 'checked' || value == 'unchecked';
  }

  Future<void> _insertImage() async {
    if (!widget.enabled) {
      return;
    }

    final imageUploader = widget.onRequestImageUpload;
    if (imageUploader == null) {
      return;
    }

    final uploadedUrl = await imageUploader();
    if (!mounted || uploadedUrl == null || uploadedUrl.trim().isEmpty) {
      return;
    }

    final controller = _resolvedController;
    final baseOffset = controller.selection.baseOffset;
    final extentOffset = controller.selection.extentOffset;
    final start = math.min(baseOffset, extentOffset);
    final end = math.max(baseOffset, extentOffset);
    final replaceLength = math.max(0, end - start);

    // Insert as a Quill block embed so the image renders inline in the editor.
    controller.replaceText(
      start,
      replaceLength,
      BlockEmbed.image(uploadedUrl.trim()),
      TextSelection.collapsed(offset: start + 1),
    );
  }

  void _toggleAttributeValue(String key, dynamic value) {
    if (!widget.enabled) {
      return;
    }

    final style = _resolvedController.getSelectionStyle();
    final current = style.attributes[key]?.value;
    final next = current == value ? null : value;
    _resolvedController.formatSelection(Attribute.fromKeyValue(key, next));
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final controller = _resolvedController;

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        border: Border.all(color: theme.colorScheme.border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(11),
        child: Column(
          children: [
            _TaskDescriptionToolbar(
              enabled: widget.enabled,
              onBold: () => _toggleAttributeValue('bold', true),
              isBoldActive: _isAttributeActive('bold', true),
              onItalic: () => _toggleAttributeValue('italic', true),
              isItalicActive: _isAttributeActive('italic', true),
              onUnderline: () => _toggleAttributeValue('underline', true),
              isUnderlineActive: _isAttributeActive('underline', true),
              onStrike: () => _toggleAttributeValue('strike', true),
              isStrikeActive: _isAttributeActive('strike', true),
              onInlineCode: () => _toggleAttributeValue('code', true),
              isInlineCodeActive: _isAttributeActive('code', true),
              onSubscript: () => _toggleAttributeValue('script', 'sub'),
              isSubscriptActive: _isAttributeActive('script', 'sub'),
              onSuperscript: () => _toggleAttributeValue('script', 'super'),
              isSuperscriptActive: _isAttributeActive('script', 'super'),
              onHighlight: () => _toggleAttributeValue('background', '#FFF59D'),
              isHighlightActive: _isAttributeActive('background'),
              onHeading1: () => _toggleAttributeValue('header', 1),
              isHeading1Active: _isAttributeActive('header', 1),
              onHeading2: () => _toggleAttributeValue('header', 2),
              isHeading2Active: _isAttributeActive('header', 2),
              onHeading3: () => _toggleAttributeValue('header', 3),
              isHeading3Active: _isAttributeActive('header', 3),
              onBulletList: () => _toggleAttributeValue('list', 'bullet'),
              isBulletListActive: _isAttributeActive('list', 'bullet'),
              onOrderedList: () => _toggleAttributeValue('list', 'ordered'),
              isOrderedListActive: _isAttributeActive('list', 'ordered'),
              onTaskList: () => _toggleAttributeValue('list', 'checked'),
              isTaskListActive: _isTaskListActive,
              onQuote: () => _toggleAttributeValue('blockquote', true),
              isQuoteActive: _isAttributeActive('blockquote', true),
              onCodeBlock: () => _toggleAttributeValue('code-block', true),
              isCodeBlockActive: _isAttributeActive('code-block', true),
              onImage: _insertImage,
            ),
            Divider(height: 1, color: theme.colorScheme.border),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                child: QuillEditor.basic(
                  controller: controller,
                  config: QuillEditorConfig(
                    placeholder: widget.hintText,
                    embedBuilders: const [
                      _QuillImageEmbedBuilder(),
                      _QuillVideoEmbedBuilder(),
                      _QuillMentionEmbedBuilder(),
                      _QuillTableEmbedBuilder(),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TaskDescriptionToolbar extends StatelessWidget {
  const _TaskDescriptionToolbar({
    required this.enabled,
    required this.onBold,
    required this.isBoldActive,
    required this.onItalic,
    required this.isItalicActive,
    required this.onUnderline,
    required this.isUnderlineActive,
    required this.onStrike,
    required this.isStrikeActive,
    required this.onInlineCode,
    required this.isInlineCodeActive,
    required this.onSubscript,
    required this.isSubscriptActive,
    required this.onSuperscript,
    required this.isSuperscriptActive,
    required this.onHighlight,
    required this.isHighlightActive,
    required this.onHeading1,
    required this.isHeading1Active,
    required this.onHeading2,
    required this.isHeading2Active,
    required this.onHeading3,
    required this.isHeading3Active,
    required this.onBulletList,
    required this.isBulletListActive,
    required this.onOrderedList,
    required this.isOrderedListActive,
    required this.onTaskList,
    required this.isTaskListActive,
    required this.onQuote,
    required this.isQuoteActive,
    required this.onCodeBlock,
    required this.isCodeBlockActive,
    required this.onImage,
  });

  final bool enabled;
  final VoidCallback onBold;
  final bool isBoldActive;
  final VoidCallback onItalic;
  final bool isItalicActive;
  final VoidCallback onUnderline;
  final bool isUnderlineActive;
  final VoidCallback onStrike;
  final bool isStrikeActive;
  final VoidCallback onInlineCode;
  final bool isInlineCodeActive;
  final VoidCallback onSubscript;
  final bool isSubscriptActive;
  final VoidCallback onSuperscript;
  final bool isSuperscriptActive;
  final VoidCallback onHighlight;
  final bool isHighlightActive;
  final VoidCallback onHeading1;
  final bool isHeading1Active;
  final VoidCallback onHeading2;
  final bool isHeading2Active;
  final VoidCallback onHeading3;
  final bool isHeading3Active;
  final VoidCallback onBulletList;
  final bool isBulletListActive;
  final VoidCallback onOrderedList;
  final bool isOrderedListActive;
  final VoidCallback onTaskList;
  final bool isTaskListActive;
  final VoidCallback onQuote;
  final bool isQuoteActive;
  final VoidCallback onCodeBlock;
  final bool isCodeBlockActive;
  final Future<void> Function() onImage;

  static const double _btnSize = 34;
  static const double _iconSize = 16;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final l10n = context.l10n;

    return ColoredBox(
      color: theme.colorScheme.secondary.withValues(alpha: 0.25),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 5),
        child: Row(
          children: [
            _iconBtn(
              context,
              icon: shad.LucideIcons.bold,
              tooltip: l10n.taskBoardDetailTaskDescriptionToolbarBold,
              onPressed: enabled ? onBold : null,
              isActive: isBoldActive,
            ),
            _iconBtn(
              context,
              icon: shad.LucideIcons.italic,
              tooltip: l10n.taskBoardDetailTaskDescriptionToolbarItalic,
              onPressed: enabled ? onItalic : null,
              isActive: isItalicActive,
            ),
            _iconBtn(
              context,
              icon: shad.LucideIcons.underline,
              tooltip: l10n.taskBoardDetailTaskDescriptionToolbarUnderline,
              onPressed: enabled ? onUnderline : null,
              isActive: isUnderlineActive,
            ),
            _iconBtn(
              context,
              icon: shad.LucideIcons.strikethrough,
              tooltip: l10n.taskBoardDetailTaskDescriptionToolbarStrikethrough,
              onPressed: enabled ? onStrike : null,
              isActive: isStrikeActive,
            ),
            _iconBtn(
              context,
              icon: shad.LucideIcons.code,
              tooltip: l10n.taskBoardDetailTaskDescriptionToolbarInlineCode,
              onPressed: enabled ? onInlineCode : null,
              isActive: isInlineCodeActive,
            ),
            _iconBtn(
              context,
              icon: shad.LucideIcons.highlighter,
              tooltip: l10n.taskBoardDetailTaskDescriptionToolbarHighlight,
              onPressed: enabled ? onHighlight : null,
              isActive: isHighlightActive,
            ),
            _labelBtn(
              context,
              label: 'x2',
              tooltip: l10n.taskBoardDetailTaskDescriptionToolbarSubscript,
              onPressed: enabled ? onSubscript : null,
              isActive: isSubscriptActive,
            ),
            _labelBtn(
              context,
              label: 'x^2',
              tooltip: l10n.taskBoardDetailTaskDescriptionToolbarSuperscript,
              onPressed: enabled ? onSuperscript : null,
              isActive: isSuperscriptActive,
            ),
            _divider(context),
            _labelBtn(
              context,
              label: 'H1',
              tooltip: l10n.taskBoardDetailTaskDescriptionToolbarHeading1,
              onPressed: enabled ? onHeading1 : null,
              isActive: isHeading1Active,
            ),
            _labelBtn(
              context,
              label: 'H2',
              tooltip: l10n.taskBoardDetailTaskDescriptionToolbarHeading2,
              onPressed: enabled ? onHeading2 : null,
              isActive: isHeading2Active,
            ),
            _labelBtn(
              context,
              label: 'H3',
              tooltip: l10n.taskBoardDetailTaskDescriptionToolbarHeading3,
              onPressed: enabled ? onHeading3 : null,
              isActive: isHeading3Active,
            ),
            _divider(context),
            _iconBtn(
              context,
              icon: shad.LucideIcons.list,
              tooltip: l10n.taskBoardDetailTaskDescriptionToolbarBulletList,
              onPressed: enabled ? onBulletList : null,
              isActive: isBulletListActive,
            ),
            _iconBtn(
              context,
              icon: shad.LucideIcons.listOrdered,
              tooltip: l10n.taskBoardDetailTaskDescriptionToolbarOrderedList,
              onPressed: enabled ? onOrderedList : null,
              isActive: isOrderedListActive,
            ),
            _iconBtn(
              context,
              icon: shad.LucideIcons.listTodo,
              tooltip: l10n.taskBoardDetailTaskDescriptionToolbarTaskList,
              onPressed: enabled ? onTaskList : null,
              isActive: isTaskListActive,
            ),
            _iconBtn(
              context,
              icon: shad.LucideIcons.quote,
              tooltip: l10n.taskBoardDetailTaskDescriptionToolbarBlockquote,
              onPressed: enabled ? onQuote : null,
              isActive: isQuoteActive,
            ),
            _iconBtn(
              context,
              icon: shad.LucideIcons.fileCode,
              tooltip: l10n.taskBoardDetailTaskDescriptionToolbarCodeBlock,
              onPressed: enabled ? onCodeBlock : null,
              isActive: isCodeBlockActive,
            ),
            _divider(context),
            _iconBtn(
              context,
              icon: shad.LucideIcons.image,
              tooltip: l10n.taskBoardDetailTaskDescriptionToolbarInsertImage,
              onPressed: enabled ? () => unawaited(onImage()) : null,
            ),
          ],
        ),
      ),
    );
  }

  Widget _iconBtn(
    BuildContext context, {
    required IconData icon,
    required String tooltip,
    required VoidCallback? onPressed,
    bool isActive = false,
  }) {
    final theme = shad.Theme.of(context);
    final color = onPressed == null
        ? theme.colorScheme.mutedForeground.withValues(alpha: 0.45)
        : isActive
        ? theme.colorScheme.primary
        : theme.colorScheme.foreground;

    return Tooltip(
      message: tooltip,
      child: _ToolbarButton(
        size: _btnSize,
        onPressed: onPressed,
        isActive: isActive,
        child: Icon(icon, size: _iconSize, color: color),
      ),
    );
  }

  Widget _labelBtn(
    BuildContext context, {
    required String label,
    required String tooltip,
    required VoidCallback? onPressed,
    bool isActive = false,
  }) {
    final theme = shad.Theme.of(context);
    final color = onPressed == null
        ? theme.colorScheme.mutedForeground.withValues(alpha: 0.45)
        : isActive
        ? theme.colorScheme.primary
        : theme.colorScheme.foreground;

    return Tooltip(
      message: tooltip,
      child: _ToolbarButton(
        size: _btnSize,
        onPressed: onPressed,
        isActive: isActive,
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: color,
            letterSpacing: -0.4,
            height: 1,
          ),
        ),
      ),
    );
  }

  Widget _divider(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Container(
      width: 1,
      height: 20,
      margin: const EdgeInsets.symmetric(horizontal: 4),
      color: theme.colorScheme.border,
    );
  }
}

class _ToolbarButton extends StatelessWidget {
  const _ToolbarButton({
    required this.size,
    required this.onPressed,
    required this.isActive,
    required this.child,
  });

  final double size;
  final VoidCallback? onPressed;
  final bool isActive;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final isDisabled = onPressed == null;
    final activeBackground = theme.colorScheme.primary.withValues(alpha: 0.14);
    final activeBorder = theme.colorScheme.primary.withValues(alpha: 0.45);

    return SizedBox(
      width: size,
      height: size,
      child: Material(
        color: isActive && !isDisabled ? activeBackground : Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(7),
          side: BorderSide(
            color: isActive && !isDisabled ? activeBorder : Colors.transparent,
          ),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(7),
          onTap: isDisabled ? null : onPressed,
          hoverColor: theme.colorScheme.accent.withValues(alpha: 0.15),
          splashColor: theme.colorScheme.accent.withValues(alpha: 0.2),
          highlightColor: theme.colorScheme.accent.withValues(alpha: 0.12),
          child: Center(child: child),
        ),
      ),
    );
  }
}

// ── Quill embed builders ───────────────────────────────────────────────────

/// Renders image embeds inside the Quill editor, matching the view-mode
/// image style used by [_TaskBoardDescriptionAccordion].
class _QuillImageEmbedBuilder extends EmbedBuilder {
  const _QuillImageEmbedBuilder();

  @override
  String get key => BlockEmbed.imageType;

  @override
  Widget build(BuildContext context, EmbedContext embedContext) {
    final src = embedContext.node.value.data as String? ?? '';
    if (src.trim().isEmpty) {
      return const SizedBox.shrink();
    }

    final resolved = _resolveTaskDescriptionUrl(src);
    final headers = _trustedAuthHeadersForUrl(resolved);
    final theme = shad.Theme.of(context);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 300),
          child: Image.network(
            resolved,
            fit: BoxFit.cover,
            headers: headers,
            errorBuilder: (context2, e, _) => _buildEmbedFallback(
              context,
              theme: theme,
              icon: Icons.broken_image_outlined,
              label: 'Image',
            ),
            loadingBuilder: (context, child, progress) {
              if (progress == null) return child;
              return Container(
                height: 120,
                color: theme.colorScheme.secondary.withValues(alpha: 0.25),
                alignment: Alignment.center,
                child: const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

/// Renders video embeds inside the Quill editor as a compact visual
/// placeholder with the URL, since inline video playback requires a full
/// video player plugin.
class _QuillVideoEmbedBuilder extends EmbedBuilder {
  const _QuillVideoEmbedBuilder();

  @override
  String get key => BlockEmbed.videoType;

  @override
  Widget build(BuildContext context, EmbedContext embedContext) {
    final src = embedContext.node.value.data as String? ?? '';
    final theme = shad.Theme.of(context);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: _buildEmbedFallback(
        context,
        theme: theme,
        icon: Icons.play_circle_outline,
        label: src.trim().isEmpty ? 'Video' : src.trim(),
      ),
    );
  }
}

Widget _buildEmbedFallback(
  BuildContext context, {
  required shad.ThemeData theme,
  required IconData icon,
  required String label,
}) {
  return Container(
    height: 72,
    decoration: BoxDecoration(
      color: theme.colorScheme.secondary.withValues(alpha: 0.25),
      borderRadius: BorderRadius.circular(8),
      border: Border.all(
        color: theme.colorScheme.border.withValues(alpha: 0.6),
      ),
    ),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(icon, size: 20, color: theme.colorScheme.mutedForeground),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            label,
            style: theme.typography.small.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    ),
  );
}

// ── Mention embed builder ──────────────────────────────────────────────────

/// Renders mention embeds as the same green chip used by the view mode.
/// Because the embed sits inside a line with other text nodes it is rendered
/// inline via [EmbedBuilder.buildWidgetSpan].
class _QuillMentionEmbedBuilder extends EmbedBuilder {
  const _QuillMentionEmbedBuilder();

  @override
  String get key => 'mention';

  @override
  Widget build(BuildContext context, EmbedContext embedContext) {
    final data = embedContext.node.value.data as String? ?? '';
    if (data.isEmpty) {
      return const Text('@mention');
    }

    try {
      final attrs = jsonDecode(data);
      if (attrs is! Map<String, dynamic>) {
        return const Text('@mention');
      }
      final mention = _mentionFromAttrs(attrs);
      if (mention == null) {
        return const Text('@mention');
      }
      return _TaskDescriptionMentionChip(
        mention: mention,
        preferredStyle: embedContext.textStyle,
      );
    } on Object {
      return const Text('@mention');
    }
  }
}

TipTapMention? _mentionFromAttrs(Map<String, dynamic> attrs) {
  String? str(String key) {
    final v = attrs[key];
    return v is String && v.trim().isNotEmpty ? v.trim() : null;
  }

  List<String>? strList(String key) {
    final v = attrs[key];
    if (v is! List) return null;
    final list = v
        .whereType<String>()
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList(growable: false);
    return list.isEmpty ? null : list;
  }

  final displayName =
      str('displayName') ??
      str('label') ??
      str('name') ??
      str('entityId') ??
      str('userId') ??
      str('id');

  if (displayName == null) return null;

  return TipTapMention(
    displayName: displayName,
    userId: str('userId'),
    entityId: str('entityId'),
    entityType: str('entityType'),
    avatarUrl: str('avatarUrl'),
    subtitle: str('subtitle'),
    priority: str('priority'),
    listColor: str('listColor'),
    assignees: strList('assignees'),
  );
}

// ── Table embed builder ────────────────────────────────────────────────────

/// Renders table embeds as a native Flutter [Table] widget, matching the
/// table styling used by the view-mode [MarkdownBody].
class _QuillTableEmbedBuilder extends EmbedBuilder {
  const _QuillTableEmbedBuilder();

  @override
  String get key => 'table';

  @override
  Widget build(BuildContext context, EmbedContext embedContext) {
    final data = embedContext.node.value.data as String? ?? '';
    if (data.isEmpty) return const SizedBox.shrink();

    try {
      final tableNode = jsonDecode(data);
      if (tableNode is! Map<String, dynamic>) return const SizedBox.shrink();
      return _buildTable(context, tableNode);
    } on Object {
      return const SizedBox.shrink();
    }
  }

  Widget _buildTable(
    BuildContext context,
    Map<String, dynamic> tableNode,
  ) {
    final rows = (tableNode['content'] as List?)?.cast<Object?>() ?? const [];
    final theme = shad.Theme.of(context);

    final tableRows = <TableRow>[];
    var isFirstRow = true;

    for (final rowRaw in rows) {
      if (rowRaw is! Map<String, dynamic> || rowRaw['type'] != 'tableRow') {
        continue;
      }

      final cells = (rowRaw['content'] as List?)?.cast<Object?>() ?? const [];
      final isHeader = isFirstRow;
      final cellWidgets = <Widget>[];

      for (final cellRaw in cells) {
        final text = cellRaw is Map<String, dynamic>
            ? _extractText(cellRaw['content'])
            : '';
        cellWidgets.add(
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            child: Text(
              text,
              style: isHeader
                  ? theme.typography.small.copyWith(
                      fontWeight: FontWeight.w600,
                    )
                  : theme.typography.small,
            ),
          ),
        );
      }

      if (cellWidgets.isNotEmpty) {
        tableRows.add(
          TableRow(
            decoration: isHeader
                ? BoxDecoration(
                    color: theme.colorScheme.secondary.withValues(alpha: 0.35),
                  )
                : null,
            children: cellWidgets,
          ),
        );
      }
      isFirstRow = false;
    }

    if (tableRows.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Table(
        border: TableBorder.all(
          color: theme.colorScheme.border,
        ),
        defaultColumnWidth: const IntrinsicColumnWidth(),
        children: tableRows,
      ),
    );
  }

  /// Recursively extracts plain text from a TipTap content node list.
  String _extractText(Object? content) {
    if (content is! List) return '';
    final buffer = StringBuffer();
    for (final node in content) {
      if (node is! Map<String, dynamic>) continue;
      if (node['type'] == 'text') {
        buffer.write(node['text'] as String? ?? '');
      } else {
        buffer.write(_extractText(node['content']));
      }
    }
    return buffer.toString();
  }
}
