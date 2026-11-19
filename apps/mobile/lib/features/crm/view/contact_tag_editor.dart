import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/theme/appearance/brand_accents.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/features/crm/utils/contact_brand_color.dart';
import 'package:mobile/l10n/l10n.dart';

/// Creates or edits a tag: name, one of the four brand marks, and groups.
class ContactTagEditor extends StatefulWidget {
  const ContactTagEditor({
    required this.groups,
    required this.onSubmit,
    this.tag,
    super.key,
  });

  final List<CrmGroup> groups;
  final CrmGroupTag? tag;
  final Future<void> Function({
    required String name,
    required String color,
    required List<String> groupIds,
  })
  onSubmit;

  @override
  State<ContactTagEditor> createState() => ContactTagEditorState();
}

class ContactTagEditorState extends State<ContactTagEditor> {
  late final TextEditingController _name;
  late BrandAccent _accent;
  late String? _storedColor;
  late final Set<String> _groupIds;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final tag = widget.tag;
    _name = TextEditingController(text: tag?.name ?? '');
    _accent = contactBrandAccentForHex(tag?.color) ?? BrandAccents.innovation;
    _storedColor = contactBrandAccentForHex(tag?.color) == null
        ? tag?.color
        : null;
    _groupIds = {...?tag?.groupIds};
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final l10n = context.l10n;
    final name = _name.text.trim();
    if (name.isEmpty) {
      setState(() => _error = l10n.contactsTagName);
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.onSubmit(
        name: name,
        color: _storedColor ?? contactBrandMarkHex(_accent),
        groupIds: _groupIds.toList(growable: false),
      );
      if (!mounted) return;
      final navigator = Navigator.of(context);
      if (navigator.canPop()) navigator.pop(true);
    } on Object catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final brightness = Theme.of(context).brightness;
    final editing = widget.tag != null;
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Text(
          editing ? l10n.contactsEditTag : l10n.contactsCreateTag,
          style: tokens.typography.large.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppTextField(
          controller: _name,
          label: l10n.contactsTagName,
          placeholder: l10n.contactsTagNameHint,
        ),
        const SizedBox(height: AppSpacing.lg),
        Text(
          l10n.contactsTagColor,
          style: tokens.typography.small.copyWith(
            color: tokens.colorScheme.mutedForeground,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            for (final accent in BrandAccents.core)
              AppChip(
                label: Text(_colorLabel(l10n, accent)),
                selected: _storedColor == null && identical(_accent, accent),
                avatar: Icon(
                  LucideIcons.tag,
                  size: 14,
                  color: accent.fill(brightness),
                ),
                onSelected: (_) => setState(() {
                  _accent = accent;
                  _storedColor = null;
                }),
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        Text(
          l10n.contactsGroups,
          style: tokens.typography.small.copyWith(
            color: tokens.colorScheme.mutedForeground,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            for (final group in widget.groups)
              AppChip(
                label: Text(group.name),
                selected: _groupIds.contains(group.id),
                onSelected: (selected) => setState(() {
                  if (selected) {
                    _groupIds.add(group.id);
                  } else {
                    _groupIds.remove(group.id);
                  }
                }),
              ),
          ],
        ),
        if (_error != null) ...[
          const SizedBox(height: AppSpacing.md),
          AppStateMessage.inline(
            icon: LucideIcons.circleAlert,
            tone: AppTone.destructive,
            title: l10n.commonSomethingWentWrong,
            message: _error,
          ),
        ],
        const SizedBox(height: AppSpacing.lg),
        AppButton.primary(
          key: const ValueKey('contact-tag-save'),
          loading: _saving,
          onPressed: _saving ? null : _save,
          child: Text(l10n.commonSave),
        ),
      ],
    );
  }

  String _colorLabel(AppLocalizations l10n, BrandAccent accent) {
    return switch (accent.name) {
      'growth' => l10n.contactsColorGrowth,
      'energy' => l10n.contactsColorEnergy,
      'impact' => l10n.contactsColorImpact,
      _ => l10n.contactsColorInnovation,
    };
  }
}
