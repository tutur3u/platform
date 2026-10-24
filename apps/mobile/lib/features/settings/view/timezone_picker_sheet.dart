import 'package:flutter/material.dart';
import 'package:mobile/core/layout/grouped_section.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/utils/supported_timezones.dart';
import 'package:mobile/features/settings/view/timezone_choices.dart';
import 'package:mobile/l10n/l10n.dart';

/// Picker for the personal or workspace timezone, shown with `showAppSheet`.
///
/// Pops with an IANA id or `'auto'`. Search is a dynamic shell action (the
/// floating dock's search button turns the top navbar into the query field);
/// outside the shell an inline field is used. The current choice stays pinned
/// above the results, and Automatic explains what it resolves to.
class TimezonePickerSheet extends StatefulWidget {
  const TimezonePickerSheet({
    required this.workspace,
    required this.selected,
    this.automaticZone,
    this.timezones = supportedTimezones,
    this.now,
    super.key,
  });

  final bool workspace;

  /// Saved value: an IANA id or `'auto'`.
  final String selected;

  /// Zone Automatic currently resolves to, when known.
  final String? automaticZone;
  final List<String> timezones;

  /// Clock for offsets; defaults to now.
  final DateTime? now;

  @override
  State<TimezonePickerSheet> createState() => _TimezonePickerSheetState();
}

class _TimezonePickerSheetState extends State<TimezonePickerSheet> {
  final _query = TextEditingController();
  late final DateTime _now = widget.now ?? DateTime.now();
  late final List<TimezoneChoice> _choices = buildTimezoneChoices(
    widget.timezones,
    _now,
  );

  @override
  void dispose() {
    // The shell search field may still hold the controller this frame.
    final query = _query;
    WidgetsBinding.instance.addPostFrameCallback((_) => query.dispose());
    super.dispose();
  }

  void _pick(String value) => Navigator.of(context).pop(value);

  TimezoneChoice? get _current => widget.selected == 'auto'
      ? null
      : _choices.where((c) => c.id == widget.selected).firstOrNull ??
            TimezoneChoice.fromId(widget.selected, _now);

  String _resolvedLabel(String zone) {
    final choice = _choices.where((c) => c.id == zone).firstOrNull;
    final offset =
        choice?.offsetLabel ?? formatGmtOffset(timezoneOffset(zone, _now));
    return [
      choice?.city ?? zone,
      offset,
    ].where((s) => s.isNotEmpty).join(' · ');
  }

  Widget _zoneTile(TimezoneChoice choice) => AppOptionTile(
    key: ValueKey('timezone-option-${choice.id}'),
    title: choice.city,
    subtitle: choice.region.isEmpty ? null : choice.region,
    // Fixed-offset zones are already titled by their offset.
    detail: choice.city == choice.offsetLabel ? null : choice.offsetLabel,
    selected: choice.id == widget.selected,
    onTap: () => _pick(choice.id),
  );

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final query = _query.text;
    final searching = normalizeTimezoneQuery(query).isNotEmpty;
    final results = _choices.where((c) => c.matches(query)).toList();
    final current = _current;
    final automatic = widget.automaticZone;
    return AppSheetScaffold(
      title: widget.workspace
          ? l10n.settingsWorkspaceTimezone
          : l10n.settingsTimezone,
      icon: LucideIcons.earth,
      search: AppSheetSearch(
        controller: _query,
        hint: l10n.settingsTimezonePickerSearchHint,
        onChanged: (_) => setState(() {}),
      ),
      slivers: [
        if (!searching || current != null)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.only(bottom: AppLayout.sectionGap),
              child: AppGroupedSection(
                caption: l10n.settingsTimezonePickerCurrent,
                dividerInset: AppLayout.rowHorizontalPadding,
                children: [
                  if (current != null)
                    _zoneTile(current)
                  else
                    _AutomaticTile(
                      selected: true,
                      workspace: widget.workspace,
                      resolved: automatic == null || automatic.isEmpty
                          ? null
                          : _resolvedLabel(automatic),
                      onTap: () => _pick('auto'),
                    ),
                  if (current != null && !searching)
                    _AutomaticTile(
                      selected: false,
                      workspace: widget.workspace,
                      resolved: automatic == null || automatic.isEmpty
                          ? null
                          : _resolvedLabel(automatic),
                      onTap: () => _pick('auto'),
                    ),
                ],
              ),
            ),
          ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.only(bottom: AppLayout.sectionCaptionGap),
            child: AppSectionCaption(l10n.settingsTimezonePickerAll),
          ),
        ),
        if (results.isEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.xl),
              child: Text(
                l10n.settingsTimezonePickerEmpty(query.trim()),
                textAlign: TextAlign.center,
                style: context.tokens.typography.small.copyWith(
                  color: context.tokens.colorScheme.mutedForeground,
                ),
              ),
            ),
          )
        else
          SliverList.builder(
            itemCount: results.length,
            itemBuilder: (_, index) => _zoneTile(results[index]),
          ),
      ],
    );
  }
}

class _AutomaticTile extends StatelessWidget {
  const _AutomaticTile({
    required this.selected,
    required this.workspace,
    required this.resolved,
    required this.onTap,
  });

  final bool selected;
  final bool workspace;
  final String? resolved;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final explanation = workspace
        ? l10n.settingsTimezonePickerAutoWorkspace
        : l10n.settingsTimezonePickerAutoPersonal;
    final now = resolved;
    return AppOptionTile(
      key: const ValueKey('timezone-option-auto'),
      title: l10n.settingsTimezoneAuto,
      subtitle: now == null || workspace
          ? explanation
          : '$explanation ${l10n.settingsTimezonePickerAutoResolved(now)}',
      selected: selected,
      onTap: onTap,
    );
  }
}
