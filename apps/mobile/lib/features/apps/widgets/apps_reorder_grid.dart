import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/widgets/app_card_palette.dart';
import 'package:mobile/features/apps/widgets/app_visibility_button.dart';
import 'package:mobile/l10n/l10n.dart';

class AppsReorderGrid extends StatefulWidget {
  const AppsReorderGrid({
    required this.modules,
    required this.hidden,
    required this.canReorder,
    required this.isOrdering,
    required this.onOrderingStarted,
    required this.onOrderChanged,
    required this.onVisibilityPressed,
    this.onSelected,
    super.key,
  });

  final List<AppModule> modules;
  final bool hidden;
  final bool canReorder;
  final bool isOrdering;
  final VoidCallback onOrderingStarted;
  final ValueChanged<List<String>> onOrderChanged;
  final ValueChanged<AppModule> onVisibilityPressed;
  final ValueChanged<AppModule>? onSelected;

  @override
  State<AppsReorderGrid> createState() => _AppsReorderGridState();
}

class _AppsReorderGridState extends State<AppsReorderGrid>
    with SingleTickerProviderStateMixin {
  final GlobalKey _gridKey = GlobalKey();
  late List<AppModule> _preview = [...widget.modules];
  late final AnimationController _wiggle = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 270),
  );
  String? _draggingId;

  @override
  void didUpdateWidget(covariant AppsReorderGrid oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_draggingId == null) _preview = [...widget.modules];
    if (oldWidget.isOrdering != widget.isOrdering) {
      if (widget.isOrdering && !MediaQuery.disableAnimationsOf(context)) {
        _wiggle.repeat();
      } else {
        _wiggle
          ..stop()
          ..reset();
      }
    }
  }

  @override
  void dispose() {
    _wiggle.dispose();
    super.dispose();
  }

  void _startDrag(AppModule module) {
    if (!widget.canReorder) return;
    setState(() => _draggingId = module.id);
    widget.onOrderingStarted();
    unawaited(AppHaptics.pickup());
  }

  void _moveDrag(
    Offset globalPosition,
    double width,
    double cellWidth,
    double cellHeight,
    int columns,
  ) {
    if (_draggingId == null || !widget.canReorder) return;
    final box = _gridKey.currentContext?.findRenderObject();
    if (box is! RenderBox) return;
    final local = box.globalToLocal(globalPosition);
    final x = Directionality.of(context) == TextDirection.rtl
        ? width - local.dx
        : local.dx;
    final column = (x / (cellWidth + 12)).floor().clamp(0, columns - 1);
    final row = (local.dy / (cellHeight + 12)).floor().clamp(
      0,
      (_preview.length - 1) ~/ columns,
    );
    final target = (row * columns + column).clamp(0, _preview.length - 1);
    final current = _preview.indexWhere((module) => module.id == _draggingId);
    if (current < 0 || target == current) return;
    setState(() {
      final moved = _preview.removeAt(current);
      _preview.insert(target, moved);
    });
    unawaited(AppHaptics.selection());
  }

  void _finishDrag() {
    if (_draggingId == null) return;
    final changed =
        _preview.map((module) => module.id).join(',') !=
        widget.modules.map((module) => module.id).join(',');
    final ids = _preview.map((module) => module.id).toList();
    setState(() => _draggingId = null);
    if (changed) widget.onOrderChanged(ids);
    unawaited(AppHaptics.drop());
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final width = constraints.maxWidth;
      final columns = (width / 96).floor().clamp(1, 6);
      final cellWidth = (width - 12 * (columns - 1)) / columns;
      final labelStyle = Theme.of(context).textTheme.labelMedium;
      final labelHeight =
          MediaQuery.textScalerOf(context).scale(labelStyle?.fontSize ?? 14) *
          (labelStyle?.height ?? 1.2) *
          2;
      final cellHeight = 84 + 8 + labelHeight + 12;
      final rows = (_preview.length / columns).ceil();
      return SizedBox(
        key: _gridKey,
        width: width,
        height: rows == 0 ? 0 : rows * cellHeight + (rows - 1) * 12,
        child: AnimatedBuilder(
          animation: _wiggle,
          builder: (context, _) => Stack(
            clipBehavior: Clip.none,
            children: [
              for (final (index, module) in _preview.indexed)
                AnimatedPositioned(
                  key: ValueKey('apps-grid-position-${module.id}'),
                  duration: MediaQuery.disableAnimationsOf(context)
                      ? Duration.zero
                      : const Duration(milliseconds: 210),
                  curve: Curves.easeOutCubic,
                  left: Directionality.of(context) == TextDirection.rtl
                      ? width - cellWidth - (index % columns) * (cellWidth + 12)
                      : (index % columns) * (cellWidth + 12),
                  top: (index ~/ columns) * (cellHeight + 12),
                  width: cellWidth,
                  height: cellHeight,
                  child: Transform.rotate(
                    angle:
                        !widget.isOrdering ||
                            MediaQuery.disableAnimationsOf(context)
                        ? 0
                        : math.sin(
                                _wiggle.value * math.pi * 2 + index * math.pi,
                              ) *
                              0.025,
                    child: _buildTile(
                      module,
                      index,
                      width,
                      cellWidth,
                      cellHeight,
                      columns,
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
    },
  );

  Widget _buildTile(
    AppModule module,
    int index,
    double width,
    double cellWidth,
    double cellHeight,
    int columns,
  ) {
    final tile = _AppGridTile(
      module: module,
      index: index,
      hidden: widget.hidden,
      showVisibility: widget.hidden || widget.isOrdering,
      onSelected: widget.onSelected,
      onVisibilityPressed: () => widget.onVisibilityPressed(module),
    );
    if (!widget.canReorder) return tile;
    return LongPressDraggable<AppModule>(
      key: ValueKey('apps-grid-drag-${module.id}'),
      data: module,
      delay: const Duration(milliseconds: 280),
      onDragStarted: () => _startDrag(module),
      onDragUpdate: (details) => _moveDrag(
        details.globalPosition,
        width,
        cellWidth,
        cellHeight,
        columns,
      ),
      onDragEnd: (_) => _finishDrag(),
      feedback: Material(
        color: Colors.transparent,
        child: SizedBox(width: cellWidth, height: cellHeight, child: tile),
      ),
      childWhenDragging: Opacity(opacity: 0.18, child: tile),
      child: tile,
    );
  }
}

class _AppGridTile extends StatelessWidget {
  const _AppGridTile({
    required this.module,
    required this.index,
    required this.hidden,
    required this.showVisibility,
    required this.onVisibilityPressed,
    this.onSelected,
  });

  final AppModule module;
  final int index;
  final bool hidden;
  final bool showVisibility;
  final VoidCallback onVisibilityPressed;
  final ValueChanged<AppModule>? onSelected;

  @override
  Widget build(BuildContext context) {
    final palette = AppCardPalette.resolve(
      context,
      index: index,
      moduleId: module.id,
    );
    return Semantics(
      button: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () {
          unawaited(AppHaptics.selection());
          if (onSelected != null) {
            onSelected!(module);
          } else {
            unawaited(context.read<AppTabCubit>().select(module));
            context.go(module.route);
          }
        },
        child: Column(
          children: [
            SizedBox(
              width: 82,
              height: 84,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  Align(
                    alignment: Alignment.bottomCenter,
                    child: Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                        color: palette.background,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: palette.border),
                        boxShadow: [
                          BoxShadow(
                            color: palette.shadow,
                            blurRadius: 12,
                            offset: const Offset(0, 5),
                          ),
                        ],
                      ),
                      child: Icon(
                        module.icon,
                        color: palette.iconColor,
                        size: 30,
                      ),
                    ),
                  ),
                  if (showVisibility)
                    Positioned(
                      top: 0,
                      right: 0,
                      child: AppVisibilityButton(
                        hidden: hidden,
                        cornerAligned: true,
                        onPressed: onVisibilityPressed,
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Text(
              module.label(context.l10n),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                fontWeight: FontWeight.w700,
                height: 1.12,
                color: hidden
                    ? Theme.of(context).colorScheme.onSurfaceVariant
                    : null,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
