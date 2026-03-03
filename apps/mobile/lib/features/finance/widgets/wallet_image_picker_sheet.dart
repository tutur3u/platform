import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_svg/flutter_svg.dart';
import 'package:mobile/features/finance/utils/wallet_images.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class WalletImagePickerSheet extends StatefulWidget {
  const WalletImagePickerSheet({this.initialImageSrc, super.key});

  final String? initialImageSrc;

  @override
  State<WalletImagePickerSheet> createState() => _WalletImagePickerSheetState();
}

class _WalletImagePickerSheetState extends State<WalletImagePickerSheet> {
  final _searchController = TextEditingController();
  String _query = '';
  int _tabIndex = 0;

  @override
  void initState() {
    super.initState();
    if (widget.initialImageSrc?.startsWith('mobile/') ?? false) {
      _tabIndex = 1;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final images = _tabIndex == 0
        ? filterWalletImages(walletBankImages, _query)
        : filterWalletImages(walletMobileImages, _query);

    return shad.Scaffold(
      headers: [
        shad.AppBar(
          title: Text(l10n.financeWalletPickImage),
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
            shad.Tabs(
              index: _tabIndex,
              onChanged: (value) {
                setState(() {
                  _tabIndex = value;
                  _query = '';
                  _searchController.clear();
                });
              },
              children: [
                shad.TabItem(child: Text(l10n.financeWalletBankTab)),
                shad.TabItem(child: Text(l10n.financeWalletMobileTab)),
              ],
            ),
            const shad.Gap(10),
            shad.TextField(
              controller: _searchController,
              hintText: l10n.financeWalletSearchImage,
              onChanged: (value) => setState(() => _query = value),
              features: [
                const shad.InputFeature.leading(Icon(Icons.search, size: 16)),
                if (_query.isNotEmpty)
                  shad.InputFeature.trailing(
                    shad.IconButton.ghost(
                      onPressed: () {
                        _searchController.clear();
                        setState(() => _query = '');
                      },
                      icon: const Icon(Icons.close, size: 14),
                    ),
                  ),
              ],
            ),
            const shad.Gap(8),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                l10n.financeWalletImageCount(images.length),
                style: shad.Theme.of(context).typography.textSmall.copyWith(
                  color: shad.Theme.of(context).colorScheme.mutedForeground,
                ),
              ),
            ),
            const shad.Gap(8),
            Expanded(
              child: images.isEmpty
                  ? Center(
                      child: Text(
                        l10n.financeNoSearchResults,
                        style: shad.Theme.of(context).typography.textMuted,
                      ),
                    )
                  : GridView.builder(
                      itemCount: images.length,
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 5,
                            crossAxisSpacing: 8,
                            mainAxisSpacing: 8,
                          ),
                      itemBuilder: (context, index) {
                        final image = images[index];
                        final selected =
                            widget.initialImageSrc == image.imageSrc;

                        return Tooltip(
                          message: image.name,
                          child: selected
                              ? shad.PrimaryButton(
                                  onPressed: () =>
                                      Navigator.of(context).pop(image.imageSrc),
                                  child: Padding(
                                    padding: const EdgeInsets.all(2),
                                    child: SvgPicture.network(
                                      walletImageUrl(image.imageSrc),
                                    ),
                                  ),
                                )
                              : shad.OutlineButton(
                                  onPressed: () =>
                                      Navigator.of(context).pop(image.imageSrc),
                                  child: Padding(
                                    padding: const EdgeInsets.all(2),
                                    child: SvgPicture.network(
                                      walletImageUrl(image.imageSrc),
                                    ),
                                  ),
                                ),
                        );
                      },
                    ),
            ),
            if (widget.initialImageSrc != null) ...[
              const shad.Gap(8),
              Align(
                alignment: Alignment.centerRight,
                child: shad.OutlineButton(
                  onPressed: () => Navigator.of(context).pop(''),
                  child: Text(l10n.financeWalletClearImage),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }
}
