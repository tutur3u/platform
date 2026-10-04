part of 'inventory_manage_page.dart';

class _CreateManageItemDialog extends StatefulWidget {
  const _CreateManageItemDialog({
    required this.title,
    required this.confirmLabel,
    required this.onConfirm,
    this.initialValue = '',
  });

  final String title;
  final String confirmLabel;
  final Future<void> Function(String value) onConfirm;
  final String initialValue;

  @override
  State<_CreateManageItemDialog> createState() =>
      _CreateManageItemDialogState();
}

class _CreateManageItemDialogState extends State<_CreateManageItemDialog> {
  late final TextEditingController _controller;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialValue);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AppDialogScaffold(
      title: widget.title,
      icon: Icons.add_circle_outline_rounded,
      maxWidth: 420,
      maxHeightFactor: 0.5,
      actions: [
        shad.OutlineButton(
          onPressed: _saving ? null : () => Navigator.of(context).pop(false),
          child: Text(context.l10n.commonCancel),
        ),
        shad.PrimaryButton(
          onPressed: _saving ? null : _handleConfirm,
          child: _saving
              ? const SizedBox.square(
                  dimension: 16,
                  child: NovaLoadingIndicator(size: 20),
                )
              : Text(widget.confirmLabel),
        ),
      ],
      child: TextField(
        controller: _controller,
        autofocus: true,
        onSubmitted: (_) => unawaited(_handleConfirm()),
      ),
    );
  }

  Future<void> _handleConfirm() async {
    if (_saving) return;
    final value = _controller.text.trim();
    if (value.isEmpty) {
      showInventoryToast(
        context,
        context.l10n.inventoryManageNameRequired,
        destructive: true,
      );
      return;
    }

    setState(() => _saving = true);
    try {
      await widget.onConfirm(value);
      if (!mounted) {
        return;
      }
      Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (!mounted) return;
      showInventoryToast(
        context,
        error.message.trim().isEmpty
            ? context.l10n.commonSomethingWentWrong
            : error.message,
        destructive: true,
      );
    } on Exception catch (error) {
      if (!mounted) {
        return;
      }
      showInventoryToast(context, error.toString(), destructive: true);
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }
}

class _ChipWrap extends StatelessWidget {
  const _ChipWrap({
    required this.workspaceId,
    required this.items,
    this.feature = 'inventory',
    this.onEdit,
    this.onDelete,
  });

  final String workspaceId;
  final List<(String, String)> items;
  final String feature;
  final Future<void> Function(String id, String name)? onEdit;
  final Future<void> Function(String id, String name)? onDelete;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return Text(context.l10n.inventoryManageEmpty);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: items
          .map(
            (item) => PendingSyncFrame(
              workspaceId: workspaceId,
              entityId: item.$1,
              feature: feature,
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      item.$2,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (onEdit != null)
                    IconButton(
                      tooltip: context.l10n.commonEdit,
                      onPressed: () => unawaited(onEdit!(item.$1, item.$2)),
                      icon: const Icon(Icons.edit_outlined, size: 18),
                    ),
                  if (onDelete != null)
                    IconButton(
                      tooltip: context.l10n.commonDelete,
                      onPressed: () => unawaited(onDelete!(item.$1, item.$2)),
                      icon: const Icon(Icons.delete_outline_rounded, size: 18),
                    ),
                ],
              ),
            ),
          )
          .toList(growable: false),
    );
  }
}
