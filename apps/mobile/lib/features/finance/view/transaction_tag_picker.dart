import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/tag.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

Future<String?> showTransactionTagPicker(
  BuildContext context,
  String? selected,
) async {
  final workspace = context.read<WorkspaceCubit>();
  final auth = context.read<AuthCubit?>();
  final wsId = workspace.state.currentWorkspace?.id;
  final actor = auth?.state.user?.id;
  if (wsId == null) return null;
  final repository = context.read<FinanceRepository>();
  bool active() =>
      context.mounted &&
      workspace.state.currentWorkspace?.id == wsId &&
      auth?.state.user?.id == actor;

  final tags = CacheStore.awaitRevalidation(() => repository.getTags(wsId));
  final selection = await showAppSheet<String>(
    context: context,
    builder: (_) => _TagOptions(tags: tags, selected: selected, active: active),
  );
  return active() ? selection : null;
}

class _TagOptions extends StatelessWidget {
  const _TagOptions({
    required this.tags,
    required this.selected,
    required this.active,
  });

  final Future<List<FinanceTag>> tags;
  final String? selected;
  final bool Function() active;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return FutureBuilder(
      future: tags,
      builder: (context, snapshot) {
        final options = active() ? snapshot.data : null;
        return AppSheetScaffold(
          title: l10n.financeTags,
          slivers: [
            if (snapshot.connectionState != ConnectionState.done)
              const SliverToBoxAdapter(child: AppSkeletonRows())
            else if (options == null)
              SliverToBoxAdapter(
                child: AppStateMessage.inline(
                  icon: LucideIcons.circleAlert,
                  title: l10n.commonSomethingWentWrong,
                  tone: AppTone.destructive,
                ),
              )
            else ...[
              SliverToBoxAdapter(
                child: AppOptionTile(
                  title: l10n.financeAll,
                  selected: selected == null,
                  onTap: () => Navigator.of(context).pop(''),
                ),
              ),
              if (options.isEmpty)
                SliverToBoxAdapter(
                  child: AppStateMessage.inline(
                    icon: LucideIcons.tags,
                    title: l10n.financeNoTags,
                  ),
                ),
              SliverList.builder(
                itemCount: options.length,
                itemBuilder: (context, index) {
                  final tag = options[index];
                  return AppOptionTile(
                    key: ValueKey(tag.id),
                    title: tag.name,
                    subtitle: tag.description,
                    selected: selected == tag.id,
                    onTap: () => Navigator.of(context).pop(tag.id),
                  );
                },
              ),
            ],
          ],
        );
      },
    );
  }
}
