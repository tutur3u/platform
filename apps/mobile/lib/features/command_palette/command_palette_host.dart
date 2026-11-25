import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/app_router.dart';
import 'package:mobile/core/router/router_location.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/account_overlay_scope.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/command_palette/palette_catalog.dart';
import 'package:mobile/features/command_palette/palette_cubit.dart';
import 'package:mobile/features/command_palette/palette_entry.dart';
import 'package:mobile/features/command_palette/palette_repository.dart';
import 'package:mobile/features/command_palette/palette_shortcut_help.dart';
import 'package:mobile/features/command_palette/palette_shortcuts.dart';
import 'package:mobile/features/command_palette/palette_view.dart';
import 'package:mobile/features/notes/note_repository.dart';
import 'package:mobile/features/notes/notes_offline_preparation.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

typedef _Scope = ({String actor, String workspace, Object? epoch});

class PaletteHost extends StatefulWidget {
  const PaletteHost(this.router, this.tasks, this.child, {super.key});

  final GoRouter router;
  final TaskRepository tasks;
  final Widget child;

  @override
  State<PaletteHost> createState() => _PaletteHostState();
}

class _PaletteHostState extends State<PaletteHost> {
  GlobalKey? _overlayKey;
  PaletteShortcut? _overlayKind;
  bool _launchingAction = false;

  String get _location => widget.router.currentMatchedLocation;
  bool get _inMira =>
      _location == Routes.assistant ||
      _location == Routes.assistantConversations;

  BuildContext? get _navigatorContext =>
      widget.router.routerDelegate.navigatorKey.currentState?.overlay?.context;

  _Scope? get _scope {
    if (!mounted) return null;
    final auth = context.read<AuthCubit>().state;
    final actor = auth.user?.id;
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    final lock = context.read<AppLockCubit>().state;
    if (auth.status != AuthStatus.authenticated ||
        actor == null ||
        workspace == null ||
        !lock.hasLoaded ||
        lock.locked ||
        isAppLockExcludedRoute(_location) ||
        _location == Routes.workspaceSelect ||
        _location == Routes.onboarding ||
        _location == Routes.telemetryConsent) {
      return null;
    }
    return (
      actor: actor,
      workspace: workspace,
      epoch: AccountOverlayScope.epochOf(context),
    );
  }

  void _closeOverlay({bool removing = false}) {
    final content = _overlayKey?.currentContext;
    if (content == null) return;
    final route = ModalRoute.of(content);
    final navigator = route?.navigator;
    if (route == null || navigator == null || !route.isActive) return;
    if (removing) {
      navigator.removeRoute(route);
    } else if (route.isCurrent) {
      navigator.pop();
    }
  }

  void _invoke(PaletteShortcut shortcut) {
    final scope = _scope;
    final navigatorContext = _navigatorContext;
    if (scope == null || navigatorContext == null) return;
    if (_overlayKey != null) {
      if (shortcut == _overlayKind) _closeOverlay();
      return;
    }
    final focusedContext = FocusManager.instance.primaryFocus?.context;
    final chrome = context.read<ShellChromeActionsCubit>().state;
    if ((focusedContext != null &&
            ModalRoute.of(focusedContext) is PopupRoute<dynamic>) ||
        chrome.topmostModalOwner != null ||
        _launchingAction) {
      return;
    }
    if (shortcut.tab case final tab?) {
      widget.router.go(tab.route);
      return;
    }
    switch (shortcut) {
      case PaletteShortcut.palette:
        unawaited(_openPalette(navigatorContext, scope));
      case PaletteShortcut.settings:
        widget.router.go(Routes.settings);
      case PaletteShortcut.help:
        unawaited(_showHelp(navigatorContext));
      case PaletteShortcut.newItem:
        unawaited(_create(chat: _inMira, scope: scope));
      default:
        break;
    }
  }

  Future<void> _showHelp(BuildContext navigatorContext) async {
    final key = GlobalKey();
    _overlayKey = key;
    _overlayKind = PaletteShortcut.help;
    try {
      await showPaletteOverlay<void>(
        navigatorContext,
        (_) => PaletteShortcutHelp(key: key),
      );
    } finally {
      _overlayKey = null;
      _overlayKind = null;
    }
  }

