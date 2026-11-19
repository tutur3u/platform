import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/finance/finance_permissions.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

class FinanceSheetSession extends ChangeNotifier {
  FinanceSheetSession(this._context)
    : _workspace = _context.read<WorkspaceCubit>(),
      _actor = _context.read<AuthCubit?>(),
      _preferences = _context.read<FinancePreferencesCubit?>();

  final BuildContext _context;
  final WorkspaceCubit _workspace;
  final AuthCubit? _actor;
  final FinancePreferencesCubit? _preferences;
  late final String? _workspaceId = _workspace.state.currentWorkspace?.id;
  late final String? _actorId = _actor?.state.user?.id;
  bool _ended = false;

  String get workspaceId => _workspaceId!;
  bool get active =>
      !_ended &&
      _context.mounted &&
      _workspaceId != null &&
      _workspace.state.currentWorkspace?.id == _workspaceId &&
      _actor?.state.user?.id == _actorId;

  bool allows(String permission) =>
      active && canManageFinance(_context, permission, listen: false);

  Future<T?> open<T>(
    BuildContext context,
    WidgetBuilder builder, {
    bool large = true,
  }) => showAppSheet<T>(
    context: context,
    size: large ? AppSheetSize.large : AppSheetSize.medium,
    builder: (context) => ListenableBuilder(
      listenable: this,
      builder: (context, _) {
        if (!active) {
          return AppSheetScaffold(
            title: context.l10n.navFinance,
            child: AppStateMessage.inline(
              icon: LucideIcons.circleAlert,
              title: context.l10n.commonSomethingWentWrong,
            ),
          );
        }
        final preferences = _preferences;
        return preferences == null
            ? Builder(builder: builder)
            : BlocProvider.value(
                value: preferences,
                child: Builder(builder: builder),
              );
      },
    ),
  );

  Future<void> run(WidgetBuilder builder) async {
    if (!active) {
      dispose();
      return;
    }
    void changed() {
      if (_ended || active) return;
      _ended = true;
      notifyListeners();
    }

    final workspaceChanges = _workspace.stream.listen((_) => changed());
    final actorChanges = _actor?.stream.listen((_) => changed());
    try {
      await open<void>(_context, builder);
    } finally {
      _ended = true;
      await workspaceChanges.cancel();
      await actorChanges?.cancel();
      // The route may retain its exit animation after the result resolves.
      WidgetsBinding.instance.addPostFrameCallback((_) => dispose());
    }
  }
}
