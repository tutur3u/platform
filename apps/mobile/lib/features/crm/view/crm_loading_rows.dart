part of 'crm_page.dart';

class _CrmLoadingRows extends StatelessWidget {
  const _CrmLoadingRows();
  @override
  Widget build(BuildContext context) {
    final muted = shad.Theme.of(context).colorScheme.muted;
    return Semantics(
      label: context.l10n.commonLoading,
      liveRegion: true,
      child: ExcludeSemantics(
        child: Column(
          children: [
            for (var index = 0; index < 3; index++)
              Padding(
                key: ValueKey('crm-skeleton-$index'),
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: muted,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(width: 160, height: 14, color: muted),
                          const SizedBox(height: 8),
                          Container(width: 100, height: 12, color: muted),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
