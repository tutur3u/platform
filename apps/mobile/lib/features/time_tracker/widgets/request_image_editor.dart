import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile/features/time_tracker/widgets/request_image_gallery.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/image_source_picker_dialog.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class RequestImageEditor extends StatefulWidget {
  const RequestImageEditor({
    required this.wsId,
    required this.requestId,
    required this.initialImages,
    required this.onChanged,
    this.maxImages = 5,
    super.key,
  });

  final String wsId;
  final String requestId;

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

class _RequestImageEditorState extends State<RequestImageEditor> {
  final ImagePicker _picker = ImagePicker();
  late List<String> _initialImages;
  late List<String> _existingImages;
  final List<XFile> _newImages = [];
  late Future<ResolvedRequestImageUrls> _existingUrlsFuture;

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
                FutureBuilder<ResolvedRequestImageUrls>(
                  future: _existingUrlsFuture,
                  builder: (context, snapshot) {
                    final resolved = snapshot.data;
                    final urls = resolved?.urls ?? const <String>[];
                    final originalIndices =
                        resolved?.originalIndices ?? const <int>[];
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
                                onRemove: () {
                                  final originalIndex =
                                      entry.key < originalIndices.length
                                      ? originalIndices[entry.key]
                                      : entry.key;
                                  _removeExistingAt(originalIndex);
                                },
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
    _existingUrlsFuture = resolveRequestImageUrlsWithIndices(
      wsId: widget.wsId,
      requestId: widget.requestId,
      imagePaths: _existingImages,
    );
    _emitState();
  }

  @override
  void didUpdateWidget(covariant RequestImageEditor oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.wsId != widget.wsId ||
        oldWidget.requestId != widget.requestId ||
        !_samePaths(oldWidget.initialImages, widget.initialImages)) {
      _initialImages = List<String>.from(widget.initialImages);
      _existingImages = List<String>.from(widget.initialImages);
      _newImages.clear();
      _existingUrlsFuture = resolveRequestImageUrlsWithIndices(
        wsId: widget.wsId,
        requestId: widget.requestId,
        imagePaths: _existingImages,
      );
      _emitState();
    }
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
    final source = await showImageSourcePickerDialog(
      context: context,
      title: l10n.selectImageSource,
      cameraLabel: l10n.camera,
      galleryLabel: l10n.gallery,
    );

    if (source == null || !mounted) {
      return;
    }

    if (source == ImageSource.camera) {
      final image = await _picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 85,
      );
      if (!mounted || image == null) {
        return;
      }
      _addNewImage(image);
      return;
    }

    final images = await _picker.pickMultiImage(imageQuality: 85);
    if (!mounted) {
      return;
    }
    for (final image in images) {
      if (_existingImages.length + _newImages.length >= widget.maxImages) {
        break;
      }
      _addNewImage(image);
    }
  }

  void _removeExistingAt(int index) {
    if (index < 0 || index >= _existingImages.length) {
      return;
    }

    setState(() {
      _existingImages.removeAt(index);
      _existingUrlsFuture = resolveRequestImageUrlsWithIndices(
        wsId: widget.wsId,
        requestId: widget.requestId,
        imagePaths: _existingImages,
      );
      _emitState();
    });
  }

  void _removeNewAt(int index) {
    setState(() {
      _newImages.removeAt(index);
      _emitState();
    });
  }

  bool _samePaths(List<String> oldPaths, List<String> newPaths) {
    if (identical(oldPaths, newPaths)) {
      return true;
    }
    if (oldPaths.length != newPaths.length) {
      return false;
    }

    for (var i = 0; i < oldPaths.length; i++) {
      if (oldPaths[i] != newPaths[i]) {
        return false;
      }
    }
    return true;
  }
}
