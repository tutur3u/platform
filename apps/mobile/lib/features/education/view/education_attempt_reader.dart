part of 'education_page.dart';

class _EducationAttemptReader extends StatefulWidget {
  const _EducationAttemptReader({
    required this.repository,
    required this.workspaceId,
    required this.attemptId,
  });
  final EducationRepository repository;
  final String workspaceId;
  final String attemptId;
  @override
  State<_EducationAttemptReader> createState() =>
      _EducationAttemptReaderState();
}

class _EducationAttemptReaderState extends State<_EducationAttemptReader> {
  EducationAttemptDetail? _detail;
  bool _loading = true;
  bool _failed = false;
  int _generation = 0;
  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load({bool force = false}) async {
    final generation = ++_generation;
    setState(() {
      _loading = true;
      _failed = false;
    });
    Future<EducationAttemptDetail> read() => widget.repository.getAttemptDetail(
      widget.workspaceId,
      widget.attemptId,
    );
    void publish(EducationAttemptDetail value) {
      if (mounted && generation == _generation) setState(() => _detail = value);
    }

    try {
      final value = force
          ? await CacheStore.awaitRevalidation(read)
          : await CacheStore.readWithRevalidation(read, onSnapshot: publish);
      publish(value);
    } on Object catch (error) {
      if (!mounted || generation != _generation) return;
      setState(() {
        _failed = true;
        if (error is ApiException &&
            (error.statusCode == 401 ||
                (error.statusCode == 403 &&
                    error.code != 'MFA_REQUIRED' &&
                    !error.isVerificationRequired))) {
          _detail = null;
        }
      });
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      if (_loading)
        Semantics(
          liveRegion: true,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Text(context.l10n.commonLoading),
          ),
        ),
      if (_failed)
        TextButton.icon(
          onPressed: () => _load(force: true),
          icon: const Icon(Icons.refresh_rounded),
          label: Text(context.l10n.commonRetry),
        ),
      if (_detail != null)
        Expanded(child: _AttemptDetailSheet(detail: _detail!)),
    ],
  );
}
