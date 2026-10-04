import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';

/// Cancel an app settings route on any account or workspace transition,
/// including switching away and back while a request is in flight.
Future<void> pushScopedSettingsPage(
  BuildContext context, {
  required Widget Function(BuildContext context, bool Function() isCurrent)
  builder,
}) async {
  final auth = context.read<AuthCubit?>();
  final workspace = context.read<WorkspaceCubit?>();
  final account = (auth?.state.user?.id, auth?.state.status);
  final workspaceId = workspace?.state.currentWorkspace?.id;
  var invalidated = false;
  Route<void>? route;
  final subscriptions = <StreamSubscription<dynamic>>[];
  bool isCurrent() =>
      !invalidated &&
      context.mounted &&
      (auth?.state.user?.id, auth?.state.status) == account &&
      workspace?.state.currentWorkspace?.id == workspaceId;
  void cancel() {
    invalidated = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final owned = route;
      final navigator = owned?.navigator;
      if (owned == null || navigator == null || !owned.isActive) return;
      if (owned.isCurrent) {
        navigator.pop();
      } else {
        navigator.removeRoute(owned);
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
    route = MaterialPageRoute<void>(
      builder: (context) => builder(context, isCurrent),
    );
    await Navigator.of(context).push<void>(route);
  } finally {
    for (final subscription in subscriptions) {
      await subscription.cancel();
    }
  }
}
