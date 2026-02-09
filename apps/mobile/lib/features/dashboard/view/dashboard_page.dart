import 'package:flutter/material.dart' hide Scaffold, AppBar, Card;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class DashboardPage extends StatelessWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return shad.Scaffold(
      headers: [
        shad.AppBar(
          title: BlocBuilder<WorkspaceCubit, WorkspaceState>(
            buildWhen: (prev, curr) =>
                prev.currentWorkspace != curr.currentWorkspace,
            builder: (context, state) {
              return shad.GhostButton(
                onPressed: () => showWorkspacePickerSheet(context),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Flexible(
                      child: Text(
                        state.currentWorkspace?.name ?? l10n.appTitle,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const shad.Gap(4),
                    const Icon(Icons.arrow_drop_down, size: 20),
                  ],
                ),
              );
            },
          ),
        ),
      ],
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l10n.dashboardGreeting,
                style: shad.Theme.of(context).typography.h3,
              ),
              const shad.Gap(24),
              Text(
                l10n.dashboardQuickActions,
                style: shad.Theme.of(context).typography.textLarge,
              ),
              const shad.Gap(12),
              Expanded(
                child: GridView.count(
                  crossAxisCount: 2,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  children: [
                    _QuickActionCard(
                      icon: Icons.check_box_outlined,
                      label: l10n.navTasks,
                      onTap: () {},
                    ),
                    _QuickActionCard(
                      icon: Icons.calendar_today_outlined,
                      label: l10n.navCalendar,
                      onTap: () {},
                    ),
                    _QuickActionCard(
                      icon: Icons.account_balance_wallet_outlined,
                      label: l10n.navFinance,
                      onTap: () {},
                    ),
                    _QuickActionCard(
                      icon: Icons.timer_outlined,
                      label: l10n.navTimer,
                      onTap: () {},
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuickActionCard extends StatelessWidget {
  const _QuickActionCard({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return shad.CardButton(
      onPressed: onTap,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 32),
          const shad.Gap(8),
          Text(
            label,
            style: shad.Theme.of(context).typography.small.copyWith(
                  fontWeight: FontWeight.w600,
                ),
          ),
        ],
      ),
    );
  }
}


