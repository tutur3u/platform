part of 'mail_reader.dart';

extension _MailReaderLoading on _MailReaderState {
  Future<void> _hydrate() async {
    final generation = ++_contentGeneration;
    final load = widget.loadDetail;
    if (load == null) return;
    if (_loadError != null) _updateState(() => _loadError = null);
    try {
      final preview = await load();
      if (!mounted || generation != _contentGeneration) return;
      _updateState(() => _detail = preview.detail);
      _detailReady(refresh: widget.thread && !preview.fromNetwork);
    } on ApiException catch (error) {
      if (!mounted || generation != _contentGeneration) return;
      if (error.statusCode == 401 || error.statusCode == 403) {
        await widget.repository.denyAccess(widget.workspaceId);
        if (mounted) _close();
      } else if (mounted) {
        _updateState(() => _loadError = error);
      }
    } on Object catch (error) {
      if (mounted && generation == _contentGeneration) {
        _updateState(() => _loadError = error);
      }
    }
  }

  Future<void> _refresh() async {
    final generation = _contentGeneration;
    try {
      final detail = await widget.repository.refreshThread(
        widget.workspaceId,
        widget.mailboxId,
        _id,
      );
      if (mounted && generation == _contentGeneration && !_accessRevoked) {
        final previousLatestId = _messages.lastOrNull?['id'] as String?;
        _updateState(() {
          _detail = detail;
          _starred = _messages.any((message) => message['starred'] == true);
          final latestId = _messages.lastOrNull?['id'] as String?;
          if (latestId != null && latestId != previousLatestId) {
            if (previousLatestId != null) {
              _expandedMessages[previousLatestId] = false;
            }
            _expandedMessages[latestId] = true;
          }
        });
        unawaited(_resolvePeople(replace: true));
      }
    } on ApiException catch (error) {
      if (!mounted || generation != _contentGeneration || _accessRevoked) {
        return;
      }
      if (error.statusCode == 401 || error.statusCode == 403) {
        await widget.repository.denyAccess(widget.workspaceId);
        if (mounted) _close();
      } else if (error.statusCode == 404 && mounted) {
        _close();
      }
    } on Object {
      // Keep the encrypted cached message readable during a network outage.
    }
  }

  Future<void> _resolvePeople({bool replace = false}) async {
    if (_peopleLoading && !replace) return;
    _peopleRetry?.cancel();
    final generation = ++_peopleGeneration;
    final workspace = widget.workspaceId;
    final emails = <String>{
      for (final message in _messages) ...[
        if (message['fromAddress'] is String) message['fromAddress'] as String,
        if (message['observedRecipient'] is String)
          message['observedRecipient'] as String,
        for (final person in mailReplyToPeople(message)) person.$1,
        for (final recipient in mailRows(message['recipients']))
          if (recipient['address'] is String) recipient['address'] as String,
      ],
    }.take(50).toList();
    if (emails.isEmpty) {
      _peopleLoading = false;
      _people = {};
      _peopleFailed = false;
      return;
    }
    _peopleLoading = true;
    try {
      final people = await (widget.resolvePeople ?? _peopleResolver.resolve)(
        workspace,
        emails,
      );
      if (!mounted ||
          generation != _peopleGeneration ||
          workspace != widget.workspaceId ||
          _accessRevoked) {
        return;
      }
      _updateState(() {
        _people = {
          for (final entry in people.entries)
            entry.key.trim().toLowerCase(): entry.value,
        };
        _peopleFailed = false;
        _peopleLoading = false;
        _peopleRetried = false;
      });
    } on Object {
      if (!mounted || generation != _peopleGeneration || _accessRevoked) return;
      if (!_peopleRetried) {
        // Names are decoration: the message stays readable with addresses,
        // so a transient failure retries once before surfacing.
        _peopleRetried = true;
        _peopleLoading = false;
        _peopleRetry?.cancel();
        _peopleRetry = Timer(const Duration(seconds: 2), () {
          if (mounted && generation == _peopleGeneration && !_accessRevoked) {
            unawaited(_resolvePeople());
          }
        });
        return;
      }
      _updateState(() {
        _peopleFailed = true;
        _peopleLoading = false;
      });
    }
  }
}
