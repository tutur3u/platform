import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

const _requestImageBucket = 'time_tracking_requests';
const _signedUrlExpirySeconds = 3600;

class RequestImageGallery extends StatefulWidget {
  const RequestImageGallery({required this.imagePaths, super.key});

  final List<String> imagePaths;

  @override
  State<RequestImageGallery> createState() => _RequestImageGalleryState();
}

class _RequestImageGalleryState extends State<RequestImageGallery> {
  late Future<List<String>> _signedUrlsFuture;

  @override
  void initState() {
    super.initState();
    _signedUrlsFuture = resolveRequestImageUrls(widget.imagePaths);
  }

  @override
  void didUpdateWidget(covariant RequestImageGallery oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_samePaths(oldWidget.imagePaths, widget.imagePaths)) {
      _signedUrlsFuture = resolveRequestImageUrls(widget.imagePaths);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return FutureBuilder<List<String>>(
      future: _signedUrlsFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: shad.LinearProgressIndicator(),
          );
        }

        final urls = snapshot.data ?? const <String>[];
        if (urls.isEmpty) {
          return const SizedBox.shrink();
        }

        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 3,
            crossAxisSpacing: 8,
            mainAxisSpacing: 8,
          ),
          itemCount: urls.length,
          itemBuilder: (context, index) {
            return _RequestImageThumbnail(
              imageUrls: urls,
              imageIndex: index,
              borderColor: theme.colorScheme.border,
            );
          },
        );
      },
    );
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

class ResolvedRequestImageUrls {
  const ResolvedRequestImageUrls({
    required this.urls,
    required this.originalIndices,
  });

  final List<String> urls;
  final List<int> originalIndices;
}

Future<List<String>> resolveRequestImageUrls(List<String> imagePaths) async {
  final resolved = await resolveRequestImageUrlsWithIndices(imagePaths);
  return resolved.urls;
}

Future<ResolvedRequestImageUrls> resolveRequestImageUrlsWithIndices(
  List<String> imagePaths,
) async {
  final normalizedPaths = <({int index, String path})>[];
  final localPaths = <String>[];
  for (var i = 0; i < imagePaths.length; i++) {
    final rawPath = imagePaths[i];
    final path = rawPath.trim();
    if (path.isEmpty) {
      continue;
    }

    normalizedPaths.add((index: i, path: path));

    if (path.startsWith('http://') || path.startsWith('https://')) {
      continue;
    }

    localPaths.add(path);
  }

  final signedUrlByPath = <String, String>{};
  if (localPaths.isNotEmpty) {
    try {
      final signedResponses = await supabase.storage
          .from(_requestImageBucket)
          .createSignedUrls(localPaths, _signedUrlExpirySeconds);
      for (final response in signedResponses) {
        final path = response.path;
        final signedUrl = response.signedUrl;
        if (path.isNotEmpty && signedUrl.isNotEmpty) {
          signedUrlByPath[path] = signedUrl;
        }
      }
    } on Exception {
      // Ignore invalid image paths.
    }
  }

  final resolvedUrls = <String>[];
  final originalIndices = <int>[];
  for (final entry in normalizedPaths) {
    final path = entry.path;
    if (path.startsWith('http://') || path.startsWith('https://')) {
      resolvedUrls.add(path);
      originalIndices.add(entry.index);
      continue;
    }

    final signedUrl = signedUrlByPath[path];
    if (signedUrl != null && signedUrl.isNotEmpty) {
      resolvedUrls.add(signedUrl);
      originalIndices.add(entry.index);
    }
  }

  return ResolvedRequestImageUrls(
    urls: resolvedUrls,
    originalIndices: originalIndices,
  );
}

class _RequestImageThumbnail extends StatelessWidget {
  const _RequestImageThumbnail({
    required this.imageUrls,
    required this.imageIndex,
    required this.borderColor,
  });

  final List<String> imageUrls;
  final int imageIndex;
  final Color borderColor;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        unawaited(
          Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => _ImagePreviewPage(
                imageUrls: imageUrls,
                initialIndex: imageIndex,
              ),
            ),
          ),
        );
      },
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: DecoratedBox(
          decoration: BoxDecoration(border: Border.all(color: borderColor)),
          child: Image.network(
            imageUrls[imageIndex],
            fit: BoxFit.cover,
            errorBuilder: (context, _, _) {
              return Center(
                child: Icon(
                  Icons.broken_image_outlined,
                  color: shad.Theme.of(context).colorScheme.mutedForeground,
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _ImagePreviewPage extends StatefulWidget {
  const _ImagePreviewPage({
    required this.imageUrls,
    required this.initialIndex,
  });

  final List<String> imageUrls;
  final int initialIndex;

  @override
  State<_ImagePreviewPage> createState() => _ImagePreviewPageState();
}

class _ImagePreviewPageState extends State<_ImagePreviewPage> {
  late final PageController _pageController;
  late int _currentIndex;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
    _pageController = PageController(initialPage: widget.initialIndex);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final hasMultipleImages = widget.imageUrls.length > 1;

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            PageView.builder(
              controller: _pageController,
              itemCount: widget.imageUrls.length,
              onPageChanged: (index) {
                setState(() => _currentIndex = index);
              },
              itemBuilder: (context, index) {
                return Center(
                  child: InteractiveViewer(
                    child: Image.network(
                      widget.imageUrls[index],
                      fit: BoxFit.contain,
                      errorBuilder: (context, _, _) => const Icon(
                        Icons.broken_image_outlined,
                        color: Colors.white70,
                        size: 40,
                      ),
                    ),
                  ),
                );
              },
            ),
            Positioned(
              top: 12,
              right: 12,
              child: IconButton(
                onPressed: () => Navigator.of(context).maybePop(),
                icon: const Icon(Icons.close, color: Colors.white),
              ),
            ),
            if (hasMultipleImages)
              Positioned(
                bottom: 16,
                left: 0,
                right: 0,
                child: Center(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: Colors.black54,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      child: Text(
                        '${_currentIndex + 1}/${widget.imageUrls.length}',
                        style: const TextStyle(color: Colors.white),
                      ),
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
