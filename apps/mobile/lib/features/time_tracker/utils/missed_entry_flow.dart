import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/time_tracker/widgets/missed_entry_dialog.dart';

Future<bool> hasBypassTimeTrackingRequestApprovalPermission({
  required String wsId,
  required String userId,
}) async {
  if (wsId.isEmpty || userId.isEmpty) {
    return false;
  }

  try {
    final workspacePermissions = await WorkspacePermissionsRepository()
        .getPermissions(wsId: wsId, userId: userId);

    return workspacePermissions.containsPermission(
      bypassTimeTrackingRequestApprovalPermission,
    );
  } on Exception {
    return false;
  }
}

typedef SaveMissedEntryCallback =
    Future<void> Function({
      required String title,
      required DateTime startTime,
      required DateTime endTime,
      String? categoryId,
      String? description,
    });

typedef SaveMissedEntryRequestCallback =
    Future<void> Function({
      required String title,
      required DateTime startTime,
      required DateTime endTime,
      required List<String> imageLocalPaths,
      String? categoryId,
      String? description,
    });

Future<void> showMissedEntryDialogFlow(
  BuildContext context, {
  required String wsId,
  required String userId,
  required List<TimeTrackingCategory> categories,
  required int? thresholdDays,
  required SaveMissedEntryCallback onCreateMissedEntry,
  required SaveMissedEntryRequestCallback onCreateMissedEntryAsRequest,
  Future<void> Function()? onAfterSave,
  bool? hasBypassPermission,
  DateTime? initialStartTime,
  DateTime? initialEndTime,
  String? initialTitle,
  String? initialDescription,
  String? initialCategoryId,
}) async {
  final canBypassApproval =
      hasBypassPermission ??
      await hasBypassTimeTrackingRequestApprovalPermission(
        wsId: wsId,
        userId: userId,
      );
  if (!context.mounted) {
    return;
  }

  unawaited(
    showAdaptiveDrawer(
      context: context,
      builder: (_) => MissedEntryDialog(
        categories: categories,
        canBypassRequestApproval: canBypassApproval,
        thresholdDays: thresholdDays,
        initialStartTime: initialStartTime,
        initialEndTime: initialEndTime,
        initialTitle: initialTitle,
        initialDescription: initialDescription,
        initialCategoryId: initialCategoryId,
        onSave:
            ({
              required title,
              required startTime,
              required endTime,
              required shouldSubmitAsRequest,
              required imageLocalPaths,
              categoryId,
              description,
            }) async {
              if (shouldSubmitAsRequest) {
                await onCreateMissedEntryAsRequest(
                  title: title,
                  categoryId: categoryId,
                  startTime: startTime,
                  endTime: endTime,
                  description: description,
                  imageLocalPaths: imageLocalPaths,
                );
              } else {
                await onCreateMissedEntry(
                  title: title,
                  categoryId: categoryId,
                  startTime: startTime,
                  endTime: endTime,
                  description: description,
                );
              }

              if (onAfterSave != null) {
                await onAfterSave();
              }
            },
      ),
    ),
  );
}
