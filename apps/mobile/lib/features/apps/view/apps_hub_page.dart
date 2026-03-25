import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/apps/widgets/app_card_palette.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class AppsHubPage extends StatefulWidget {
  const AppsHubPage({super.key});

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
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            ResponsivePadding.horizontal(context.deviceClass),
            10,
            ResponsivePadding.horizontal(context.deviceClass),
            24 + MediaQuery.paddingOf(context).bottom,
          ),
          child: IgnorePointer(
            ignoring: _tapShieldActive,
            child: CustomScrollView(
              physics: const BouncingScrollPhysics(),
              slivers: [
                const SliverToBoxAdapter(child: _AppsIntro()),
                const SliverToBoxAdapter(child: SizedBox(height: 16)),
                SliverGrid(
                  delegate: SliverChildBuilderDelegate((context, index) {
                    return _SubproductCard(
                      module: modules[index],
                      index: index,
                    );
                  }, childCount: modules.length),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: context.deviceClass == DeviceClass.expanded
                        ? 4
                        : context.deviceClass == DeviceClass.medium
                        ? 3
                        : 2,
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 12,
                    childAspectRatio:
                        context.deviceClass == DeviceClass.expanded
                        ? 1.1
                        : context.deviceClass == DeviceClass.medium
                        ? 1.0
                        : 0.88,
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
    // Shell already shows the title in the app bar, so we don't need to
    // duplicate it here. Return empty widget.
    return const SizedBox.shrink();
  }
}

class _SubproductCard extends StatelessWidget {
  const _SubproductCard({required this.module, required this.index});

  final AppModule module;
  final int index;

  @override
  Widget build(BuildContext context) {
    final palette = AppCardPalette.resolve(context, index);

    return InkWell(
      borderRadius: BorderRadius.circular(26),
      onTap: () {
        debugPrintStack(
          label: '[AppsHub] open module=${module.id} route=${module.route}',
        );
        unawaited(context.read<AppTabCubit>().select(module));
        context.go(module.route);
      },
      child: Material(
        color: palette.background,
        borderRadius: BorderRadius.circular(26),
        clipBehavior: Clip.antiAlias,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(26),
            border: Border.all(color: palette.border),
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
              const SizedBox(height: 8),
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
              Text(
                _description(context, module.id),
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: palette.textColor.withValues(alpha: 0.78),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _description(BuildContext context, String moduleId) {
    return switch (moduleId) {
      'tasks' => context.l10n.appsHubTasksDescription,
      'calendar' => context.l10n.appsHubCalendarDescription,
      'finance' => context.l10n.appsHubFinanceDescription,
      'timer' => context.l10n.appsHubTimerDescription,
      _ => '',
    };
  }
}
