import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/finance_promotion.dart';
import 'package:mobile/features/finance/utils/checkpoint_variance.dart';
import 'package:mobile/l10n/l10n.dart';

/// What the promotion form resolved with.
sealed class PromotionFormResult {
  const PromotionFormResult();
}

class PromotionSave extends PromotionFormResult {
  const PromotionSave(this.promotion);

  final FinancePromotion promotion;
}

class PromotionDelete extends PromotionFormResult {
  const PromotionDelete();
}

/// Create or edit a promotion. [canDelete] adds Delete for an existing one.
Future<PromotionFormResult?> showPromotionFormSheet(
  BuildContext context, {
  required String currency,
  FinancePromotion? promotion,
  bool canDelete = false,
}) => showAppSheet<PromotionFormResult>(
  context: context,
  size: AppSheetSize.large,
  builder: (_) => PromotionFormSheet(
    currency: currency,
    promotion: promotion,
    canDelete: canDelete,
  ),
);

class PromotionFormSheet extends StatefulWidget {
  const PromotionFormSheet({
    required this.currency,
    this.promotion,
    this.canDelete = false,
    super.key,
  });

  final String currency;
  final FinancePromotion? promotion;
  final bool canDelete;

  @override
  State<PromotionFormSheet> createState() => _PromotionFormSheetState();
}

class _PromotionFormSheetState extends State<PromotionFormSheet> {
  late final FinancePromotion? _initial = widget.promotion;
  late final _name = TextEditingController(text: _initial?.name);
  late final _code = TextEditingController(text: _initial?.code);
  late final _description = TextEditingController(text: _initial?.description);
  late final _value = TextEditingController(
    text: _initial == null ? '' : _plain(_initial.value),
  );
  late final _maxUses = TextEditingController(
    text: _initial?.maxUses?.toString(),
  );
  late bool _percent = _initial?.useRatio ?? true;
  bool _submitted = false;

  static String _plain(double value) =>
      value == value.roundToDouble() ? value.toStringAsFixed(0) : '$value';

  @override
  void dispose() {
    for (final controller in [_name, _code, _description, _value, _maxUses]) {
      controller.dispose();
    }
    super.dispose();
  }

  double? get _parsedValue {
    final value = parseCheckpointBalance(_value.text);
    if (value == null || value < 0) return null;
    return _percent && value > 100 ? null : value;
  }

  /// Null and valid when blank (unlimited).
  (int?, bool) get _parsedMaxUses {
    final text = _maxUses.text.trim();
    if (text.isEmpty) return (null, true);
    final value = int.tryParse(text);
    return value != null && value > 0 ? (value, true) : (null, false);
  }

  void _save() {
    setState(() => _submitted = true);
    final value = _parsedValue;
    final (maxUses, maxValid) = _parsedMaxUses;
    final name = _name.text.trim();
    final code = _code.text.trim();
    if (name.isEmpty || code.isEmpty || value == null || !maxValid) return;
    final description = _description.text.trim();
    Navigator.of(context).pop(
      PromotionSave(
        FinancePromotion(
          id: _initial?.id ?? '',
          name: name,
          code: code,
          value: value,
          useRatio: _percent,
          description: description.isEmpty ? null : description,
          maxUses: maxUses,
          currentUses: _initial?.currentUses ?? 0,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final (_, maxValid) = _parsedMaxUses;
    return AppSheetScaffold(
      title: _initial == null
          ? l10n.financePromotionNew
          : l10n.financePromotionEdit,
      headerActions: [
        if (_initial != null && widget.canDelete)
          AppIconButton(
            key: const ValueKey('promotion-delete'),
            icon: const Icon(LucideIcons.trash2),
            tooltip: l10n.commonDelete,
            onPressed: () => Navigator.of(context).pop(const PromotionDelete()),
          ),
      ],
      actions: [
        AppButton.primary(
          key: const ValueKey('promotion-save'),
          onPressed: _save,
          child: Text(l10n.commonSave),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppLayout.itemGap,
        children: [
          AppTextField(
            key: const ValueKey('promotion-name'),
            controller: _name,
            label: l10n.financePromotionName,
            placeholder: l10n.financePromotionNamePlaceholder,
            maxLength: 255,
            errorText: _submitted && _name.text.trim().isEmpty
                ? l10n.financePromotionNameRequired
                : null,
            onChanged: (_) => setState(() {}),
          ),
          AppTextField(
            key: const ValueKey('promotion-code'),
            controller: _code,
            label: l10n.financePromotionCode,
            placeholder: l10n.financePromotionCodePlaceholder,
            maxLength: 255,
            errorText: _submitted && _code.text.trim().isEmpty
                ? l10n.financePromotionCodeRequired
                : null,
            onChanged: (_) => setState(() {}),
          ),
          AppSegmentedControl<bool>(
            key: const ValueKey('promotion-unit'),
            segments: [
              AppSegment(
                value: true,
                label: l10n.financePromotionPercent,
                icon: LucideIcons.percent,
              ),
              AppSegment(
                value: false,
                label: l10n.financePromotionAmount,
                icon: LucideIcons.banknote,
              ),
            ],
            selected: _percent,
            onChanged: (percent) => setState(() => _percent = percent),
          ),
          AppTextField(
            key: const ValueKey('promotion-value'),
            controller: _value,
            label: _percent
                ? '${l10n.financePromotionValue} (%)'
                : '${l10n.financePromotionValue} (${widget.currency})',
            placeholder: '0',
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            errorText: _submitted && _parsedValue == null
                ? (_percent
                      ? l10n.financePromotionValueInvalid
                      : l10n.financePromotionAmountInvalid)
                : null,
            onChanged: (_) => setState(() {}),
          ),
          AppTextField(
            key: const ValueKey('promotion-max-uses'),
            controller: _maxUses,
            label: l10n.financePromotionMaxUses,
            placeholder: l10n.financePromotionMaxUsesPlaceholder,
            keyboardType: TextInputType.number,
            errorText: maxValid ? null : l10n.financePromotionMaxUsesInvalid,
            onChanged: (_) => setState(() {}),
          ),
          AppTextField(
            key: const ValueKey('promotion-description'),
            controller: _description,
            label: l10n.financeDescription,
            placeholder: l10n.financePromotionDescriptionPlaceholder,
            maxLines: 3,
            maxLength: 500,
          ),
        ],
      ),
    );
  }
}
