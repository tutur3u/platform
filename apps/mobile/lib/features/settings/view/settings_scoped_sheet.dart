import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';

/// An editor belongs to the account and workspace that opened it. Even a
/// switch away and back cancels it; a later selection cannot write silently.
Future<T?> showScopedSettingsSheet<T>({
  required BuildContext context,
  required Widget Function(BuildContext) builder,
  double maxDialogWidth = 420,
}) async {
  final auth = context.read<AuthCubit?>();
  final workspace = context.read<WorkspaceCubit?>();
  final account = (auth?.state.user?.id, auth?.state.status);
  final workspaceId = workspace?.state.currentWorkspace?.id;
  final subscriptions = <StreamSubscription<dynamic>>[];
  ModalRoute<dynamic>? editorRoute;
  var invalidated = false;

  void cancel() {
    if (invalidated) return;
    invalidated = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final route = editorRoute;
      final navigator = route?.navigator;
      if (route == null || navigator == null) return;
      if (route.isCurrent) {
        navigator.pop();
      } else if (route.isActive) {
        navigator.removeRoute(route);
      }
    });
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  if (auth != null) {
    subscriptions.add(
      auth.stream.listen((state) {
        if ((state.user?.id, state.status) != account) cancel();
      }),
    );
  }
  if (workspace != null) {
    subscriptions.add(
      workspace.stream.listen((state) {
        if (state.currentWorkspace?.id != workspaceId) cancel();
      }),
    );
  }
  try {
    final selected = await showAdaptiveSheet<T>(
      context: context,
      maxDialogWidth: maxDialogWidth,
      builder: (sheetContext) {
        editorRoute = ModalRoute.of(sheetContext);
        return builder(sheetContext);
      },
    );
    return invalidated ||
            !context.mounted ||
            (auth?.state.user?.id, auth?.state.status) != account ||
            workspace?.state.currentWorkspace?.id != workspaceId
        ? null
        : selected;
  } finally {
    for (final subscription in subscriptions) {
      // Stop delivery immediately; producer cleanup must not delay the choice.
      unawaited(subscription.cancel());
    }
  }
}
