import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/utils/timezone.dart';
import 'package:mobile/data/repositories/profile_activity_repository.dart';
import 'package:mobile/features/profile/view/shared_activity_sheet.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

/// Key by user and workspace to discard old responses.
class WorkspaceActivitySection extends StatefulWidget {
  const WorkspaceActivitySection({
    required this.workspaceId,
    required this.workspaceName,
    this.replayToken = 0,
    this.repository,
    super.key,
  });
  final int replayToken;
  final String workspaceId;
  final String workspaceName;
  final ProfileActivityRepository? repository;
  @override
  State<WorkspaceActivitySection> createState() =>
      _WorkspaceActivitySectionState();
}

class _WorkspaceActivitySectionState extends State<WorkspaceActivitySection> {
  late final ProfileActivityRepository _repository =
      widget.repository ?? ProfileActivityRepository();
  bool _loading = true;
  bool _saving = false;
  bool _sharing = false;
  bool _failed = false;
  String? _next;
  final List<Map<String, dynamic>> _members = [];

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void didUpdateWidget(covariant WorkspaceActivitySection oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.replayToken != oldWidget.replayToken && !_saving && !_loading) {
      unawaited(_load());
    }
  }

  Future<void> _load({bool more = false}) async {
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final data = await _repository.load(
        widget.workspaceId,
        after: more ? _next : null,
      );
      if (!mounted) return;
      setState(() {
        _sharing = data['sharing'] == true;
        _next = data['next'] as String?;
        if (!more) _members.clear();
        final existing = _members.map((m) => m['id']).toSet();
        _members.addAll(
          (data['members'] as List<dynamic>? ?? [])
              .cast<Map<String, dynamic>>()
              .where((m) => !existing.contains(m['id'])),
        );
      });
    } on Exception {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggle(bool value) async {
    if (value) {
      final approved = await showAdaptiveSheet<bool>(
        context: context,
        builder: (sheetContext) => AppDialogScaffold(
          title: context.l10n.profileShareActivityTitle,
          icon: Icons.groups_outlined,
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(sheetContext, false),
              child: Text(context.l10n.commonCancel),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(sheetContext, true),
              child: Text(context.l10n.profileShareActivityTitle),
            ),
          ],
          child: Text(
            context.l10n.profileShareActivityConsent(widget.workspaceName),
          ),
        ),
      );
      if (!mounted || approved != true) return;
    }
    setState(() => _saving = true);
    try {
      await _repository.setSharing(widget.workspaceId, sharing: value);
      if (!mounted) return;
      setState(() => _sharing = value);
      await _load();
    } on Exception {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _open(Map<String, dynamic> member) async {
    final timezone = await getCurrentTimezoneIdentifier();
    if (!mounted) return;
    await showAdaptiveSheet<void>(
      context: context,
      backgroundColor: Theme.of(context).colorScheme.surface,
      builder: (_) => SharedActivitySheet(
        name: member['name'] as String? ?? context.l10n.profileTitle,
        load: () => _repository.sharedStats(
          widget.workspaceId,
          member['id'] as String,
          timezone,
        ),
      ),
    );
  }

  @override
  void dispose() {
    _repository.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 24),
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          title: Text(l10n.profileShareActivityTitle),
          subtitle: Text(
            _sharing
                ? l10n.profileSharedWithWorkspace(widget.workspaceName)
                : l10n.profilePrivateByDefault,
          ),
          secondary: Icon(
            _sharing ? Icons.groups_outlined : Icons.lock_outline,
          ),
          value: _sharing,
          onChanged: _loading || _saving || _failed
              ? null
              : (value) => unawaited(_toggle(value)),
        ),
        if (_failed)
          TextButton.icon(
            onPressed: () => unawaited(_load()),
            icon: const Icon(Icons.refresh),
            label: Text(l10n.commonRetry),
          ),
        const SizedBox(height: 12),
        Text(
          l10n.profileWorkspaceActivity,
          style: Theme.of(context).textTheme.titleLarge,
        ),
        if (_members.isEmpty && !_loading && !_failed)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Text(l10n.profileNoSharedActivity),
          ),
        for (final member in _members)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.person_outline),
            title: Text(member['name'] as String? ?? l10n.profileTitle),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => unawaited(_open(member)),
          ),
        if (_loading)
          const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: NovaLoadingIndicator()),
          ),
        if (_next != null && !_loading)
          TextButton(
            onPressed: () => unawaited(_load(more: true)),
            child: Text(l10n.profileMoreActivity),
          ),
      ],
    );
  }
}
