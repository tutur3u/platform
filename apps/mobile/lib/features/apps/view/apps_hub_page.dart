import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_warmup_coordinator.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/apps/widgets/app_card_palette.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/staggered_entrance.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class AppsHubPage extends StatefulWidget {
  const AppsHubPage({
    this.replayToken = 0,
    super.key,
  });

  final int replayToken;

  @override
  State<AppsHubPage> createState() => _AppsHubPageState();
}

class _AppsHubPageState extends State<AppsHubPage> {
  Timer? _tapShieldTimer;
  var _tapShieldActive = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(CacheWarmupCoordinator.instance.prewarmModule('apps'));
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      final routeAnimation = ModalRoute.of(context)?.animation;
      final isTransitioning =
          routeAnimation != null &&
          (routeAnimation.isAnimating ||
              routeAnimation.status == AnimationStatus.forward);
      if (!isTransitioning) {
        return;
      }

      setState(() {
        _tapShieldActive = true;
      });

      _tapShieldTimer = Timer(const Duration(milliseconds: 600), () {
        if (!mounted) {
          return;
        }
        setState(() {
          _tapShieldActive = false;
        });
      });
    });
  }

  @override
  void dispose() {
    _tapShieldTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final modules = AppRegistry.modules(context);

    return shad.Scaffold(
      child: SafeArea(
        top: false,
        bottom: false,
        child: ResponsiveWrapper(
          maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
          child: IgnorePointer(
            ignoring: _tapShieldActive,
            child: CustomScrollView(
              physics: const BouncingScrollPhysics(),
              slivers: [
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(
                    ResponsivePadding.horizontal(context.deviceClass),
                    10,
                    ResponsivePadding.horizontal(context.deviceClass),
                    0,
                  ),
                  sliver: const SliverToBoxAdapter(child: _AppsIntro()),
                ),
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(
                    ResponsivePadding.horizontal(context.deviceClass),
                    0,
                    ResponsivePadding.horizontal(context.deviceClass),
                    24 + MediaQuery.paddingOf(context).bottom,
                  ),
                  sliver: SliverGrid(
                    delegate: SliverChildBuilderDelegate((context, index) {
                      return _SubproductCard(
                        module: modules[index],
                        index: index,
                        replayToken: widget.replayToken,
                      );
                    }, childCount: modules.length),
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: switch (context.deviceClass) {
                        DeviceClass.compact => 2,
                        DeviceClass.medium => 3,
                        DeviceClass.expanded => 4,
                      },
                      mainAxisSpacing: 12,
                      crossAxisSpacing: 12,
                      childAspectRatio: switch (context.deviceClass) {
                        DeviceClass.compact => 0.98,
                        DeviceClass.medium => 1.0,
                        DeviceClass.expanded => 1.05,
                      },
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AppsIntro extends StatelessWidget {
  const _AppsIntro();

  @override
  Widget build(BuildContext context) {
    return const SizedBox.shrink();
  }
}

class _SubproductCard extends StatelessWidget {
  const _SubproductCard({
    required this.module,
    required this.index,
    required this.replayToken,
  });

  final AppModule module;
  final int index;
  final int replayToken;

  @override
  Widget build(BuildContext context) {
    final palette = AppCardPalette.resolve(
      context,
      index: index,
      moduleId: module.id,
    );
    final shellBackground = Color.alphaBlend(
      palette.shadow.withValues(alpha: 0.22),
      palette.background,
    );
    return StaggeredEntrance(
      replayKey: '$replayToken-$index',
      delay: Duration(milliseconds: 50 + (index * 45)),
      child: InkWell(
        borderRadius: BorderRadius.circular(26),
        onTap: () {
          unawaited(context.read<AppTabCubit>().select(module));
          context.go(module.route);
        },
        child: Material(
          color: shellBackground,
          borderRadius: BorderRadius.circular(26),
          clipBehavior: Clip.antiAlias,
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(26),
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color.alphaBlend(
                    palette.iconBackground.withValues(alpha: 0.2),
                    palette.background,
                  ),
                  shellBackground,
                ],
              ),
              border: Border.all(color: palette.border.withValues(alpha: 0.95)),
              boxShadow: [
                BoxShadow(
                  color: palette.shadow,
                  blurRadius: 20,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: palette.iconBackground,
                        borderRadius: BorderRadius.circular(15),
                      ),
                      child: Icon(
                        module.icon,
                        color: palette.iconColor,
                        size: 22,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  module.label(context.l10n),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: palette.textColor,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 8),
                Expanded(
                  child: Text(
                    _description(context, module.id),
                    maxLines: context.deviceClass == DeviceClass.compact
                        ? 5
                        : 4,
                    overflow: TextOverflow.fade,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: palette.textColor.withValues(alpha: 0.78),
                      height: 1.32,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _description(BuildContext context, String moduleId) {
    return switch (moduleId) {
      'habits' => context.l10n.appsHubHabitsDescription,
      'tasks' => context.l10n.appsHubTasksDescription,
      'calendar' => context.l10n.appsHubCalendarDescription,
      'finance' => context.l10n.appsHubFinanceDescription,
      'inventory' => context.l10n.appsHubInventoryDescription,
      'notifications' => context.l10n.appsHubNotificationsDescription,
      'settings' => context.l10n.appsHubSettingsDescription,
      'timer' => context.l10n.appsHubTimerDescription,
      _ => '',
    };
  }
}
