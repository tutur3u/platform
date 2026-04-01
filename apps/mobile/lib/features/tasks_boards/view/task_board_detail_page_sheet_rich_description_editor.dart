part of 'task_board_detail_page.dart';

class _TaskDescriptionRichEditor extends StatefulWidget {
  const _TaskDescriptionRichEditor({
    required this.initialValue,
    required this.enabled,
    required this.hintText,
    required this.onChanged,
    this.editorHeight = 220,
    this.onRequestImageUpload,
  });

  final String initialValue;
  final bool enabled;
  final String hintText;
  final double editorHeight;
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

    controller
      ..replaceText(
        start,
        replaceLength,
        BlockEmbed.image(uploadedUrl.trim()),
        TextSelection.collapsed(offset: start + 1),
      )
      ..replaceText(
        start + 1,
        0,
        '\n',
        TextSelection.collapsed(offset: start + 2),
      );
  }

  void _toggleAttribute(Attribute<dynamic> attribute) {
    if (!widget.enabled) {
      return;
    }
    _resolvedController.formatSelection(attribute);
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final controller = _resolvedController;

    return Container(
      width: double.infinity,
      constraints: const BoxConstraints(minHeight: 280),
      decoration: BoxDecoration(
        border: Border.all(color: theme.colorScheme.border),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _TaskDescriptionToolbar(
            enabled: widget.enabled,
            onBold: () => _toggleAttribute(Attribute.bold),
            onItalic: () => _toggleAttribute(Attribute.italic),
            onStrike: () => _toggleAttribute(Attribute.strikeThrough),
            onHeading1: () => _toggleAttribute(Attribute.h1),
            onHeading2: () => _toggleAttribute(Attribute.h2),
            onBulletList: () => _toggleAttribute(Attribute.ul),
            onOrderedList: () => _toggleAttribute(Attribute.ol),
            onQuote: () => _toggleAttribute(Attribute.blockQuote),
            onImage: _insertImage,
          ),
          const Divider(height: 1),
          SizedBox(
            height: widget.editorHeight,
            child: Padding(
              padding: const EdgeInsets.all(10),
              child: QuillEditor.basic(
                controller: controller,
                config: QuillEditorConfig(
                  placeholder: widget.hintText,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TaskDescriptionToolbar extends StatelessWidget {
  const _TaskDescriptionToolbar({
    required this.enabled,
    required this.onBold,
    required this.onItalic,
    required this.onStrike,
    required this.onHeading1,
    required this.onHeading2,
    required this.onBulletList,
    required this.onOrderedList,
    required this.onQuote,
    required this.onImage,
  });

  final bool enabled;
  final VoidCallback onBold;
  final VoidCallback onItalic;
  final VoidCallback onStrike;
  final VoidCallback onHeading1;
  final VoidCallback onHeading2;
  final VoidCallback onBulletList;
  final VoidCallback onOrderedList;
  final VoidCallback onQuote;
  final Future<void> Function() onImage;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 4,
      runSpacing: 4,
      children: [
        _toolbarButton(label: 'B', onPressed: enabled ? onBold : null),
        _toolbarButton(label: 'I', onPressed: enabled ? onItalic : null),
        _toolbarButton(label: 'S', onPressed: enabled ? onStrike : null),
        _toolbarButton(label: 'H1', onPressed: enabled ? onHeading1 : null),
        _toolbarButton(label: 'H2', onPressed: enabled ? onHeading2 : null),
        _toolbarButton(label: 'UL', onPressed: enabled ? onBulletList : null),
        _toolbarButton(
          label: 'OL',
          onPressed: enabled ? onOrderedList : null,
        ),
        _toolbarButton(label: '"', onPressed: enabled ? onQuote : null),
        _toolbarButton(
          label: 'IMG',
          onPressed: enabled ? () => unawaited(onImage()) : null,
        ),
      ],
    );
  }

  Widget _toolbarButton({
    required String label,
    required VoidCallback? onPressed,
  }) {
    return shad.PrimaryButton(
      density: shad.ButtonDensity.icon,
      onPressed: onPressed,
      child: Text(label),
    );
  }
}
