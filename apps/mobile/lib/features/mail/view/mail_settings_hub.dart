import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_settings_chrome.dart';
import 'package:mobile/features/mail/view/mail_settings_page.dart';
import 'package:mobile/features/mail/view/mail_swipe_preferences.dart';
import 'package:mobile/features/settings/view/settings_scoped_page.dart';
import 'package:mobile/l10n/l10n.dart';

/// Resolve real mailbox membership before opening the shared Mail editor.
class MailSettingsHub extends StatefulWidget {
  const MailSettingsHub({
    required this.workspaceId,
    required this.locations,
    required this.isScopeCurrent,
    this.repository,
    super.key,
  });
  final String workspaceId;
  final Set<String> locations;
  final bool Function() isScopeCurrent;
  final MailRepository? repository;
  @override
  State<MailSettingsHub> createState() => _MailSettingsHubState();
}

class _MailSettingsHubState extends State<MailSettingsHub> {
  late final MailRepository _repository = widget.repository ?? MailRepository();
  // Device gestures are editable from central Settings too.
  final _swipePreferences = MailSwipePreferences();
  List<Map<String, dynamic>> _mailboxes = [];
  bool _busy = true;
  bool _failed = false;
  bool _childOpen = false;
  bool _hasSnapshot = false;
  int _loadGeneration = 0;
  bool _opening = false;
  @override
  void initState() {
    super.initState();
    unawaited(_swipePreferences.load());
    _repository.accessRevoked?.addListener(_accessRevoked);
    unawaited(_load(background: true));
  }

  @override
  void dispose() {
    _repository.accessRevoked?.removeListener(_accessRevoked);
    if (widget.repository == null) {
      _repository.dispose();
    }
    _swipePreferences.dispose();
    super.dispose();
  }

  void _accessRevoked() {
    if (!mounted || _repository.accessRevoked?.value != widget.workspaceId) {
      return;
    }
    _loadGeneration++;
    setState(() {
      _mailboxes = [];
      _hasSnapshot = false;
      _busy = false;
      _failed = true;
    });
  }

  Future<void> _load({bool background = false}) async {
    if (!widget.isScopeCurrent()) {
      return;
    }
    final generation = ++_loadGeneration;
    bool isCurrent() =>
        mounted && widget.isScopeCurrent() && generation == _loadGeneration;
    setState(() {
      _busy = !_hasSnapshot;
      _failed = false;
    });
    try {
      final cached = await _repository.cachedSettingsAccounts(
        widget.workspaceId,
      );
      if (!isCurrent()) {
        return;
      }
      if (cached != null && !_hasSnapshot) {
        setState(() {
          _mailboxes = mailRows(cached['mailboxes']);
          _hasSnapshot = true;
          _busy = false;
        });
      }
    } on Object {
      // A storage failure cannot block fresh membership checks.
    }
    if (!isCurrent()) {
      return;
    }
    try {
      Future<Map<String, dynamic>> fetch() =>
          _repository.settingsBootstrap(widget.workspaceId);
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
      setState(() {
        _mailboxes = mailRows(result['mailboxes']);
        _hasSnapshot = true;
      });
    } on Object catch (error) {
      if (isCurrent()) {
        setState(() {
          if (error is ApiException &&
              (error.statusCode == 401 ||
                  error.statusCode == 404 ||
                  (error.statusCode == 403 &&
                      !error.isVerificationRequired &&
                      error.code != 'MFA_REQUIRED'))) {
            _mailboxes = [];
            _hasSnapshot = false;
          }
          _failed = true;
        });
      }
    } finally {
      if (isCurrent()) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _open(Map<String, dynamic> box) async {
    if (!widget.isScopeCurrent() || _opening || _childOpen) {
      return;
    }
    _opening = true;
    try {
      // A restored address is useful immediately without reusing a stale role.
      // Fresh grants remain in memory only; the server owns mutation access.
      final readOnlySnapshot = box['role'] == null;
      setState(() => _childOpen = true);
      await WidgetsBinding.instance.endOfFrame;
      if (!mounted || !widget.isScopeCurrent()) {
        return;
      }
      try {
        await pushScopedSettingsPage(
          context,
          builder: (_, isCurrent) => MailSettingsPage(
            repository: _repository,
            workspaceId: widget.workspaceId,
            mailboxId: box['id'] as String,
            swipePreferences: _swipePreferences,
            canManage:
                !readOnlySnapshot && ['owner', 'admin'].contains(box['role']),
            readOnlySnapshot: readOnlySnapshot,
            shellLocations: widget.locations,
            isScopeCurrent: () => widget.isScopeCurrent() && isCurrent(),
          ),
        );
      } finally {
        if (mounted) {
          setState(() => _childOpen = false);
        }
      }
    } finally {
      _opening = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final content = ColoredBox(
      color: mailSettingsBackground(context),
      child: _busy
          ? const MailSettingsSkeleton()
          : _failed && !_hasSnapshot
          ? Center(
              child: AppButton.outline(
                onPressed: _load,
                child: Text(context.l10n.commonRetry),
              ),
            )
          : RefreshIndicator(
              onRefresh: _load,
              child: AppPageListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  if (_failed)
                    AppButton.outline(
                      onPressed: _load,
                      child: Text(context.l10n.commonRetry),
                    ),
                  if (_mailboxes.isEmpty) Text(context.l10n.mailEmpty),
                  for (final box in _mailboxes)
                    MailSettingsAccountRow(
                      address:
                          box['address'] as String? ?? context.l10n.mailMailbox,
                      onTap: () => unawaited(_open(box)),
                    ),
                ],
              ),
            ),
    );
    if (_childOpen) {
      return content;
    }
    return MailSettingsChrome(
      locations: widget.locations,
      canManage: false,
      child: content,
    );
  }
}
