import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';

/// Gallery boards that show every kit component with fictional data. Each
/// board is one page of the gallery render.
enum KitBoard { overview, lists, states }

class KitGalleryBoard extends StatefulWidget {
  const KitGalleryBoard(this.board, {super.key});

  final KitBoard board;

  @override
  State<KitGalleryBoard> createState() => _KitGalleryBoardState();
}

class _KitGalleryBoardState extends State<KitGalleryBoard> {
  String _filter = 'all';
  String _range = 'week';

  @override
  Widget build(BuildContext context) => AppPageListView(
    kind: AppPageKind.root,
    children: switch (widget.board) {
      KitBoard.overview => _overview(),
      KitBoard.lists => _lists(),
      KitBoard.states => _states(),
    },
  );

  List<Widget> _overview() => [
    AppSummaryHero(
      icon: LucideIcons.wallet,
      tone: AppTone.success,
      eyebrow: 'October balance',
      headline: '12,480,000 VND',
      supporting: 'Spending is 8% lower than last month.',
      facts: const [
        AppHeroFact(label: 'Income', value: '18.2M'),
        AppHeroFact(label: 'Expenses', value: '5.7M'),
        AppHeroFact(label: 'Wallets', value: '4'),
      ],
      actions: [
        AppButton.primary(
          onPressed: () {},
          leading: const Icon(LucideIcons.plus, size: 16),
          child: const Text('Add transaction'),
        ),
        AppButton.outline(onPressed: () {}, child: const Text('Report')),
      ],
    ),
    const SizedBox(height: AppLayout.sectionGap),
    AppSectionHeader(
      title: 'This week',
      subtitle: 'Across every wallet',
      count: 4,
      actionLabel: 'See all',
      onAction: () {},
    ),
    AppAdaptiveGrid(
      equalHeight: true,
      children: [
        AppStatTile(
          label: 'Tasks done',
          value: '28',
          icon: LucideIcons.circleCheck,
          tone: AppTone.primary,
          trend: const AppStatTrend(
            label: '+6',
            direction: AppTrendDirection.up,
          ),
          onTap: () {},
        ),
        const AppStatTile(
          label: 'Focus time',
          value: '14h 20m',
          icon: LucideIcons.timer,
          tone: AppTone.info,
          caption: 'Goal 20h',
          progress: 0.72,
        ),
        const AppStatTile(
          label: 'Spent',
          value: '5.7M',
          icon: LucideIcons.trendingDown,
          tone: AppTone.warning,
          trend: AppStatTrend(
            label: '-8%',
            direction: AppTrendDirection.down,
            positive: true,
          ),
        ),
        const AppStatTile(
          label: 'Overdue',
          value: '3',
          icon: LucideIcons.alarmClock,
          tone: AppTone.destructive,
          caption: 'Since Monday',
        ),
      ],
    ),
    const SizedBox(height: AppLayout.sectionGap),
    const AppPanel(
      title: 'Budget',
      subtitle: '3 of 5 categories on track',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _MeterLine('Groceries', 0.64, AppTone.success),
          SizedBox(height: AppSpacing.md),
          _MeterLine('Transport', 0.91, AppTone.warning),
          SizedBox(height: AppSpacing.md),
          _MeterLine('Dining out', 1.2, AppTone.destructive),
          SizedBox(height: AppSpacing.sm),
          AppKeyValueRow(label: 'Period', value: '1 – 31 October'),
          AppKeyValueRow(label: 'Remaining', value: '2,300,000 VND'),
        ],
      ),
    ),
  ];

  List<Widget> _lists() => [
    AppSegmentedControl<String>(
      segments: const [
        AppSegment(value: 'day', label: 'Day'),
        AppSegment(value: 'week', label: 'Week'),
        AppSegment(value: 'month', label: 'Month', icon: LucideIcons.calendar),
      ],
      selected: _range,
      onChanged: (value) => setState(() => _range = value),
    ),
    const SizedBox(height: AppSpacing.md),
    AppFilterBar<String>(
      options: const [
        AppFilterOption(value: 'all', label: 'All', count: 42),
        AppFilterOption(value: 'income', label: 'Income', count: 9),
        AppFilterOption(value: 'expense', label: 'Expenses', count: 33),
        AppFilterOption(
          value: 'recurring',
          label: 'Recurring',
          icon: LucideIcons.repeat,
        ),
      ],
      selected: _filter,
      onSelected: (value) => setState(() => _filter = value),
      trailing: AppFilterButton(
        label: 'Newest',
        tooltip: 'Sort',
        onPressed: () {},
      ),
    ),
    const SizedBox(height: AppSpacing.lg),
    const AppSectionHeader(title: 'Today', count: 3),
    AppGroupedCard(
      dividerInset: AppLayout.rowHorizontalPadding,
      children: [
        AppRichRow(
          leading: const AppIconTile(
            icon: LucideIcons.shoppingCart,
            tone: AppTone.warning,
            size: 40,
          ),
          title: 'Weekly groceries',
          subtitle: 'Market on Le Loi',
          meta: const [
            AppMetaItem(icon: LucideIcons.wallet, label: 'Cash'),
            AppMetaItem(icon: LucideIcons.clock, label: '09:40'),
          ],
          trailing: const Text('-420,000'),
          trailingCaption: 'VND',
          onTap: () {},
        ),
        AppRichRow(
          leading: const AppIconTile(
            icon: LucideIcons.briefcase,
            tone: AppTone.success,
            size: 40,
          ),
          title: 'Design retainer',
          subtitle: 'Studio North',
          meta: const [AppMetaItem(icon: LucideIcons.landmark, label: 'Bank')],
          trailing: const Text('+8,000,000'),
          trailingCaption: 'VND',
          selected: true,
          onTap: () {},
        ),
        AppRichRow(
          leading: const AppIconTile(icon: LucideIcons.fileText, size: 40),
          title: 'Quarterly report with a deliberately long title that wraps',
          meta: [
            AppMetaItem(
              icon: LucideIcons.calendarClock,
              label: 'Overdue 2 days',
              color: context.tokens.colorScheme.destructive,
            ),
            const AppMetaItem(icon: LucideIcons.users, label: '3 people'),
          ],
          trailing: const AppBadge(
            variant: AppBadgeVariant.warning,
            child: Text('Review'),
          ),
          onTap: () {},
        ),
      ],
    ),
    const SizedBox(height: AppLayout.sectionGap),
    const AppSectionHeader(title: 'Settings-style rows'),
    AppGroupedCard(
      children: [
        AppGroupedRow(
          leading: const AppIconTile(
            icon: LucideIcons.bell,
            tone: AppTone.info,
          ),
          title: const Text('Reminders'),
          subtitle: const Text('Daily at 08:00'),
          showChevron: true,
          onTap: () {},
        ),
        const AppGroupedRow(
          leading: AppIconTile(icon: LucideIcons.tag, badge: true),
          title: Text('Categories'),
          trailing: Text('12'),
        ),
      ],
    ),
  ];

  List<Widget> _states() => [
    const AppSectionHeader(
      title: 'Empty, error and loading',
      subtitle: 'AppStateMessage and AppSkeletonRows from core/layout',
    ),
    AppPanel(
      child: AppStateMessage(
        icon: LucideIcons.inbox,
        title: 'No transactions yet',
        message: 'Add your first income or expense to see it here.',
        actionLabel: 'Add transaction',
        onAction: () {},
      ),
    ),
    const SizedBox(height: AppLayout.itemGap),
    AppGroupedCard(
      children: [
        AppStateMessage.inline(
          icon: LucideIcons.wifiOff,
          tone: AppTone.destructive,
          title: 'Could not refresh',
          message: 'Showing saved data from 10:24.',
          actionLabel: 'Retry',
          onAction: () {},
        ),
      ],
    ),
    const SizedBox(height: AppLayout.itemGap),
    const AppGroupedCard(children: [AppSkeletonRows()]),
    const SizedBox(height: AppLayout.sectionGap),
    const AppSectionHeader(title: 'Adaptive grid', count: 6),
    AppAdaptiveGrid(
      minTileWidth: 120,
      maxColumns: 6,
      children: [
        for (final (icon, label) in const [
          (LucideIcons.folder, 'Contracts'),
          (LucideIcons.image, 'Photos'),
          (LucideIcons.music, 'Audio'),
          (LucideIcons.fileSpreadsheet, 'Budgets'),
          (LucideIcons.archive, 'Archive'),
          (LucideIcons.presentation, 'Decks'),
        ])
          _GridTile(icon: icon, label: label),
      ],
    ),
  ];
}

class _MeterLine extends StatelessWidget {
  const _MeterLine(this.label, this.value, this.tone);

  final String label;
  final double value;
  final AppTone tone;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: tokens.typography.small.copyWith(
                  color: tokens.colorScheme.foreground,
                ),
              ),
            ),
            Text(
              '${(value * 100).round()}%',
              style: tokens.typography.small.copyWith(
                color: tokens.colorScheme.mutedForeground,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.xs + 2),
        AppMeter(value: value, tone: tone),
      ],
    );
  }
}

class _GridTile extends StatelessWidget {
  const _GridTile({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => AppCard(
    onTap: () {},
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppIconTile(icon: icon, tone: AppTone.primary, size: 36),
        const SizedBox(height: AppSpacing.md),
        Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
      ],
    ),
  );
}
