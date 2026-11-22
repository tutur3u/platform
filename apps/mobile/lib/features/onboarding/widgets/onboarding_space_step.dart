import 'package:flutter/material.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/auth/widgets/auth_error_notice.dart';
import 'package:mobile/features/auth/widgets/auth_heading.dart';
import 'package:mobile/features/onboarding/data/onboarding_services.dart';
import 'package:mobile/features/onboarding/widgets/onboarding_choice_card.dart';
import 'package:mobile/l10n/l10n.dart';

/// Whether the account keeps its personal workspace or starts a team one.
enum OnboardingSpaceChoice { justMe, withTeam }

/// Step 2, "Set up your space": an open invite to join, then Just me or
/// With my team (which creates a workspace by name).
class OnboardingSpaceStep extends StatelessWidget {
  const OnboardingSpaceStep({
    required this.choice,
    required this.onChoice,
    required this.nameController,
    this.invite,
    this.inviteJoined = false,
    this.joining = false,
    this.onJoin,
    this.error,
    super.key,
  });

  final OnboardingSpaceChoice choice;
  final ValueChanged<OnboardingSpaceChoice> onChoice;
  final TextEditingController nameController;
  final OnboardingInvite? invite;
  final bool inviteJoined;
  final bool joining;
  final VoidCallback? onJoin;

  /// The join or create failure, including the workspace limit.
  final String? error;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const AppIllustration(AppIllustrationKind.spaceTiles, size: 100),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: AuthHeading(
                title: l10n.onboardingSpaceTitle,
                subtitle: Text(l10n.onboardingSpaceSubtitle),
                centered: false,
              ),
            ),
          ],
        ),
        const AppGap(AppSpacing.lg),
        if (invite case final open?) ...[
          _InviteCard(
            invite: open,
            joined: inviteJoined,
            joining: joining,
            onJoin: onJoin,
          ),
          const AppGap(AppSpacing.md),
        ],
        OnboardingChoiceCard(
          key: const ValueKey('onboarding-space-just-me'),
          title: l10n.onboardingJustMe,
          subtitle: l10n.onboardingJustMeSubtitle,
          selected: choice == OnboardingSpaceChoice.justMe,
          onTap: () => onChoice(OnboardingSpaceChoice.justMe),
        ),
        const AppGap(AppSpacing.md),
        OnboardingChoiceCard(
          key: const ValueKey('onboarding-space-team'),
          title: l10n.onboardingWithTeam,
          subtitle: l10n.onboardingWithTeamSubtitle,
          selected: choice == OnboardingSpaceChoice.withTeam,
          onTap: () => onChoice(OnboardingSpaceChoice.withTeam),
          expanded: AppTextField(
            key: const ValueKey('onboarding-workspace-name'),
            controller: nameController,
            label: l10n.onboardingWorkspaceName,
            placeholder: l10n.onboardingWorkspaceNamePlaceholder,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.done,
          ),
        ),
        if (error case final message?) ...[
          const AppGap(AppSpacing.md),
          AuthInlineError(message, centered: false),
        ],
        const AppGap(AppSpacing.md),
        Text(
          l10n.onboardingSpaceHelp,
          style: AppTokens.of(context).typography.caption.copyWith(
            color: AppTokens.of(context).colorScheme.mutedForeground,
          ),
        ),
      ],
    );
  }
}

class _InviteCard extends StatelessWidget {
  const _InviteCard({
    required this.invite,
    required this.joined,
    required this.joining,
    this.onJoin,
  });

  final OnboardingInvite invite;
  final bool joined;
  final bool joining;
  final VoidCallback? onJoin;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final green = AppIllustrationPalette.of(
      context,
      AppTone.success,
    ).hues.green;
    final name = invite.workspaceName.trim();
    final initials = name
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .take(2)
        .map((part) => part.characters.first.toUpperCase())
        .join();
    return Container(
      key: const ValueKey('onboarding-invite'),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: green.calm,
        borderRadius: BorderRadius.circular(tokens.shapes.card),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: c.card,
              borderRadius: BorderRadius.circular(AppRadius.sm),
            ),
            child: ExcludeSemantics(
              child: Text(
                initials.isEmpty ? '?' : initials,
                style: tokens.typography.uiCompact.copyWith(
                  color: green.ink,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: tokens.typography.ui.copyWith(
                    color: c.foreground,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  switch (invite.inviterName?.trim()) {
                    final String inviter when inviter.isNotEmpty =>
                      l10n.onboardingInvitedBy(inviter),
                    _ => l10n.onboardingInvitePending,
                  },
                  style: tokens.typography.caption.copyWith(
                    color: c.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          AppButton(
            key: const ValueKey('onboarding-invite-join'),
            size: AppButtonSize.small,
            loading: joining,
            leading: joined ? const Icon(LucideIcons.check) : null,
            onPressed: joined ? null : onJoin,
            child: Text(joined ? l10n.onboardingJoined : l10n.onboardingJoin),
          ),
        ],
      ),
    );
  }
}
