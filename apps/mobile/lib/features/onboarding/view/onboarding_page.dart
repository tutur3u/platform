import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/audience_mode/audience_mode.dart';
import 'package:mobile/features/audience_mode/audience_mode_cubit.dart';
import 'package:mobile/features/onboarding/data/onboarding_gate.dart';
import 'package:mobile/features/onboarding/data/onboarding_interests.dart';
import 'package:mobile/features/onboarding/data/onboarding_services.dart';
import 'package:mobile/features/onboarding/view/onboarding_profile_controller.dart';
import 'package:mobile/features/onboarding/widgets/onboarding_done_step.dart';
import 'package:mobile/features/onboarding/widgets/onboarding_frame.dart';
import 'package:mobile/features/onboarding/widgets/onboarding_interests_step.dart';
import 'package:mobile/features/onboarding/widgets/onboarding_space_step.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// The first-run onboarding: three skippable steps and an "All set" screen.
///
/// It opens above the shell once per account after its first sign-in on
/// this device (see [OnboardingGate]) and from Settings as a replay. Every
/// step and the whole flow can be skipped; nothing here blocks the app.
class OnboardingPage extends StatefulWidget {
  const OnboardingPage({
    this.replay = false,
    this.returnTo = Routes.home,
    this.services,
    this.gate,
    super.key,
  });

  /// Opened from Settings: closes back to it and records no outcome.
  final bool replay;

  /// Where the first-run flow continues once it is done or skipped.
  final String returnTo;
  final OnboardingServices? services;
  final OnboardingGate? gate;

  @override
  State<OnboardingPage> createState() => _OnboardingPageState();
}