  Future<void> _openPalette(BuildContext navigatorContext, _Scope scope) async {
    final key = GlobalKey();
    final recents = DevicePaletteRecents(scope.actor);
    final inMira = _inMira;
    final api = ApiClient(expectedUserId: scope.actor);
    _overlayKey = key;
    _overlayKind = PaletteShortcut.palette;
    PaletteEntry? selected;
    try {
      selected = await showPaletteOverlay<PaletteEntry>(
        navigatorContext,
        (context) {
          final apps = AppRegistry.modules(context);
          final notesVisible = apps.any((app) => app.id == 'notes');
          return BlocProvider(
            create: (_) {
              final cubit = PaletteCubit(
                repository: WorkspacePaletteRepository(
                  workspaceId: scope.workspace,
                  actor: scope.actor,
                  isCurrent: () => _overlayKey == key && _scope == scope,
                  tasks: widget.tasks,
                  notes: notesVisible ? NoteRepository(apiClient: api) : null,
                  prepareNotes: notesVisible
                      ? NotesOfflinePreparation(api: api)
                      : null,
                ),
                recents: recents,
              );
              unawaited(cubit.loadRecents());
              return cubit;
            },
            child: CommandPaletteView(
              key: key,
              commands: paletteCatalog(context, apps, inMira: inMira),
              showNotes: notesVisible,
            ),
          );
        },
      );
    } finally {
      api.dispose();
      _overlayKey = null;
      _overlayKind = null;
    }
    if (selected == null || _scope != scope) return;
    if (selected.group != PaletteGroup.search) {
      unawaited(PaletteCubit.remember(recents, selected.id));
    }
    await _runEntry(selected, scope);
  }

  Future<void> _runEntry(PaletteEntry entry, _Scope scope) async {
    final navigatorContext = _navigatorContext;
    if (navigatorContext == null || _scope != scope) return;
    if (entry.route case final route?) {
      if (AppRegistry.moduleById(entry.appId) case final module?) {
        unawaited(context.read<AppTabCubit>().select(module));
      }
      widget.router.go(route);
      return;
    }
    switch (entry.action!) {
      case PaletteAction.newChat:
        await _create(chat: true, scope: scope);
      case PaletteAction.newTask:
        await _create(chat: false, scope: scope);
      case PaletteAction.toggleTheme:
        final next = Theme.of(context).brightness == Brightness.dark
            ? 'light'
            : 'dark';
        final saved = await context.read<ThemeCubit>().setThemeMode(
          ThemeCubit.parseThemeMode(next),
          isCurrent: () => _scope == scope,
        );
        if (!saved && _scope == scope) _showUnavailable();
      case PaletteAction.switchWorkspace:
        await showWorkspacePicker(navigatorContext);
      case PaletteAction.shortcuts:
        await _showHelp(navigatorContext);
    }
  }

  Future<void> _create({required bool chat, required _Scope scope}) async {
    final onBoard = Routes.isTaskBoardDetailLocation(_location);
    final target = chat
        ? (_inMira ? _location : Routes.assistant)
        : (onBoard ? _location : Routes.taskAssigned);
    final actionId = switch (target) {
      Routes.assistant => 'assistant-new-conversation',
      Routes.assistantConversations => 'assistant-history-new',
      _ when onBoard => 'task-board-detail-create',
      _ => 'my-task-create',
    };
    if (_launchingAction) return;
    _launchingAction = true;
    try {
      if (_location != target) {
        widget.router.go(target);
      }
      await SchedulerBinding.instance.endOfFrame;
      if (_scope != scope || _location != target) return;
      final action = context
          .read<ShellChromeActionsCubit>()
          .state
          .resolveForLocation(target)
          .where((action) => action.id == actionId && action.enabled)
          .firstOrNull
          ?.onPressed;
      if (action == null) {
        _showUnavailable();
      } else {
        action();
      }
    } finally {
      _launchingAction = false;
    }
  }

  void _showUnavailable() {
    showAppToast(
      context,
      message: context.l10n.commandPaletteActionUnavailable,
    );
  }

  @override
  Widget build(BuildContext context) => MultiBlocListener(
    listeners: [
      BlocListener<AuthCubit, AuthState>(
        listenWhen: (before, after) =>
            before.user?.id != after.user?.id ||
            before.status != after.status,
        listener: (_, _) => _closeOverlay(removing: true),
      ),
      BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (before, after) =>
            before.currentWorkspace?.id != after.currentWorkspace?.id,
        listener: (_, _) => _closeOverlay(removing: true),
      ),
      BlocListener<AppLockCubit, AppLockState>(
        listenWhen: (_, after) => after.locked,
        listener: (_, _) => _closeOverlay(removing: true),
      ),
    ],
    child: PaletteShortcuts(onShortcut: _invoke, child: widget.child),
  );
}
