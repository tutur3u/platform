part of 'inventory_manage_page.dart';

extension _InventoryManageItemActions on _InventoryManagePageState {
  Future<void> _editSetupItem(
    InventorySetupKind kind,
    String id,
    String name,
  ) => _showCreateDialog(
    title: context.l10n.commonEdit,
    confirmLabel: context.l10n.commonSave,
    initialValue: name,
    onConfirm: (value) async {
      final wsId = _wsId;
      if (wsId == null) {
        return;
      }
      await _inventoryRepository.updateSetupItem(
        wsId: wsId,
        kind: kind,
        id: id,
        name: value,
      );
    },
  );

  Future<void> _deleteSetupItem(
    InventorySetupKind kind,
    String id,
    String name,
  ) async {
    final scope = _scope;
    final confirmed = await showAdaptiveSheet<bool>(
      context: context,
      maxDialogWidth: 420,
      builder: (sheetContext) => AppDialogScaffold(
        title: context.l10n.commonDelete,
        icon: Icons.delete_outline_rounded,
        maxWidth: 420,
        actions: [
          shad.OutlineButton(
            onPressed: () => Navigator.of(sheetContext).pop(false),
            child: Text(context.l10n.commonCancel),
          ),
          shad.DestructiveButton(
            onPressed: () => Navigator.of(sheetContext).pop(true),
            child: Text(context.l10n.commonDelete),
          ),
        ],
        child: Text(name),
      ),
    );
    if (confirmed != true || !mounted || _scope != scope || scope.$2 == null) {
      return;
    }
    try {
      await _inventoryRepository.deleteSetupItem(
        wsId: scope.$2!,
        kind: kind,
        id: id,
      );
      if (!mounted || _scope != scope) {
        return;
      }
      await _reload(forceRefresh: true);
      if (!mounted || _scope != scope) {
        return;
      }
      showInventoryToast(context, context.l10n.commonDeleted);
    } on Object catch (error) {
      if (!mounted || _scope != scope) {
        return;
      }
      showInventoryToast(context, error.toString(), destructive: true);
    }
  }
}
