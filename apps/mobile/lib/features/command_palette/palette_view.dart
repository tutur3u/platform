import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/command_palette/palette_catalog.dart';
import 'package:mobile/features/command_palette/palette_cubit.dart';
import 'package:mobile/features/command_palette/palette_entry.dart';
import 'package:mobile/features/shell/view/shell_navigation_rail.dart';
import 'package:mobile/l10n/l10n.dart';

Future<T?> showPaletteOverlay<T>(
  BuildContext context,
  WidgetBuilder builder,
) => showAppSheet<T>(
  context: context,
  useRootNavigator: true,
  forceBottomSheet:
      shellNavigationModeFor(MediaQuery.sizeOf(context)) ==
      ShellNavigationMode.dock,
  maxDialogWidth: 640,
  builder: builder,
);

class CommandPaletteView extends StatefulWidget {
  const CommandPaletteView({
    required this.commands,
    this.showNotes = true,
    super.key,
  });

  final List<PaletteEntry> commands;
  final bool showNotes;

  @override
  State<CommandPaletteView> createState() => _CommandPaletteViewState();
}

class _CommandPaletteViewState extends State<CommandPaletteView> {
  final _controller = TextEditingController();
  final _searchFocus = FocusNode();
  final _rowKeys = <String, GlobalKey>{};
  String? _selectedId;
  bool _submitted = false;

