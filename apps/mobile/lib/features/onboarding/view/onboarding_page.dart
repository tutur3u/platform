import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/onboarding/widgets/onboarding_choice_slide.dart';
import 'package:mobile/features/onboarding/widgets/onboarding_slide.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';

class OnboardingPage extends StatefulWidget {
  const OnboardingPage({this.replay = false, super.key});

  final bool replay;

  @override
  State<OnboardingPage> createState() => _OnboardingPageState();
}

class _OnboardingPageState extends State<OnboardingPage> {
  static const _pageCount = 4;
  final _pageController = PageController();
  final Set<int> _selectedGoals = {};
  final Set<int> _selectedRoles = {};
  int _currentPage = 0;

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _completeOnboarding() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('has_seen_onboarding', true);
    if (_selectedRoles.isNotEmpty) {
      await prefs.setInt('connected_onboarding_role', _selectedRoles.first);
    }
    await prefs.setStringList(
      'connected_onboarding_goals',
      _selectedGoals.map((goal) => '$goal').toList(),
    );

    if (!mounted) return;
    if (widget.replay) {
      Navigator.of(context).pop();
    } else {
      context.go(Routes.login);
    }
  }

  void _toggleRole(int index) => setState(() {
    _selectedRoles
      ..clear()
      ..add(index);
  });

  void _toggleGoal(int index) => setState(() {
    if (!_selectedGoals.add(index)) _selectedGoals.remove(index);
  });

  void _nextPage() {
    if (_currentPage < _pageCount - 1) {
      unawaited(
        _pageController.nextPage(
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeInOut,
        ),
      );
    } else {
      unawaited(_completeOnboarding());
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final hPadding = ResponsivePadding.horizontal(context.deviceClass);

    return shad.Scaffold(
      child: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: hPadding),
                child: shad.GhostButton(
                  onPressed: () => unawaited(_completeOnboarding()),
                  child: Text(l10n.connectedOnboardingSkip),
                ),
              ),
            ),
            Expanded(
              child: PageView(
                controller: _pageController,
                onPageChanged: (index) => setState(() => _currentPage = index),
                children: [
                  OnboardingSlide(
                    title: l10n.connectedOnboardingEcosystemTitle,
                    subtitle: l10n.connectedOnboardingEcosystemSubtitle,
                    icon: LucideIcons.orbit,
                  ),
                  OnboardingChoiceSlide(
                    title: l10n.connectedOnboardingRoleTitle,
                    subtitle: l10n.connectedOnboardingRoleSubtitle,
                    options: [
                      l10n.connectedOnboardingRoleProfessional,
                      l10n.connectedOnboardingRoleStudent,
                      l10n.connectedOnboardingRoleFounder,
                      l10n.connectedOnboardingRoleExecutive,
                      l10n.connectedOnboardingRoleTeamLeader,
                    ],
                    selected: _selectedRoles,
                    onToggle: _toggleRole,
                  ),
                  OnboardingChoiceSlide(
                    title: l10n.connectedOnboardingGoalTitle,
                    subtitle: l10n.connectedOnboardingGoalSubtitle,
                    options: [
                      l10n.connectedOnboardingGoalFocus,
                      l10n.connectedOnboardingGoalCollaborate,
                      l10n.connectedOnboardingGoalOperate,
                      l10n.connectedOnboardingGoalLearn,
                      l10n.connectedOnboardingGoalBuild,
                    ],
                    selected: _selectedGoals,
                    onToggle: _toggleGoal,
                  ),
                  OnboardingSlide(
                    title: l10n.connectedOnboardingToolkitTitle,
                    subtitle: l10n.connectedOnboardingToolkitSubtitle,
                    icon: LucideIcons.layoutGrid,
                  ),
                ],
              ),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(hPadding, 0, hPadding, 32),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: List.generate(_pageCount, (index) {
                      return AnimatedContainer(
                        duration: const Duration(milliseconds: 300),
                        margin: const EdgeInsets.only(right: 8),
                        height: 8,
                        width: _currentPage == index ? 24 : 8,
                        decoration: BoxDecoration(
                          color: _currentPage == index
                              ? theme.colorScheme.primary
                              : theme.colorScheme.muted,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      );
                    }),
                  ),
                  shad.PrimaryButton(
                    onPressed: _nextPage,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _currentPage == _pageCount - 1
                              ? l10n.connectedOnboardingFinish
                              : l10n.commonNext,
                        ),
                        if (_currentPage != _pageCount - 1) ...[
                          const shad.Gap(8),
                          const Icon(LucideIcons.arrowRight, size: 16),
                        ],
                      ],
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
