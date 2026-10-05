import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_voice_capture_cubit.dart';
import 'package:mobile/features/notes/voice/notes_voice_controls.dart';
import 'package:mobile/features/notes/voice/notes_voice_cubit.dart';
import 'package:mobile/features/notes/voice/notes_voice_recorder.dart';
import 'package:mobile/features/notes/voice/notes_voice_review.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_dock_slot.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class NotesVoiceHost extends StatefulWidget {
  const NotesVoiceHost({
    required this.child,
    required this.enabled,
    required this.onSaved,
    this.cubit,
    super.key,
  });
  final Widget child;
  final bool enabled;
  final Future<void> Function() onSaved;
  final NotesVoiceCubit? cubit;
  @override
  State<NotesVoiceHost> createState() => _NotesVoiceHostState();
}

class _NotesVoiceHostState extends State<NotesVoiceHost>
    with WidgetsBindingObserver {
  late final NotesVoiceCubit _voice =
      widget.cubit ??
      NotesVoiceCubit(
        capture: AssistantVoiceCaptureCubit(
          recorder: NotesVoiceRecorder(),
          fileExtension: 'wav',
          fileName: 'voice-note.wav',
        ),
      );
  StreamSubscription<AuthState>? _auth;
  GoRouter? _router;
  BuildContext? _reviewContext;
  int _reviewToken = 0;
  String? _identity;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _auth = maybeSupabase?.auth.onAuthStateChange.listen((_) => _syncScope());
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final router = GoRouter.of(context);
    if (!identical(router, _router)) {
      _router?.routeInformationProvider.removeListener(_syncScope);
      _router = router;
      _router!.routeInformationProvider.addListener(_syncScope);
    }
    _syncScope();
  }

  @override
  void didUpdateWidget(NotesVoiceHost oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.enabled != widget.enabled) _syncScope();
  }

  void _syncScope() {
    if (!mounted) return;
    final active =
        widget.enabled &&
        _router?.routeInformationProvider.value.uri.path == Routes.notes;
    final actor = active ? currentCacheUserId() : null;
    final workspace = active
        ? context.read<WorkspaceCubit>().state.currentWorkspace?.id
        : null;
    final identity = actor == null || workspace == null
        ? null
        : '$actor/$workspace';
    if (identity != _identity) {
      _identity = identity;
      final review = _reviewContext;
      _reviewToken++;
      _reviewContext = null;
      if (review != null && review.mounted) Navigator.of(review).pop();
    }
    unawaited(_voice.setScope(actor, workspace));
  }

  void _message(String message) {
    if (mounted) {
      ScaffoldMessenger.maybeOf(
        context,
      )?.showSnackBar(SnackBar(content: Text(message)));
    }
  }

  Future<void> _review() async {
    final job = _voice.state.job;
    if (job == null || !job.canSave || _reviewContext != null) return;
    final identity = _identity;
    final reviewToken = ++_reviewToken;
    try {
      await showAdaptiveSheet<void>(
        context: context,
        builder: (sheetContext) {
          _reviewContext = sheetContext;
          return BlocBuilder<NotesVoiceCubit, NotesVoiceState>(
            bloc: _voice,
            builder: (context, state) {
              final visible = state.job;
              if (visible == null ||
                  visible.id != job.id ||
                  identity != _identity) {
                return AppDialogScaffold(
                  title: context.l10n.notesVoiceReview,
                  child: Text(context.l10n.notesVoiceUnavailable),
                );
              }
              return NotesVoiceReview(
                job: visible,
                saving: state.busy,
                onSave: () async {
                  final savedMessage = context.l10n.notesVoiceSaved;
                  final errorMessage = context.l10n.notesSaveError;
                  final saved = await _voice.saveReviewed(
                    context.l10n.notesUntitled,
                  );
                  if (!mounted || identity != _identity) return;
                  if (saved) {
                    if (sheetContext.mounted) Navigator.of(sheetContext).pop();
                    _message(savedMessage);
                    await widget.onSaved();
                  } else {
                    _message(errorMessage);
                  }
                },
              );
            },
          );
        },
      );
    } finally {
      if (reviewToken == _reviewToken) _reviewContext = null;
    }
  }

  Future<void> _discard() async {
    if (_voice.capture.state.visible) {
      await _voice.discard();
      return;
    }
    final identity = _identity;
    final confirmed = await showAdaptiveSheet<bool>(
      context: context,
      builder: (sheet) => AppDialogScaffold(
        title: sheet.l10n.notesVoiceDelete,
        actions: [
          TextButton(
            onPressed: () => Navigator.of(sheet).pop(false),
            child: Text(MaterialLocalizations.of(sheet).cancelButtonLabel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(sheet).pop(true),
            child: Text(sheet.l10n.notesVoiceDelete),
          ),
        ],
        child: Text(sheet.l10n.notesVoiceProposalNotice),
      ),
    );
    if (confirmed == true && mounted && identity == _identity) {
      await _voice.discard();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _voice.setActive(active: state == AppLifecycleState.resumed);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _router?.routeInformationProvider.removeListener(_syncScope);
    unawaited(_auth?.cancel());
    if (widget.cubit == null) unawaited(_voice.close());
    super.dispose();
  }

  @override
  Widget build(
    BuildContext context,
  ) => BlocListener<WorkspaceCubit, WorkspaceState>(
    listenWhen: (previous, next) =>
        previous.currentWorkspace?.id != next.currentWorkspace?.id,
    listener: (_, _) => _syncScope(),
    child: BlocListener<AssistantVoiceCaptureCubit, AssistantVoiceCaptureState>(
      bloc: _voice.capture,
      listenWhen: (previous, next) =>
          previous.error != next.error && next.error != null,
      listener: (context, state) => _message(
        state.error == AssistantVoiceCaptureError.permission
            ? context.l10n.notesVoicePermission
            : context.l10n.notesVoiceRecordingError,
      ),
      child: BlocBuilder<NotesVoiceCubit, NotesVoiceState>(
        bloc: _voice,
        builder: (context, state) =>
            BlocBuilder<AssistantVoiceCaptureCubit, AssistantVoiceCaptureState>(
              bloc: _voice.capture,
              builder: (context, capture) {
                final l10n = context.l10n;
                final job = state.job;
                final composing =
                    capture.visible || state.busy || job?.processing == true;
                return Stack(
                  children: [
                    widget.child,
                    ShellChromeActions(
                      ownerId: 'notes-voice-actions',
                      locations: const {Routes.notes},
                      actions: [
                        if (widget.enabled && !composing) ...[
                          ShellActionSpec(
                            id: 'notes-voice-record',
                            icon: Icons.mic_none_rounded,
                            inDock: true,
                            tooltip: job == null
                                ? l10n.notesVoiceRecord
                                : l10n.notesVoiceNew,
                            enabled: _identity != null,
                            onPressed: () => unawaited(_voice.start()),
                          ),
                          if (job?.canSave == true)
                            ShellActionSpec(
                              id: 'notes-voice-review',
                              icon: Icons.auto_awesome_outlined,
                              inDock: true,
                              tooltip: l10n.notesVoiceReview,
                              onPressed: () => unawaited(_review()),
                            ),
                          if (job != null && !job.processing)
                            ShellActionSpec(
                              id: 'notes-voice-delete',
                              icon: Icons.delete_outline_rounded,
                              tooltip: l10n.notesVoiceDelete,
                              onPressed: () => unawaited(_discard()),
                            ),
                          if (state.canResubmit)
                            ShellActionSpec(
                              id: 'notes-voice-retry',
                              icon: Icons.refresh_rounded,
                              tooltip: l10n.commonRetry,
                              onPressed: () => unawaited(_voice.analyze()),
                            ),
                          if (state.unavailable && job != null)
                            ShellActionSpec(
                              id: 'notes-voice-refresh',
                              icon: Icons.sync_rounded,
                              tooltip: l10n.commonRetry,
                              onPressed: () => unawaited(_voice.refresh()),
                            ),
                        ],
                      ],
                    ),
                    if (widget.enabled && composing)
                      ShellDockPublisher(
                        slot: ShellDockSlot(
                          location: Routes.notes,
                          workspaceId: context
                              .read<WorkspaceCubit>()
                              .state
                              .currentWorkspace
                              ?.id,
                          composing: true,
                          content: capture.visible
                              ? NotesVoiceControls(
                                  capture: _voice.capture,
                                  state: capture,
                                  onCancel: _voice.discard,
                                )
                              : Semantics(
                                  liveRegion: true,
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 16,
                                    ),
                                    child: Text(
                                      state.unavailable
                                          ? l10n.notesVoiceUnavailable
                                          : l10n.notesVoiceProcessing,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ),
                          primary: IconButton(
                            tooltip: state.unavailable
                                ? l10n.commonRetry
                                : '${l10n.notesVoiceAnalyze}. '
                                      '${l10n.notesVoiceCredits}',
                            onPressed: state.unavailable && !capture.visible
                                ? () => unawaited(_voice.refresh())
                                : capture.paused && !state.busy
                                ? () => unawaited(_voice.analyze())
                                : null,
                            icon: Icon(
                              state.unavailable
                                  ? Icons.refresh_rounded
                                  : state.busy || job?.processing == true
                                  ? Icons.hourglass_top_rounded
                                  : Icons.auto_awesome_outlined,
                            ),
                          ),
                        ),
                      ),
                    if (widget.enabled &&
                        !composing &&
                        (state.unavailable ||
                            job?.status == 'review_required' ||
                            job?.retryable == true))
                      Positioned(
                        left: 16,
                        right: 16,
                        bottom: MediaQuery.paddingOf(context).bottom + 16,
                        child: IgnorePointer(
                          child: Semantics(
                            liveRegion: true,
                            child: Text(
                              job?.status == 'review_required'
                                  ? l10n.notesVoiceReviewRequired
                                  : job?.retryable == true
                                  ? l10n.notesVoiceFailed
                                  : l10n.notesVoiceUnavailable,
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ),
                        ),
                      ),
                  ],
                );
              },
            ),
      ),
    ),
  );
}
