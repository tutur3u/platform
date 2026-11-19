import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/widgets/finance_workspace_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

Future<String?> showTransactionCreatorPicker(
  BuildContext context,
  String? selected,
) async {
  final session = FinanceSheetSession(context);
  final repository = context.read<FinanceRepository>();
  String? selection;
  await session.run(
    (context) => _CreatorOptions(
      load: () => repository.getTransactionCreators(session.workspaceId),
      selected: selected,
      choose: (id) {
        if (!session.allows('view_transactions')) return;
        selection = id;
        Navigator.of(context).pop();
      },
    ),
  );
  return selection;
}

class _CreatorOptions extends StatefulWidget {
  const _CreatorOptions({
    required this.load,
    required this.selected,
    required this.choose,
  });

  final Future<List<TransactionCreator>> Function() load;
  final String? selected;
  final ValueChanged<String> choose;

  @override
  State<_CreatorOptions> createState() => _CreatorOptionsState();
}

class _CreatorOptionsState extends State<_CreatorOptions> {
  late Future<List<TransactionCreator>> _creators = widget.load();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return FutureBuilder(
      future: _creators,
      builder: (context, snapshot) {
        final options = snapshot.data ?? const <TransactionCreator>[];
        return AppSheetScaffold(
          title: l10n.financeCreator,
          slivers: [
            SliverToBoxAdapter(
              child: AppOptionTile(
                title: l10n.financeAll,
                selected: widget.selected == null,
                onTap: () => widget.choose(''),
              ),
            ),
            if (snapshot.connectionState != ConnectionState.done)
              const SliverToBoxAdapter(child: AppSkeletonRows())
            else if (snapshot.hasError)
              SliverToBoxAdapter(
                child: AppStateMessage.inline(
                  icon: LucideIcons.circleAlert,
                  tone: AppTone.destructive,
                  title: l10n.commonSomethingWentWrong,
                  actionLabel: l10n.commonRetry,
                  onAction: () => setState(() => _creators = widget.load()),
                ),
              )
            else if (options.isEmpty)
              SliverToBoxAdapter(
                child: AppStateMessage.inline(
                  icon: LucideIcons.userRound,
                  title: l10n.financeNoCreators,
                ),
              )
            else
              SliverList.builder(
                itemCount: options.length,
                itemBuilder: (context, index) {
                  final creator = options[index];
                  return AppOptionTile(
                    key: ValueKey(creator.id),
                    title: creator.name ?? l10n.financeUnknownCreator,
                    selected: widget.selected == creator.id,
                    onTap: () => widget.choose(creator.id),
                  );
                },
              ),
          ],
        );
      },
    );
  }
}
