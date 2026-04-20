import 'package:flutter/material.dart' hide Scaffold;
import 'package:mobile/core/icons/platform_icon.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class PlatformIconPickerField extends StatefulWidget {
  const PlatformIconPickerField({
    required this.value,
    required this.onChanged,
    this.label,
    this.title,
    this.searchPlaceholder,
    this.emptyText,
    this.showLabel = true,
    this.enabled = true,
    super.key,
  });

  final String? value;
  final ValueChanged<String?> onChanged;
  final String? label;
  final String? title;
  final String? searchPlaceholder;
  final String? emptyText;
  final bool showLabel;
  final bool enabled;

  @override
  State<PlatformIconPickerField> createState() =>
      _PlatformIconPickerFieldState();
}

class _PlatformIconPickerFieldState extends State<PlatformIconPickerField> {
  @override
  Widget build(BuildContext context) {
    final selected = platformIconOptions
        .where((o) => o.key == widget.value)
        .firstOrNull;
    final icon = resolvePlatformIcon(widget.value);
    final theme = shad.Theme.of(context);

    return Row(
      children: [
        Expanded(
          child: shad.OutlineButton(
            onPressed: widget.enabled ? _openPicker : null,
            child: Row(
              children: [
                Icon(icon, size: 16),
                if (widget.showLabel) ...[
                  const shad.Gap(8),
                  Expanded(
                    child: Text(
                      selected?.label ?? widget.label ?? '-',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.small,
                    ),
                  ),
                ] else
                  const Spacer(),
                const Icon(Icons.expand_more, size: 16),
              ],
            ),
          ),
        ),
        if (widget.value != null && widget.enabled) ...[
          const shad.Gap(8),
          shad.GhostButton(
            density: shad.ButtonDensity.icon,
            onPressed: () => widget.onChanged(null),
            child: const Icon(Icons.close, size: 14),
          ),
        ],
      ],
    );
  }

  Future<void> _openPicker() async {
    final selected = await showAdaptiveSheet<String?>(
      context: context,
      builder: (_) => _PlatformIconPickerSheet(
        initialValue: widget.value,
        title: widget.title,
        searchPlaceholder: widget.searchPlaceholder,
        emptyText: widget.emptyText,
      ),
      maxDialogWidth: 760,
    );

    if (!mounted || selected == null) return;
    widget.onChanged(selected);
  }
}

class _PlatformIconPickerSheet extends StatefulWidget {
  const _PlatformIconPickerSheet({
    this.initialValue,
    this.title,
    this.searchPlaceholder,
    this.emptyText,
  });

  final String? initialValue;
  final String? title;
  final String? searchPlaceholder;
  final String? emptyText;

  @override
  State<_PlatformIconPickerSheet> createState() =>
      _PlatformIconPickerSheetState();
}

class _PlatformIconPickerSheetState extends State<_PlatformIconPickerSheet> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final filtered = _filteredOptions;
    final theme = shad.Theme.of(context);

    return shad.Scaffold(
      headers: [
        shad.AppBar(
          title: Text(widget.title ?? 'Select icon'),
          trailing: [
            shad.GhostButton(
              density: shad.ButtonDensity.icon,
              onPressed: () => Navigator.of(context).pop(),
              child: const Icon(Icons.close, size: 18),
            ),
          ],
        ),
      ],
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: Column(
          children: [
            shad.TextField(
              contextMenuBuilder: platformTextContextMenuBuilder(),
              controller: _searchController,
              hintText: widget.searchPlaceholder ?? 'Search icons',
              onChanged: (value) => setState(() => _query = value),
              features: const [
                shad.InputFeature.leading(Icon(Icons.search, size: 16)),
              ],
            ),
            const shad.Gap(8),
            Expanded(
              child: filtered.isEmpty
                  ? Center(
                      child: Text(
                        widget.emptyText ?? 'No icons found',
                        style: theme.typography.textMuted,
                      ),
                    )
                  : GridView.builder(
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 8,
                            crossAxisSpacing: 4,
                            mainAxisSpacing: 4,
                          ),
                      itemCount: filtered.length,
                      itemBuilder: (context, index) {
                        final option = filtered[index];
                        final selected = option.key == widget.initialValue;
                        final buttonChild = Icon(option.icon, size: 16);
                        return Tooltip(
                          message: option.label,
                          child: selected
                              ? shad.PrimaryButton(
                                  density: shad.ButtonDensity.icon,
                                  onPressed: () =>
                                      Navigator.of(context).pop(option.key),
                                  child: buttonChild,
                                )
                              : shad.OutlineButton(
                                  density: shad.ButtonDensity.icon,
                                  onPressed: () =>
                                      Navigator.of(context).pop(option.key),
                                  child: buttonChild,
                                ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  List<PlatformIconOption> get _filteredOptions {
    final normalized = _query.trim().toLowerCase();
    if (normalized.isEmpty) return platformIconOptions;
    return platformIconOptions
        .where(
          (option) =>
              option.label.toLowerCase().contains(normalized) ||
              option.key.toLowerCase().contains(normalized),
        )
        .toList(growable: false);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }
}
