import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/repositories/auth_repository.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_thread_reply_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_owner_live.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_reply_attachment.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_reply_step_up.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_repository.dart';
import 'package:mobile/features/mastermind/projects/cubit/thread_cubit.dart';
import 'package:mobile/features/mastermind/projects/data/projects_live.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';
import 'package:mobile/features/mastermind/projects/view/posted_reply_bubble.dart';
import 'package:mobile/features/mastermind/projects/view/project_thread_transcript.dart';
import 'package:mobile/features/mastermind/projects/view/thread_attachment_picker.dart';
import 'package:mobile/features/mastermind/projects/view/thread_composer.dart';
import 'package:mobile/features/mastermind/projects/view/thread_replies.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_runtime.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind/work/thread/:threadId`: one thread's recent messages and a
/// steered composer with its own Back control.
class ProjectThreadPage extends StatefulWidget {
  const ProjectThreadPage({
    required this.machine,
    required this.threadId,
    this.repository,
    this.attachmentPicker = pickThreadAttachment,
    this.stepUp,
    this.live = true,
    super.key,
  });

  final ProjectsMachine machine;
  final String threadId;
  final ProjectsRepository? repository;
  final Future<FleetReplyAttachment?> Function(int remainingBytes)
  attachmentPicker;

  /// Renews the second factor for a reply; built over the app's
  /// [AuthRepository] when not given.
  final FleetReplyStepUp? stepUp;
  final bool live;

  @override
  State<ProjectThreadPage> createState() => _ProjectThreadPageState();
}

class _ProjectThreadPageState extends State<ProjectThreadPage> {
  late final ProjectsRepository _repository =
      widget.repository ??
      sharedProjectsRepository(
        cache: context.read<MastermindRuntime?>()?.threadCache,
        userId: context.read<MastermindRuntime?>()?.userId,
      );
  late final ThreadCubit _cubit = ThreadCubit(
    repository: _repository,
    machine: widget.machine,
    threadId: widget.threadId,
  );
  late final ThreadReplies _replies = ThreadReplies(
    create: () => FleetThreadReplyCubit(
      source: _repository.replySource,
      machineId: widget.machine.machineId,
      threadId: widget.threadId,
      environmentId: widget.machine.environmentId,
      userId: _ownerId,
    ),
    onPhase: _onReply,
  );

  /// Over the app's own [AuthRepository]; null where none is provided.
  late final FleetReplyStepUp? _stepUp =
      widget.stepUp ??
      switch (context.read<AuthRepository?>()) {
        final auth? => FleetReplyStepUp(auth: auth),
        null => null,
      };
  late final String? _ownerId = context
      .read<MastermindRuntime?>()
      ?.userId
      ?.call();
  final _draft = TextEditingController();
  final _files = <FleetReplyAttachment>[];
  bool _picking = false;

  bool get _attachmentsAllowed =>
      widget.machine.environmentId == null &&
      _ownerId != null &&
      _repository.replySource is FleetThreadAttachmentSource;

