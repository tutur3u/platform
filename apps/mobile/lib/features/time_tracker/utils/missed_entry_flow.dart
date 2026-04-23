import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_cubit.dart';
import 'package:mobile/features/time_tracker/widgets/missed_entry_dialog.dart';

final WorkspacePermissionsRepository _defaultWorkspacePermissionsRepository =
    WorkspacePermissionsRepository();

Future<bool> hasBypassTimeTrackingRequestApprovalPermission({
  required String wsId,
  required String userId,
  WorkspacePermissionsRepository? workspacePermissionsRepository,
}) async {
  if (wsId.isEmpty || userId.isEmpty) {
    return false;
  }

  try {
    final repository =
        workspacePermissionsRepository ??
        _defaultWorkspacePermissionsRepository;
    final workspacePermissions = await repository.getPermissions(
      wsId: wsId,
      userId: userId,
    );

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
  WorkspacePermissionsRepository? workspacePermissionsRepository,
  DateTime? initialStartTime,
  DateTime? initialEndTime,
  String? initialTitle,
  String? initialDescription,
  String? initialCategoryId,
  Future<void> Function({
    required String name,
    String? color,
    String? description,
  })?
  onCreateCategory,
  TimeTrackerCubit? categoryListCubit,
}) async {
  final canBypassApproval =
      hasBypassPermission ??
      await hasBypassTimeTrackingRequestApprovalPermission(
        wsId: wsId,
        userId: userId,
        workspacePermissionsRepository: workspacePermissionsRepository,
      );
  if (!context.mounted) {
    return;
  }

  unawaited(
    showAdaptiveDrawer(
      context: context,
      builder: (_) => MissedEntryDialog(
        categories: categories,
        categoryListCubit: categoryListCubit,
        canBypassRequestApproval: canBypassApproval,
        thresholdDays: thresholdDays,
        initialStartTime: initialStartTime,
        initialEndTime: initialEndTime,
        initialTitle: initialTitle,
        initialDescription: initialDescription,
        initialCategoryId: initialCategoryId,
        onCreateCategory: onCreateCategory,
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

Future<void> showMissedEntryDialogForTimeTrackerCubit(
  BuildContext context, {
  required TimeTrackerCubit cubit,
  required String wsId,
  required String userId,
  Future<void> Function()? onAfterSave,
  bool? hasBypassPermission,
  WorkspacePermissionsRepository? workspacePermissionsRepository,
  DateTime? initialStartTime,
  DateTime? initialEndTime,
  String? initialTitle,
  String? initialDescription,
  String? initialCategoryId,
  Future<void> Function({
    required String name,
    String? color,
    String? description,
  })?
  onCreateCategory,
}) {
  return showMissedEntryDialogFlow(
    context,
    wsId: wsId,
    userId: userId,
    categories: cubit.state.categories,
    thresholdDays: cubit.state.thresholdDays,
    onCreateCategory:
        onCreateCategory ??
        ({
          required name,
          color,
          description,
        }) => cubit.createCategory(
          wsId,
          name,
          color: color,
          description: description,
          throwOnError: true,
        ),
    onCreateMissedEntry:
        ({
          required title,
          required startTime,
          required endTime,
          categoryId,
          description,
        }) => cubit.createMissedEntry(
          wsId,
          userId,
          title: title,
          categoryId: categoryId,
          startTime: startTime,
          endTime: endTime,
          description: description,
          throwOnError: true,
        ),
    onCreateMissedEntryAsRequest:
        ({
          required title,
          required startTime,
          required endTime,
          required imageLocalPaths,
          categoryId,
          description,
        }) => cubit.createMissedEntryAsRequest(
          wsId,
          userId,
          title: title,
          categoryId: categoryId,
          startTime: startTime,
          endTime: endTime,
          description: description,
          imageLocalPaths: imageLocalPaths,
          throwOnError: true,
        ),
    onAfterSave: onAfterSave,
    hasBypassPermission: hasBypassPermission,
    workspacePermissionsRepository: workspacePermissionsRepository,
    initialStartTime: initialStartTime,
    initialEndTime: initialEndTime,
    initialTitle: initialTitle,
    initialDescription: initialDescription,
    initialCategoryId: initialCategoryId,
    categoryListCubit: cubit,
  );
}
