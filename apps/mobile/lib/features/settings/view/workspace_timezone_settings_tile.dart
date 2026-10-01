import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/settings/view/timezone_settings_tile.dart';

/// Uses the existing workspace permissions source without duplicating settings.
class WorkspaceTimezoneSettingsTile extends StatefulWidget {
  const WorkspaceTimezoneSettingsTile({
    required this.userId,
    required this.workspaceId,
    this.permissionsRepository,
    this.refreshRevision = 0,
    this.grouped = false,
    super.key,
  });

  final int refreshRevision;
  final bool grouped;
  final String? userId;
  final String? workspaceId;
  final WorkspacePermissionsRepository? permissionsRepository;

  @override
  State<WorkspaceTimezoneSettingsTile> createState() =>
      _WorkspaceTimezoneSettingsTileState();
}

class _WorkspaceTimezoneSettingsTileState
    extends State<WorkspaceTimezoneSettingsTile> {
  late final WorkspacePermissionsRepository _repository;
  int _generation = 0;
  bool _canManage = false;

  @override
  void initState() {
    super.initState();
    _repository =
        widget.permissionsRepository ?? WorkspacePermissionsRepository();
    unawaited(_load());
  }

  @override
  void didUpdateWidget(WorkspaceTimezoneSettingsTile oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.userId != widget.userId ||
        oldWidget.workspaceId != widget.workspaceId ||
        oldWidget.refreshRevision != widget.refreshRevision) {
      unawaited(_load());
    }
  }

  Future<void> _load() async {
    final generation = ++_generation;
    final userId = widget.userId;
    final workspaceId = widget.workspaceId;
    setState(() => _canManage = false);
    if (userId == null || workspaceId == null) return;
    var allowed = false;
    try {
      final permissions = await _repository.getPermissions(
        wsId: workspaceId,
        userId: userId,
      );
      allowed = permissions.containsPermission(
        manageWorkspaceSettingsPermission,
      );
    } on Exception {
      // A failed permission lookup keeps the workspace setting read-only.
    }
    if (!mounted || generation != _generation) return;
    setState(() => _canManage = allowed);
  }

  @override
  Widget build(BuildContext context) => TimezoneSettingsTile(
    userId: widget.userId,
    workspaceId: widget.workspaceId,
    workspace: true,
    canManageWorkspace: _canManage,
    grouped: widget.grouped,
  );
}
