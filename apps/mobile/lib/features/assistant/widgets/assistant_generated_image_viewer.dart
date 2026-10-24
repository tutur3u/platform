part of 'assistant_tool_results_section.dart';

class _AssistantGeneratedImageViewer extends StatefulWidget {
  const _AssistantGeneratedImageViewer({
    required this.heroTag,
    required this.initialUrl,
    required this.storagePath,
    required this.alt,
  });

  final String heroTag;
  final String initialUrl;
  final String? storagePath;
  final String alt;

  @override
  State<_AssistantGeneratedImageViewer> createState() =>
      _AssistantGeneratedImageViewerState();
}

class _AssistantGeneratedImageViewerState
    extends State<_AssistantGeneratedImageViewer> {
  final _repository = AssistantRepository();
  late Future<String?> _imageUrlFuture;

  @override
  void initState() {
    super.initState();
    _imageUrlFuture = _resolveImageUrl();
  }

  @override
  Widget build(BuildContext context) {
    return AppSheetScaffold(
      title: context.l10n.assistantToolGeneratedImage,
      slivers: [
        SliverFillRemaining(
          child: SafeArea(
            top: false,
            child: FutureBuilder<String?>(
              future: _imageUrlFuture,
              builder: (context, snapshot) {
                final url = snapshot.data ?? widget.initialUrl;
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: NovaLoadingIndicator());
                }
                return Center(
                  child: InteractiveViewer(
                    minScale: 0.75,
                    maxScale: 5,
                    child: Hero(
                      tag: widget.heroTag,
                      child: Image.network(
                        url,
                        fit: BoxFit.contain,
                        errorBuilder: (context, error, stackTrace) {
                          return Icon(
                            LucideIcons.imageOff,
                            color: AppTokens.of(
                              context,
                            ).colorScheme.mutedForeground,
                            size: 44,
                          );
                        },
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      ],
    );
  }

  Future<String?> _resolveImageUrl() async {
    if (!_isSignedUrlExpired(widget.initialUrl)) {
      return widget.initialUrl;
    }

    final storagePath = widget.storagePath?.trim();
    if (storagePath == null || storagePath.isEmpty) {
      return widget.initialUrl;
    }

    try {
      final urls = await _repository.fetchSignedReadUrls([storagePath]);
      return urls[storagePath] ?? widget.initialUrl;
    } on Exception {
      return widget.initialUrl;
    }
  }
}
