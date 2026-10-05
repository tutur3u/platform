part of 'cms_page.dart';

extension _CmsPageData on _CmsPageState {
  Future<void> _reload({bool force = false}) async {
    if (!mounted) return;
    final token = ++_requestToken;
    final collectionId = _selectedCollectionId;
    _updateState(() {
      _isLoading = true;
      _error = null;
    });
    Future<void> read() async {
      final results = await Future.wait<dynamic>([
        _repository.getSummary(_wsId),
        _repository.listCollections(_wsId),
        _repository.listEntries(_wsId, collectionId: collectionId),
      ]);
      if (!mounted || token != _requestToken) return;
      _updateState(() {
        _denied = false;
        _summary = results[0] as CmsSummary;
        _collections = {
          for (final row in results[1] as List<CmsCollection>) row.id: row,
        }.values.toList();
        _entries = {
          for (final row in results[2] as List<CmsEntry>) row.id: row,
        }.values.toList();
        if (collectionId != null &&
            !_collections.any((row) => row.id == collectionId)) {
          _selectedCollectionId = null;
        }
      });
    }

    try {
      if (force) {
        await CacheStore.awaitRevalidation(read);
      } else {
        await CacheStore.readWithRevalidation(read, onSnapshot: (_) {});
      }
    } on ApiException catch (error) {
      if (!mounted || token != _requestToken) return;
      _updateState(() {
        _error = error.message;
        if (error.statusCode == 401 ||
            (error.statusCode == 403 &&
                error.code != 'MFA_REQUIRED' &&
                !error.isVerificationRequired)) {
          _denied = true;
          _summary = null;
          _collections = const [];
          _entries = const [];
          _selectedCollectionId = null;
        }
      });
    } on Object {
      if (!mounted || token != _requestToken) return;
      _updateState(() => _error = context.l10n.commonSomethingWentWrong);
    } finally {
      if (mounted && token == _requestToken) {
        _updateState(() => _isLoading = false);
      }
    }
  }

  Future<void> _reloadEntries() => _reload();
}