class _OnboardingPageState extends State<OnboardingPage>
    with OnboardingProfileController<OnboardingPage> {
  static const _steps = 3;

  late final OnboardingServices _services =
      widget.services ?? DefaultOnboardingServices();
  late final OnboardingGate _gate = widget.gate ?? OnboardingGate.instance;
  final TextEditingController _workspaceName = TextEditingController();
  final Set<OnboardingInterest> _interests = {};
  var _step = 0;
  var _busy = false;
  OnboardingSpaceChoice _space = OnboardingSpaceChoice.justMe;
  OnboardingInvite? _invite;
  var _inviteJoined = false;
  var _joining = false;
  String? _spaceError;
  String? _readyWorkspace;

  @override
  OnboardingServices get services => _services;

  @override
  void initState() {
    super.initState();
    initProfile();
    unawaited(_loadInvite());
  }

  @override
  void dispose() {
    _workspaceName.dispose();
    disposeProfile();
    super.dispose();
  }

  Future<void> _loadInvite() async {
    final user = userId;
    if (user == null) return;
    try {
      final invite = await _services.pendingInvite(user);
      if (mounted && userId == user) setState(() => _invite = invite);
    } on Object {
      // The card is optional; Notifications still lists the invite.
    }
  }

  Future<void> _join() async {
    final invite = _invite;
    final user = userId;
    if (invite == null || user == null || _joining) return;
    setState(() {
      _joining = true;
      _spaceError = null;
    });
    final workspaces = context.read<WorkspaceCubit>();
    try {
      await _services.acceptInvite(user, invite);
      await workspaces.loadWorkspaces(forceRefresh: true);
      final joined = workspaces.state.workspaces
          .where((workspace) => workspace.id == invite.workspaceId)
          .firstOrNull;
      if (joined != null) await workspaces.selectWorkspace(joined);
      _readyWorkspace = invite.workspaceName;
      _inviteJoined = true;
    } on Object {
      _spaceError = mounted ? context.l10n.onboardingJoinFailed : null;
    }
    if (mounted) setState(() => _joining = false);
  }

  /// Creates the team workspace; true when the step may advance.
  Future<bool> _createWorkspace() async {
    final l10n = context.l10n;
    final name = _workspaceName.text.trim();
    if (name.isEmpty) {
      setState(() => _spaceError = l10n.workspaceCreateNameRequired);
      return false;
    }
    final workspaces = context.read<WorkspaceCubit>();
    if (workspaces.state.limits?.canCreate == false) {
      setState(() => _spaceError = l10n.workspaceCreateLimitReached);
      return false;
    }
    try {
      final result = await workspaces.createWorkspace(name);
      await workspaces.selectWorkspace(result.workspace);
      _readyWorkspace = result.workspace.name ?? name;
      return true;
    } on ApiException catch (error) {
      final limited = workspaces.state.limits?.canCreate == false;
      if (mounted) {
        setState(
          () => _spaceError = limited
              ? l10n.workspaceCreateLimitReached
              : (error.message.isEmpty
                    ? l10n.workspaceCreateError
                    : error.message),
        );
      }
    } on Object {
      if (mounted) setState(() => _spaceError = l10n.workspaceCreateError);
    }
    return false;
  }

  /// Saves the interests, maps Teach or learn to the Education mode and
  /// mirrors the goals to the web onboarding progress.
  Future<void> _saveInterests() async {
    final user = userId;
    if (user == null) return;
    final cubit = context.read<AudienceModeCubit?>();
    try {
      await OnboardingChoices.save(user, _interests);
    } on Object {
      // Local choices only order suggestions; never block on them.
    }
    final mode = _interests.contains(OnboardingInterest.education)
        ? AudienceMode.education
        : AudienceMode.general;
    if (cubit != null) {
      unawaited(() async {
        try {
          await cubit.setAccountMode(mode);
        } on Object {
          // Settings → Mode stays available.
        }
      }());
    }
    final goals = OnboardingInterest.goalsFor(_interests);
    if (goals.isNotEmpty) unawaited(_services.syncGoals(user, goals));
  }

  Future<void> _continue() async {
    if (_busy) return;
    setState(() => _busy = true);
    var advance = true;
    if (_step == 0) {
      advance = await saveProfileName();
    } else if (_step == 1) {
      setState(() => _spaceError = null);
      if (_space == OnboardingSpaceChoice.withTeam) {
        advance = await _createWorkspace();
      }
    } else if (_step == 2) {
      await _saveInterests();
      await _record(OnboardingOutcome.completed);
    }
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (advance) _step++;
    });
  }

  Future<void> _record(OnboardingOutcome outcome) async {
    final user = userId;
    if (widget.replay || user == null) return;
    await _gate.record(user, outcome);
  }

  Future<void> _skip() =>
      _leave(widget.returnTo, outcome: OnboardingOutcome.skipped);

  /// Leaves the flow for [target]. The first run records [outcome] first;
  /// the router is read before that, since recording can close this page.
  Future<void> _leave(
    String target, {
    OnboardingOutcome outcome = OnboardingOutcome.completed,
  }) async {
    final router = GoRouter.maybeOf(context);
    if (widget.replay) {
      Navigator.of(context).pop();
      if (target != widget.returnTo) router?.go(target);
      return;
    }
    await _record(outcome);
    router?.go(target);
  }

  void _next(OnboardingNextStep step) => unawaited(
    _leave(switch (step) {
      OnboardingNextStep.task => Routes.tasks,
      OnboardingNextStep.calendar => '${Routes.settingsApps}/calendar',
      OnboardingNextStep.notifications => Routes.settingsReminders,
    }),
  );

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final done = _step >= _steps;
    final page = switch (_step) {
      0 => buildProfileStep(context),
      1 => OnboardingSpaceStep(
        choice: _space,
        onChoice: (choice) => setState(() {
          _space = choice;
          _spaceError = null;
        }),
        nameController: _workspaceName,
        invite: _invite,
        inviteJoined: _inviteJoined,
        joining: _joining,
        onJoin: () => unawaited(_join()),
        error: _spaceError,
      ),
      2 => OnboardingInterestsStep(
        selected: _interests,
        onToggle: (interest) => setState(() {
          if (!_interests.remove(interest)) _interests.add(interest);
        }),
      ),
      _ => OnboardingDoneStep(
        name: displayName,
        workspaceName: _readyWorkspace,
        onNext: _next,
      ),
    };
    return PopScope(
      canPop: _step == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        if (done) {
          unawaited(_leave(widget.returnTo));
        } else {
          setState(() => _step--);
        }
      },
      child: OnboardingFrame(
        step: done ? null : _step + 1,
        onSkip: _busy ? null : () => unawaited(_skip()),
        action: AppButton(
          key: const ValueKey('onboarding-primary'),
          size: AppButtonSize.large,
          loading: _busy,
          onPressed: done
              ? () => unawaited(_leave(widget.returnTo))
              : () => unawaited(_continue()),
          child: Text(switch (_step) {
            2 => l10n.onboardingFinish,
            3 => l10n.onboardingOpenApp,
            _ => l10n.onboardingContinue,
          }),
        ),
        child: AnimatedSwitcher(
          duration: MediaQuery.disableAnimationsOf(context)
              ? Duration.zero
              : const Duration(milliseconds: 220),
          child: KeyedSubtree(key: ValueKey(_step), child: page),
        ),
      ),
    );
  }
}
