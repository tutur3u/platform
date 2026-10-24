import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/assistant/view/assistant_settings_route_frame.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/features/assistant/view/assistant_settings_hub.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';

/// A direct settings link fences editors across account/workspace transitions.
class AssistantSettingsRoute extends StatefulWidget {
  const AssistantSettingsRoute({super.key});

  @override
  State<AssistantSettingsRoute> createState() => _AssistantSettingsRouteState();
}

class _AssistantSettingsRouteState extends State<AssistantSettingsRoute> {
  (String?, AuthStatus, String?)? _scope;
  int _revision = 0;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthCubit>().state;
    final workspaces = context.watch<WorkspaceCubit>().state;
    final workspace = workspaces.currentWorkspace;
    final scope = (auth.user?.id, auth.status, workspace?.id);
    if (_scope != scope) {
      _scope = scope;
      _revision++;
    }
    final revision = _revision;
    if (auth.status != AuthStatus.authenticated || workspace == null) {
      final loading = auth.status == AuthStatus.unknown || auth.isLoading ||
          (auth.status == AuthStatus.authenticated &&
              (workspaces.status == WorkspaceStatus.initial ||
               workspaces.status == WorkspaceStatus.loading));
      return AssistantSettingsRouteFrame(
        title: context.l10n.assistantSettingsTitle,
        locations: {Routes.settingsAppPath('assistant')},
        child: Center(
          child: loading
              ? Semantics(label: context.l10n.commonLoading,
                  child: const NovaLoadingIndicator(size: 20))
              : Text(workspaces.status == WorkspaceStatus.error
                  ? context.l10n.assistantPersonalSettingsError
                  : context.l10n.workspaceSelectEmpty),
        ),
      );
    }
    return MultiBlocListener(
      listeners: [
        BlocListener<AuthCubit, AuthState>(
          listenWhen: (before, after) =>
              (before.user?.id, before.status) !=
              (after.user?.id, after.status),
          listener: (_, _) => setState(() => _revision++),
        ),
        BlocListener<WorkspaceCubit, WorkspaceState>(
          listenWhen: (before, after) =>
              before.currentWorkspace?.id != after.currentWorkspace?.id,
          listener: (_, _) => setState(() => _revision++),
        ),
      ],
      child: AssistantSettingsHub(
        key: ValueKey((scope, revision)),
        workspaceId: workspace.id,
        locations: {Routes.settingsAppPath('assistant')},
        isScopeCurrent: () =>
            mounted &&
            revision == _revision &&
            context.read<AuthCubit>().state.user?.id == scope.$1 &&
            context.read<AuthCubit>().state.status == scope.$2 &&
            context.read<WorkspaceCubit>().state.currentWorkspace?.id ==
                scope.$3,
      ),
    );
  }
}
