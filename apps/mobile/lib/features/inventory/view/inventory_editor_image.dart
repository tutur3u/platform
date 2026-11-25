part of 'inventory_product_editor_page.dart';

/// Content type the inventory media endpoint accepts for a picked file.
String? inventoryImageContentType(String path) {
  final extension = path.split('.').last.toLowerCase();
  return switch (extension) {
    'jpg' || 'jpeg' => 'image/jpeg',
    'png' => 'image/png',
    'webp' => 'image/webp',
    'gif' => 'image/gif',
    _ => null,
  };
}

extension _InventoryEditorImage on _InventoryProductEditorPageState {
  /// Uploads right away so the saved product, including an offline-queued
  /// save, only carries a server-issued image URL.
  Future<void> _pickImage() async {
    final l10n = context.l10n;
    final source = await showAppActionSheet<ImageSource?>(
      context: context,
      title: l10n.inventoryImageAdd,
      actions: [
        AppSheetAction(
          label: l10n.inventoryImageCamera,
          icon: LucideIcons.camera,
          value: ImageSource.camera,
        ),
        AppSheetAction(
          label: l10n.inventoryImageLibrary,
          icon: LucideIcons.images,
          value: ImageSource.gallery,
        ),
        if (_avatarUrl?.isNotEmpty ?? false)
          AppSheetAction(
            label: l10n.inventoryImageRemove,
            icon: LucideIcons.trash2,
            destructive: true,
            onPressed: () => _update(() {
              _avatarUrl = null;
              _avatarChanged = true;
            }),
          ),
      ],
    );
    if (!mounted || source == null) return;
    final picked = await ImagePicker().pickImage(
      source: source,
      maxWidth: 1600,
      maxHeight: 1600,
      imageQuality: 85,
    );
    final wsId = _wsId;
    if (!mounted || picked == null || wsId == null) return;
    final contentType =
        picked.mimeType ?? inventoryImageContentType(picked.path);
    final bytes = await picked.readAsBytes();
    if (!mounted) return;
    if (contentType == null ||
        !inventoryImageContentTypes.contains(contentType) ||
        bytes.length > inventoryImageMaxBytes) {
      showInventoryToast(context, l10n.inventoryImageUnsupported);
      return;
    }
    final scope = _scope;
    _update(() => _uploadingImage = true);
    try {
      final url = await _inventoryRepository.uploadProductImage(
        wsId: wsId,
        bytes: bytes,
        fileName: picked.name,
        contentType: contentType,
      );
      if (!mounted || _scope != scope) return;
      _update(() {
        _avatarUrl = url;
        _avatarChanged = true;
      });
    } on Object {
      if (mounted) {
        showInventoryToast(
          context,
          l10n.inventoryImageFailed,
          destructive: true,
        );
      }
    } finally {
      if (mounted) _update(() => _uploadingImage = false);
    }
  }

  Widget _buildImageField(BuildContext context) {
    final l10n = context.l10n;
    final url = _avatarUrl;
    final hasImage = url?.isNotEmpty ?? false;
    final preview = InventoryProduct(
      id: widget.productId ?? 'draft',
      categoryId: '',
      ownerId: '',
      wsId: _wsId ?? '',
      inventory: const [],
      avatarUrl: url,
    );
    return Row(
      children: [
        SizedBox.square(
          dimension: 72,
          child: _uploadingImage
              ? const Center(child: AppLoadingIndicator.inline())
              : hasImage
              ? ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: InventoryProductImage(
                    key: ValueKey(url),
                    product: preview,
                    size: 72,
                  ),
                )
              : const AppIconTile(icon: LucideIcons.imagePlus, size: 72),
        ),
        const AppGap(AppSpacing.md),
        Expanded(
          child: Align(
            alignment: AlignmentDirectional.centerStart,
            child: AppButton.outline(
              size: AppButtonSize.small,
              onPressed: _uploadingImage || _saving ? null : _pickImage,
              leading: const Icon(LucideIcons.camera, size: 16),
              child: Text(
                _uploadingImage
                    ? l10n.inventoryImageUploading
                    : hasImage
                    ? l10n.inventoryImageReplace
                    : l10n.inventoryImageAdd,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
