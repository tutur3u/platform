import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile/features/time_tracker/widgets/request_image_gallery.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class RequestImageEditor extends StatefulWidget {
  const RequestImageEditor({
    required this.initialImages,
    required this.onChanged,
    this.maxImages = 5,
    super.key,
  });

  final List<String> initialImages;
  final ValueChanged<RequestImageEditorResult> onChanged;
  final int maxImages;

  @override
  State<RequestImageEditor> createState() => _RequestImageEditorState();
}

class RequestImageEditorResult {
  const RequestImageEditorResult({
    required this.remainingExistingImages,
    required this.removedExistingImages,
    required this.newImages,
  });

  final List<String> remainingExistingImages;
  final List<String> removedExistingImages;
  final List<XFile> newImages;
}

class _EditableImageTile extends StatelessWidget {
  const _EditableImageTile({required this.image, required this.onRemove});

  final Widget image;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        SizedBox(
          width: 76,
          height: 76,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: image,
          ),
        ),
        Positioned(
          top: 2,
          right: 2,
          child: GestureDetector(
            onTap: onRemove,
            child: Container(
              padding: const EdgeInsets.all(2),
              decoration: const BoxDecoration(
                color: Colors.black54,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.close,
                color: Colors.white,
                size: 14,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

enum _ImageSourceSelection { camera, gallery }

class _RequestImageEditorState extends State<RequestImageEditor> {
  final ImagePicker _picker = ImagePicker();
  late final List<String> _initialImages;
  late List<String> _existingImages;
  final List<XFile> _newImages = [];
  late Future<List<String>> _existingUrlsFuture;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final canAddMore =
        _existingImages.length + _newImages.length < widget.maxImages;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                l10n.timerRequestProofImagesCount(
                  _existingImages.length + _newImages.length,
                  widget.maxImages,
                ),
                style: theme.typography.small,
              ),
            ),
            shad.OutlineButton(
              onPressed: canAddMore
                  ? () => unawaited(_pickImageSource())
                  : null,
              child: Text(l10n.timerRequestAddImage),
            ),
          ],
        ),
        const shad.Gap(8),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              if (_existingImages.isNotEmpty)
                FutureBuilder<List<String>>(
                  future: _existingUrlsFuture,
                  builder: (context, snapshot) {
                    final urls = snapshot.data ?? const <String>[];
                    if (urls.isEmpty) {
                      return const SizedBox.shrink();
                    }

                    return Row(
                      mainAxisSize: MainAxisSize.min,
                      children: urls
                          .asMap()
                          .entries
                          .map(
                            (entry) => Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: _EditableImageTile(
                                image: Image.network(
                                  entry.value,
                                  fit: BoxFit.cover,
                                ),
                                onRemove: () => _removeExistingAt(entry.key),
                              ),
                            ),
                          )
                          .toList(),
                    );
                  },
                ),
              if (_newImages.isNotEmpty)
                ..._newImages.asMap().entries.map(
                  (entry) => Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: _EditableImageTile(
                      image: Image.file(
                        File(entry.value.path),
                        fit: BoxFit.cover,
                      ),
                      onRemove: () => _removeNewAt(entry.key),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  @override
  void initState() {
    super.initState();
    _initialImages = List<String>.from(widget.initialImages);
    _existingImages = List<String>.from(widget.initialImages);
    _existingUrlsFuture = resolveRequestImageUrls(_existingImages);
    _emitState();
  }

  void _addNewImage(XFile image) {
    if (_existingImages.length + _newImages.length >= widget.maxImages) {
      return;
    }
    setState(() {
      _newImages.add(image);
      _emitState();
    });
  }

  void _emitState() {
    final removedExisting = _initialImages
        .where((image) => !_existingImages.contains(image))
        .toList();

    widget.onChanged(
      RequestImageEditorResult(
        remainingExistingImages: List<String>.from(_existingImages),
        removedExistingImages: removedExisting,
        newImages: List<XFile>.from(_newImages),
      ),
    );
  }

  Future<void> _pickImageSource() async {
    final l10n = context.l10n;
    final source = await shad.showDialog<_ImageSourceSelection>(
      context: context,
      builder: (dialogCtx) {
        return shad.AlertDialog(
          barrierColor: Colors.transparent,
          title: Text(l10n.selectImageSource),
          actions: [
            shad.OutlineButton(
              onPressed: () =>
                  Navigator.of(dialogCtx).pop(_ImageSourceSelection.camera),
              child: Text(l10n.camera),
            ),
            shad.PrimaryButton(
              onPressed: () =>
                  Navigator.of(dialogCtx).pop(_ImageSourceSelection.gallery),
              child: Text(l10n.gallery),
            ),
          ],
        );
      },
    );

    if (source == null) {
      return;
    }

    if (source == _ImageSourceSelection.camera) {
      final image = await _picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 85,
      );
      if (image != null) {
        _addNewImage(image);
      }
      return;
    }

    final images = await _picker.pickMultiImage(imageQuality: 85);
    for (final image in images) {
      if (_existingImages.length + _newImages.length >= widget.maxImages) {
        break;
      }
      _addNewImage(image);
    }
  }

  void _removeExistingAt(int index) {
    setState(() {
      _existingImages.removeAt(index);
      _existingUrlsFuture = resolveRequestImageUrls(_existingImages);
      _emitState();
    });
  }

  void _removeNewAt(int index) {
    setState(() {
      _newImages.removeAt(index);
      _emitState();
    });
  }
}
