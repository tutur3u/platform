part of 'mail_settings_page.dart';

extension _MailSettingsPageData on _MailSettingsPageState {
  void _clearSettings() {
    _savedDraft = null;
    _hasSnapshot = false;
    for (final controller in [_sender, _signature, _instructions, _forwardTo]) {
      controller.clear();
    }
    _group = null;
    _provider = null;
    _autoDraft = false;
    _smartLabels = false;
    _forwarding = 'off';
  }

  void _applySettings(Map<String, dynamic> result, {bool confirmed = false}) {
    if (_dirty || _saving) {
      return;
    }
    final settings = result['settings'] as Map<String, dynamic>;
    final automation = settings['automation'] as Map<String, dynamic>?;
    final forwarding = automation?['forwarding'] as Map<String, dynamic>?;
    _sender.text = settings['senderName'] as String? ?? '';
    _signature.text = settings['signatureText'] as String? ?? '';

    _instructions.text = settings['aiInstructions'] as String? ?? '';
    _forwardTo.text = forwarding?['address'] as String? ?? '';
    _updateSettingsState(() {
      _autoDraft = settings['autoDraftEnabled'] as bool? ?? false;
      _provider = settings['outboundProviderOverride'] as String?;
      _smartLabels = automation?['smartLabelsEnabled'] as bool? ?? false;
      _forwarding = forwarding?['mode'] as String? ?? 'off';
      _group = settings['groupPolicy'] as Map<String, dynamic>?;
      _editBaseline = mailSettingsFormValues(
        result['confirmedSettings'] as Map<String, dynamic>? ?? settings,
      );
      _savedDraft = _draft;
      _hasSnapshot = true;
      if (confirmed) _failed = false;
      if (confirmed && !_hasUnresolvedSettings) _awaitingConfirmation = false;
      if (_awaitingConfirmation && !confirmed && !_hasPendingSettings) {
        _failed = true;
      }
      _busy = false;
    });
  }

  Future<void> _load({bool background = false}) async {
    if (!_scopeCurrent) {
      return;
    }
    final generation = ++_loadGeneration;
    bool isCurrent() =>
        mounted && _scopeCurrent && generation == _loadGeneration;
    _updateSettingsState(() {
      _busy = !_hasSnapshot;
      _failed = false;
    });
    if (_settingsRejected && !widget.readOnlySnapshot) {
      try {
        final membership = await widget.repository.settingsBootstrap(
          widget.workspaceId,
        );
        if (!isCurrent()) return;
        final allowed = mailRows(membership['mailboxes']).any(
          (box) =>
              box['id'] == widget.mailboxId &&
              ['owner', 'admin'].contains(box['role']),
        );
        if (!allowed) {
          throw const ApiException(
            message: 'Mail access denied',
            statusCode: 403,
          );
        }
        _updateSettingsState(() => _settingsRejected = false);
      } on Object {
        if (isCurrent()) {
          _updateSettingsState(() {
            _failed = true;
            _busy = false;
          });
        }
        return;
      }
    }
    try {
      final cached = await widget.repository.cachedSettings(
        widget.workspaceId,
        widget.mailboxId,
      );
      if (!isCurrent()) {
        return;
      }
      if (cached != null && (!_hasSnapshot || widget.readOnlySnapshot)) {
        _applySettings(cached);
      }
    } on Object {
      // Keep the network path available when cache storage cannot be read.
    }
    if (!isCurrent()) {
      return;
    }
    if (widget.readOnlySnapshot) {
      _updateSettingsState(() {
        _busy = false;
        _failed = !_hasSnapshot;
      });
      return;
    }
    try {
      Future<Map<String, dynamic>> fetch() =>
          widget.repository.settings(widget.workspaceId, widget.mailboxId);
      final result = await (background && _hasSnapshot
          ? ApiClient.offlinePreparation(
              fetch,
              allowChallenge: false,
              markBulk: false,
            )
          : fetch());
      if (!isCurrent()) {
        return;
      }
      _applySettings(result, confirmed: result['settingsFresh'] != false);
    } on Object catch (error) {
      if (!isCurrent()) {
        return;
      }
      _updateSettingsState(() {
        if (error is ApiException &&
            (error.statusCode == 401 ||
                error.statusCode == 404 ||
                (error.statusCode == 403 &&
                    !error.isVerificationRequired &&
                    error.code != 'MFA_REQUIRED'))) {
          _clearSettings();
          _settingsRejected = true;
        }
        _failed = true;
      });
    } finally {
      if (isCurrent()) {
        _updateSettingsState(() => _busy = false);
      }
    }
  }

  Map<String, dynamic> get _formSettings => {
    'senderName': _sender.text.trim(),
    'signatureText': _signature.text,
    'aiInstructions': _instructions.text,
    'autoDraftEnabled': _autoDraft,
    'outboundProviderOverride': _provider,
    if (_group != null) 'groupPolicy': _group,
    if (_group == null)
      'automation': {
        'smartLabelsEnabled': _smartLabels,
        'forwarding': {
          'mode': _forwarding,
          if (_forwarding == 'mailbox') 'address': _forwardTo.text.trim(),
        },
      },
  };
}
