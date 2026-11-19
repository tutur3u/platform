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
  bool _failed = false;
  int _generation = 0;
  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load({bool force = false}) async {
    final generation = ++_generation;
    setState(() => _failed = false);
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
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final detail = _detail;
    final title =
        detail?.learner?.fullName ??
        detail?.learner?.email ??
        l10n.educationAttemptsLabel;
    return AppSheetScaffold(
      title: title,
      child: _failed
          ? AppStateMessage(
              icon: AppIcons.error,
              title: l10n.commonSomethingWentWrong,
              tone: AppTone.destructive,
              actionLabel: l10n.commonRetry,
              onAction: () => _load(force: true),
            )
          : detail == null
          ? const AppLoadingIndicator.page()
          : _AttemptDetailBody(detail: detail),
    );
  }
}