  Future<void> _pickAttachment() async {
    if (_picking || !_replies.composerEnabled || !_attachmentsAllowed) return;
    setState(() => _picking = true);
    try {
      final remaining = _files.fold(
        fleetReplyMaxAttachmentBytes,
        (remaining, file) => remaining - file.bytes.length,
      );
      final file = await widget.attachmentPicker(remaining);
      if (!mounted ||
          file == null ||
          _ownerId != context.read<MastermindRuntime?>()?.userId?.call()) {
        return;
      }
      setState(() => _files.add(file));
    } on Object catch (error) {
      if (!mounted) return;
      final l10n = context.l10n;
      final message = switch (error) {
        ThreadAttachmentException(problem: ThreadAttachmentProblem.tooLarge) =>
          l10n.mastermindTranscriptAttachmentLimit,
        ThreadAttachmentException(
          problem: ThreadAttachmentProblem.unsupported,
        ) =>
          l10n.mastermindTranscriptAttachmentUnsupported,
        _ => l10n.mastermindTranscriptAttachmentUnreadable,
      };
      showAppToast(
        context,
        message: message,
        variant: AppAlertVariant.destructive,
      );
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  StreamSubscription<FleetOwnerFrame>? _frames;

  @override
  void initState() {
    super.initState();
    unawaited(_cubit.load());
    if (widget.live) {
      _frames = ProjectsLive.shared.frames.listen(_onFrame);
      ProjectsLive.shared.hold(this);
    }
  }

  void _onFrame(FleetOwnerFrame frame) {
    final threads = isThreadsPoke(frame, widget.machine.machineId);
    if (threads) unawaited(_cubit.load());
    if (threads || frame.kind == FleetOwnerFrameKind.receipt) {
      _replies.checkHeld();
    }
  }

  /// The composer's reply, held or taken, clears the field; one that failed
  /// keeps its text, so Send resends it under the same key.
  void _onReply(FleetReplyStatus status, {required bool current}) {
    if (current &&
        (status.phase == FleetReplyPhase.sent ||
            status.phase == FleetReplyPhase.delivered)) {
      _draft.clear();
      _files.clear();
    }
    if (status.phase == FleetReplyPhase.delivered) unawaited(_cubit.load());
  }

  @override
  void dispose() {
    unawaited(_frames?.cancel());
    if (widget.live) ProjectsLive.shared.release(this);
    unawaited(_cubit.close());
    _replies.dispose();
    _draft.dispose();
    super.dispose();
  }

  Future<void> _back() async {
    final router = GoRouter.of(context);
    if (router.canPop()) {
      router.pop();
    } else {
      router.go(Routes.mastermindWork);
    }
  }

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.path;
    final safeBottom = MediaQuery.viewPaddingOf(context).bottom;
    final keyboard = MediaQuery.viewInsetsOf(context).bottom;
    final composerBottom =
        (keyboard > safeBottom ? keyboard : safeBottom) + AppSpacing.sm;
    return ListenableBuilder(
      listenable: _replies,
      builder: (context, _) => BlocBuilder<ThreadCubit, ThreadState>(
        bloc: _cubit,
        builder: (context, state) => Column(
          children: [
            ShellChromeActions(
              ownerId: 'mastermind-project-thread',
              locations: {location},
              onBack: _back,
            ),
            if (state.thread case final thread?)
              ShellTitleOverride(
                ownerId: 'mastermind-project-thread',
                locations: {location},
                title: thread.title,
                showLeadingBrand: false,
              ),
            Expanded(
              child: ProjectThreadTranscript(
                state: state,
                cubit: _cubit,
                machine: widget.machine,
                bottomGap: AppSpacing.sm,
                replies: [
                  for (final reply in _replies.replies)
                    BlocBuilder<FleetThreadReplyCubit, FleetReplyStatus>(
                      bloc: reply,
                      builder: (context, status) => PostedReplyBubble(
                        status: status,
                        attachmentNames: reply.attachmentNames,
                        onRetry: () => unawaited(reply.retry()),
                        stepUp: _stepUp,
                        onWriteAnother: _replies.isCurrent(reply)
                            ? _replies.writeAnother
                            : null,
                      ),
                    ),
                ],
              ),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(
                AppSpacing.md,
                0,
                AppSpacing.md,
                composerBottom,
              ),
              child: Row(
                children: [
                  BackButton(onPressed: () => unawaited(_back())),
                  Expanded(
                    child: ThreadComposer(
                      controller: _draft,
                      enabled: _replies.composerEnabled && !_picking,
                      attachments: _files,
                      onPick:
                          _attachmentsAllowed &&
                              _files.length < fleetReplyMaxAttachments
                          ? () => unawaited(_pickAttachment())
                          : null,
                      onRemove: (file) => setState(() => _files.remove(file)),
                      onSend: (text) =>
                          _replies.send(text, attachments: _files),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
