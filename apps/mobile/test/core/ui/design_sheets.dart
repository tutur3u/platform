import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';

/// Every control in one page: buttons in each variant, inputs, a select,
/// chips, badges, a segmented control, a card, a panel and a bottom sheet
/// surface pinned to the bottom.
class ComponentSheet extends StatelessWidget {
  const ComponentSheet({super.key});

  @override
  Widget build(BuildContext context) {
    void noop() {}
    return ColoredBox(
      color: Theme.of(context).scaffoldBackgroundColor,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                  children: [
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        AppButton.primary(
                          onPressed: noop,
                          child: const Text('Primary'),
                        ),
                        AppButton.secondary(
                          onPressed: noop,
                          child: const Text('Secondary'),
                        ),
                        AppButton.outline(
                          onPressed: noop,
                          child: const Text('Outline'),
                        ),
                        AppButton.ghost(
                          onPressed: noop,
                          child: const Text('Ghost'),
                        ),
                        AppButton.destructive(
                          onPressed: noop,
                          child: const Text('Delete'),
                        ),
                        AppButton.primary(
                          size: AppButtonSize.small,
                          onPressed: noop,
                          child: const Text('Small'),
                        ),
                        const AppButton.outline(
                          onPressed: null,
                          child: Text('Disabled'),
                        ),
                        AppIconButton(
                          tooltip: 'Add',
                          variant: AppButtonVariant.outline,
                          icon: const Icon(LucideIcons.plus),
                          onPressed: noop,
                        ),
                      ],
                    ),
                    const AppGap(12),
                    const AppTextField(label: 'Title', placeholder: 'Task'),
                    const AppGap(12),
                    AppSearchField(
                      controller: TextEditingController(),
                      placeholder: 'Search',
                    ),
                    const AppGap(12),
                    AppSelect<int>(
                      title: 'Priority',
                      value: 1,
                      onChanged: (_) {},
                      options: const [AppSelectOption(value: 1, label: 'High')],
                    ),
                    const AppGap(12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        AppChip(
                          label: const Text('Today'),
                          selected: true,
                          onSelected: (_) {},
                        ),
                        AppChip(
                          label: const Text('Week'),
                          selected: false,
                          onSelected: (_) {},
                        ),
                        const AppBadge(child: Text('Draft')),
                        const AppBadge(
                          variant: AppBadgeVariant.success,
                          child: Text('Done'),
                        ),
                        const AppBadge.outline(child: Text('Later')),
                      ],
                    ),
                    const AppGap(12),
                    AppSegmentedControl<int>(
                      segments: const [
                        AppSegment(value: 0, label: 'Day'),
                        AppSegment(value: 1, label: 'Week'),
                        AppSegment(value: 2, label: 'Month'),
                      ],
                      selected: 1,
                      onChanged: (_) {},
                    ),
                    const AppGap(12),
                    const AppCard(child: Text('Weekly plan')),
                    const AppGap(12),
                    const AppPanel(title: 'Budget', child: Text('On track')),
                  ],
                ),
              ),
              AppSheetSurface(
                showHandle: true,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  child: Row(
                    children: [
                      const Expanded(child: Text('Sheet')),
                      AppButton.primary(
                        onPressed: noop,
                        child: const Text('Done'),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Each type role set in its own style, with a Vietnamese sample.
class TypographySheet extends StatelessWidget {
  const TypographySheet({super.key});

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final type = tokens.typography;
    final ink = tokens.colorScheme.foreground;
    final rows = <(String, TextStyle)>[
      ('Display', type.display),
      ('Title', type.title),
      ('Heading', type.heading),
      ('Body large', type.bodyLg),
      ('Body: Tiếng Việt, đặt lịch họp', type.body),
      ('Body small', type.bodySm),
      ('Button label', type.ui),
      ('Small button', type.uiSm),
      ('Chip', type.uiCompact),
      ('Caption', type.caption),
      ('OVERLINE 16 THG 11', type.overline),
      ('09:30  1,250,000', type.numeric),
    ];
    return ColoredBox(
      color: Theme.of(context).scaffoldBackgroundColor,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          for (final (text, style) in rows)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(text, style: style.copyWith(color: ink)),
            ),
        ],
      ),
    );
  }
}
