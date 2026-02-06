import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/router/app_router.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/data/repositories/auth_repository.dart';
import 'package:mobile/data/repositories/workspace_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

class App extends StatefulWidget {
  const App({super.key});

  @override
  State<App> createState() => _AppState();
}

class _AppState extends State<App> {
  late final AuthRepository _authRepo;
  late final WorkspaceRepository _workspaceRepo;
  late final AuthCubit _authCubit;
  late final WorkspaceCubit _workspaceCubit;

  @override
  void initState() {
    super.initState();
    _authRepo = AuthRepository();
    _workspaceRepo = WorkspaceRepository();
    _authCubit = AuthCubit(authRepository: _authRepo);
    _workspaceCubit = WorkspaceCubit(workspaceRepository: _workspaceRepo);
  }

  @override
  void dispose() {
    _authCubit.close();
    _workspaceCubit.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider.value(value: _authCubit),
        BlocProvider.value(value: _workspaceCubit),
      ],
      child: BlocListener<AuthCubit, AuthState>(
        listenWhen: (prev, curr) => prev.status != curr.status,
        listener: (context, state) {
          if (state.status == AuthStatus.authenticated) {
            context.read<WorkspaceCubit>().loadWorkspaces();
          } else if (state.status == AuthStatus.unauthenticated) {
            context.read<WorkspaceCubit>().clearWorkspaces();
          }
        },
        child: MaterialApp.router(
          theme: AppTheme.light,
          darkTheme: AppTheme.dark,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          routerConfig: createAppRouter(_authCubit),
        ),
      ),
    );
  }
}