  @override
  void dispose() {
    _controller.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  void _close([PaletteEntry? entry]) {
    if (_submitted || ModalRoute.of(context)?.isCurrent != true) return;
    _submitted = true;
    Navigator.of(context).pop(entry);
  }

  KeyEventResult _handleKey(
    KeyEvent event,
    List<PaletteEntry> entries,
    int selected,
  ) {
    final modifiers = HardwareKeyboard.instance;
    if (event is KeyUpEvent ||
        modifiers.isAltPressed ||
        modifiers.isMetaPressed ||
        modifiers.isControlPressed ||
        modifiers.isShiftPressed ||
        (_controller.value.composing.isValid &&
            !_controller.value.composing.isCollapsed)) {
      return KeyEventResult.ignored;
    }
    final key = event.logicalKey;
    if (key == LogicalKeyboardKey.escape) {
      _close();
      return KeyEventResult.handled;
    }
    if (entries.isEmpty) return KeyEventResult.ignored;
    if (key == LogicalKeyboardKey.enter ||
        key == LogicalKeyboardKey.numpadEnter) {
      if (event is KeyDownEvent) _close(entries[selected]);
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.arrowDown ||
        key == LogicalKeyboardKey.arrowUp) {
      final delta = key == LogicalKeyboardKey.arrowDown ? 1 : -1;
      final next = (selected + delta) % entries.length;
      setState(() => _selectedId = entries[next].id);
      _searchFocus.requestFocus();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final row = _rowKeys[entries[next].id]?.currentContext;
        if (row != null) {
          unawaited(
            Scrollable.ensureVisible(row, alignment: delta > 0 ? 1 : 0),
          );
        }
      });
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final cubit = context.watch<PaletteCubit>();
    final state = cubit.state;
    final commands = rankPaletteCommands(
      widget.commands,
      state.query,
      state.recentIds,
    );
    final results = [
      for (final record in state.results)
        if (widget.showNotes || record.kind != PaletteRecordKind.note)
          PaletteEntry(
            id: '${record.kind.name}-${record.id}',
            label: record.title.isNotEmpty
                ? record.title
                : switch (record.kind) {
                    PaletteRecordKind.note => l10n.notesUntitled,
                    PaletteRecordKind.task => l10n.commandPaletteUntitledTask,
                  },
            group: PaletteGroup.search,
            route: record.route,
            recordKind: record.kind,
          ),
    ];
    final entries = [...commands, ...results];
    final ids = entries.map((entry) => entry.id).toSet();
    _rowKeys.removeWhere((id, _) => !ids.contains(id));
    final selected = entries.indexWhere((entry) => entry.id == _selectedId);
    final activeIndex = selected < 0 ? 0 : selected;

    Widget heading(String title) => Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.md,
        AppSpacing.md,
        AppSpacing.xs,
      ),
      child: Semantics(
        header: true,
        child: Text(
          title,
          style: tokens.typography.small.copyWith(
            color: tokens.colorScheme.mutedForeground,
          ),
        ),
      ),
    );

    Widget row(PaletteEntry entry, int index) {
      final active = activeIndex == index;
      final shortcut = entry.shortcut;
      final kind = entry.recordKind;
      return DecoratedBox(
        key: _rowKeys.putIfAbsent(entry.id, GlobalKey.new),
        decoration: BoxDecoration(
          color: active ? tokens.colorScheme.accent : null,
          borderRadius: BorderRadius.circular(AppRadius.xs),
        ),
        child: MouseRegion(
          onHover: (_) {
            if (!active) setState(() => _selectedId = entry.id);
          },
          child: AppListTile(
            selected: active,
            title: Text(
              entry.label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            leading: switch (kind) {
              PaletteRecordKind.task => const Icon(Icons.task_alt_outlined),
              PaletteRecordKind.note => const Icon(Icons.note_alt_outlined),
              null => null,
            },
            trailing: shortcut == null
                ? null
                : Text(shortcut, style: tokens.typography.small),
            onTap: () => _close(entry),
          ),
        ),
      );
    }

    final searchField = Padding(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Row(
        children: [
          Expanded(
            child: AppTextField(
              controller: _controller,
              focusNode: _searchFocus,
              autofocus: true,
              placeholder: l10n.commandPalettePlaceholder,
              onChanged: (query) {
                setState(() => _selectedId = null);
                cubit.setQuery(query);
              },
              onSubmitted: (_) {
                if (entries.isNotEmpty) _close(entries[activeIndex]);
              },
            ),
          ),
          const SizedBox(width: AppSpacing.xs),
          AppIconButton(
            tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
            icon: const Icon(AppIcons.close),
          onPressed: () => _close(),
          ),
        ],
      ),
    );
    return Semantics(
      scopesRoute: true,
      namesRoute: true,
      explicitChildNodes: true,
      label: l10n.commandPaletteTitle,
      child: Focus(
        canRequestFocus: false,
        onKeyEvent: (_, event) => _handleKey(event, entries, activeIndex),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 480),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final tight =
                  constraints.maxHeight <
                  MediaQuery.textScalerOf(context).scale(160);
              return SizedBox(
                width: double.infinity,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (!tight) searchField,
                    Flexible(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.fromLTRB(
                          AppSpacing.sm,
                          0,
                          AppSpacing.sm,
                          AppSpacing.lg,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            if (tight) searchField,
                            if (state.query.isNotEmpty && commands.isNotEmpty)
                              heading(l10n.commandPaletteCommands),
                            for (final (index, entry) in commands.indexed) ...[
                              if (state.query.isEmpty &&
                                  (index == 0 ||
                                      entry.group != commands[index - 1].group))
                                heading(switch (entry.group) {
                                  PaletteGroup.recent =>
                                    l10n.commandPaletteRecent,
                                  PaletteGroup.destinations =>
                                    l10n.commandPaletteDestinations,
                                  PaletteGroup.apps => l10n.navApps,
                                  _ => l10n.commandPaletteActions,
                                }),
                              row(entry, index),
                            ],
                            if (state.query.isNotEmpty) ...[
                              heading(l10n.commandPaletteSearchResults),
                              for (final (index, entry) in results.indexed)
                                row(entry, commands.length + index),
                              if (state.status == PaletteSearchStatus.loading)
                                const Padding(
                                  padding: EdgeInsets.all(AppSpacing.md),
                                  child: Center(
                                    child: AppLoadingIndicator.inline(),
                                  ),
                                ),
                              if (state.status == PaletteSearchStatus.failed)
                                heading(l10n.commandPaletteSearchUnavailable)
                              else if (state.status ==
                                      PaletteSearchStatus.ready &&
                                  results.isEmpty)
                                heading(l10n.commandPaletteNoResults),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}
