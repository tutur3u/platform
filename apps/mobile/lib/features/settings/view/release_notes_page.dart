import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/features/settings/view/release_notes.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class ReleaseNotesPage extends StatefulWidget {
  const ReleaseNotesPage({super.key});

  @override
  State<ReleaseNotesPage> createState() => _ReleaseNotesPageState();
}

class _ReleaseNotesPageState extends State<ReleaseNotesPage> {
  late final Future<List<MobileReleaseNote>> _notes = MobileReleaseNotes.load();
  late final Future<PackageInfo> _packageInfo = PackageInfo.fromPlatform();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    return shad.Scaffold(
      child: ResponsiveWrapper(
        maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
        child: FutureBuilder<List<MobileReleaseNote>>(
          future: _notes,
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return Center(
                child: Text(l10n.settingsReleaseHistoryUnavailable),
              );
            }
            if (!snapshot.hasData) {
              return const Center(child: CircularProgressIndicator.adaptive());
            }
            final releases = snapshot.data!;
            return ListView.builder(
              padding: EdgeInsets.fromLTRB(
                ResponsivePadding.horizontal(context.deviceClass),
                16,
                ResponsivePadding.horizontal(context.deviceClass),
                32 + MediaQuery.paddingOf(context).bottom,
              ),
              itemCount: releases.length + 1,
              itemBuilder: (context, index) {
                if (index == 0) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          l10n.settingsWhatsNew,
                          style: theme.typography.large.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          l10n.settingsReleaseHistoryDescription,
                          style: theme.typography.textSmall.copyWith(
                            color: theme.colorScheme.mutedForeground,
                          ),
                        ),
                        const SizedBox(height: 14),
                        FutureBuilder<PackageInfo>(
                          future: _packageInfo,
                          builder: (context, info) => Text(
                            info.data == null
                                ? l10n.settingsAppVersion
                                : '${l10n.settingsAppVersion} · '
                                      '${info.data!.version} '
                                      '(${info.data!.buildNumber})',
                            style: theme.typography.textSmall.copyWith(
                              color: theme.colorScheme.primary,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                }
                final release = releases[index - 1];
                return Padding(
                  padding: const EdgeInsets.only(bottom: 9),
                  child: _ReleaseCard(
                    release: release,
                    initiallyExpanded: index == 1,
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class _ReleaseCard extends StatelessWidget {
  const _ReleaseCard({required this.release, required this.initiallyExpanded});

  final MobileReleaseNote release;
  final bool initiallyExpanded;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final date = MaterialLocalizations.of(
      context,
    ).formatMediumDate(release.date);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        border: Border.all(color: theme.colorScheme.border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: ExpansionTile(
          initiallyExpanded: initiallyExpanded,
          title: Text(
            release.version,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          subtitle: Text(date),
          childrenPadding: const EdgeInsets.fromLTRB(17, 0, 17, 15),
          children: [
            if (release.changes.isEmpty)
              Text(context.l10n.settingsReleaseNoDetails)
            else
              for (final change in release.changes)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: CircleAvatar(
                          radius: 3,
                          backgroundColor: theme.colorScheme.primary,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(child: Text(change)),
                    ],
                  ),
                ),
          ],
        ),
      ),
    );
  }
}
