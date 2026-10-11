import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/notes/ai/notes_local_ai_cubit.dart';
import 'package:mobile/features/notes/ai/notes_local_ai_review.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

class NotesLocalAiHost extends StatefulWidget {
  const NotesLocalAiHost({
    required this.snapshot,
    required this.content,
    required this.changes,
    required this.onAppend,
    required this.child,
    this.createCubit,
    this.authEvents,
    super.key,
  });
  final NotesAiSnapshot? Function() snapshot;
  final String Function() content;
  final Listenable changes;
  final Future<bool> Function(NotesAiSnapshot, String, bool Function())
  onAppend;
  final Widget child;
  final NotesLocalAiCubit Function(NotesAiScope? Function())? createCubit;
  final Stream<Object?>? authEvents;

  @override
  State<NotesLocalAiHost> createState() => _NotesLocalAiHostState();
}

class _NotesLocalAiHostState extends State<NotesLocalAiHost>
    with WidgetsBindingObserver {
  late final NotesLocalAiCubit _ai =
      widget.createCubit?.call(_scope) ??
      NotesLocalAiCubit(currentScope: _scope);
  StreamSubscription<Object?>? _auth;
  GoRouter? _router;
  int _epoch = 0;
  bool _foreground = true;
  bool _reviewing = false;
  bool _appending = false;
  BuildContext? _sheet;
  NotesAiSnapshot? _observed;

  NotesAiScope? _scope() {
    if (!mounted ||
        !_foreground ||
        _router?.routeInformationProvider.value.uri.path != Routes.notes) {
      return null;
    }
    final note = widget.snapshot();
    if (note == null) return null;
    return (epoch: _epoch, note: note);
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    _foreground = lifecycle == null || lifecycle == AppLifecycleState.resumed;
    widget.changes.addListener(_contentChanged);
    _auth = (widget.authEvents ?? maybeSupabase?.auth.onAuthStateChange)
        ?.listen((_) => _invalidate());
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    context.watch<WorkspaceCubit>();
    final router = GoRouter.of(context);
    if (!identical(router, _router)) {
      _router?.routeInformationProvider.removeListener(_invalidate);
      _router = router;
      router.routeInformationProvider.addListener(_invalidate);
    }
    _syncSnapshot();
  }

  @override
  void didUpdateWidget(NotesLocalAiHost oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.changes, widget.changes)) {
      oldWidget.changes.removeListener(_contentChanged);
      widget.changes.addListener(_contentChanged);
    }
    _syncSnapshot();
  }

  void _syncSnapshot() {
    final current = widget.snapshot();
    if (_observed != current) {
      _observed = current;
      if (!_appending) _invalidate();
    }
  }

  void _contentChanged() {
    if (!_appending) _invalidate();
  }

  void _invalidate() {
    ++_epoch;
    unawaited(_ai.invalidate());
    final sheet = _sheet;
    _sheet = null;
    if (sheet != null && sheet.mounted) Navigator.of(sheet).pop();
  }

  Future<void> _review() async {
    final scope = _scope();
    if (scope == null || _reviewing) return;
    _reviewing = true;
    try {
      await showAdaptiveSheet<void>(
        context: context,
        builder: (sheet) {
          _sheet = sheet;
          return NotesLocalAiReview(
            cubit: _ai,
            input: widget.content(),
            onAppend: (receipt, output) async {
              if (receipt != _scope()) return false;
              bool current() {
                final scope = _scope();
                return scope != null &&
                    scope.epoch == receipt.epoch &&
                    scope.note.actor == receipt.note.actor &&
                    scope.note.workspace == receipt.note.workspace &&
                    scope.note.note == receipt.note.note &&
                    scope.note.selection == receipt.note.selection;
              }

              // The editor mutation invalidates the old preview intentionally;
              // the page captures a fresh save guard before touching content.
              _sheet = null;
              _appending = true;
              try {
                return await widget.onAppend(receipt.note, output, current);
              } finally {
                _appending = false;
              }
            },
          );
        },
      );
    } finally {
      _sheet = null;
      _reviewing = false;
      await _ai.invalidate();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    _invalidate();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    widget.changes.removeListener(_contentChanged);
    _router?.routeInformationProvider.removeListener(_invalidate);
    unawaited(_auth?.cancel());
    unawaited(_ai.close());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Align(
        alignment: AlignmentDirectional.centerEnd,
        child: TextButton.icon(
          onPressed: widget.snapshot() == null ? null : _review,
          icon: const Icon(Icons.auto_awesome_outlined),
          label: Text(context.l10n.notesLocalAiTitle),
        ),
      ),
      Expanded(child: widget.child),
    ],
  );
}
