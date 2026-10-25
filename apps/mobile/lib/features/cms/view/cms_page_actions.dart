part of 'cms_page.dart';

extension _CmsPageActions on _CmsPageState {
  Future<void> _deleteEntry(CmsEntry entry) async {
    final wsId = _wsId;
    if (!mounted || _denied) return;
    final confirmed = await _confirm(
      title: context.l10n.cmsDeleteEntry,
      message: context.l10n.cmsDeleteEntryConfirm,
    );
    if (!mounted || !confirmed) return;

    try {
      await _repository.deleteEntry(wsId, entry.id);
      if (!mounted) return;
      _toast(context.l10n.cmsEntryDeleted);
      await _reload();
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<void> _deleteCollection(CmsCollection collection) async {
    final wsId = _wsId;
    if (!mounted || _denied) return;
    final confirmed = await _confirm(
      title: context.l10n.cmsDeleteCollection,
      message: context.l10n.cmsDeleteCollectionConfirm,
    );
    if (!mounted || !confirmed) return;

    try {
      await _repository.deleteCollection(wsId, collection.id);
      if (!mounted) return;
      _toast(context.l10n.cmsCollectionDeleted);
      await _reload();
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    }
  }

  Future<bool> _confirm({
    required String title,
    required String message,
  }) async {
    final confirmed = await _showOwnedDialog<bool>(
      context: context,
      builder: (context) => AppDialog(
        title: title,
        content: Text(message),
        actions: [
          AppButton.ghost(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(context.l10n.commonCancel),
          ),
          AppButton.destructive(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(context.l10n.commonDelete),
          ),
        ],
      ),
    );
    return confirmed ?? false;
  }

  void _toast(String message, {bool destructive = false}) {
    showAppToast(
      context,
      message: message,
      variant: destructive
          ? AppAlertVariant.destructive
          : AppAlertVariant.success,
    );
  }
}
