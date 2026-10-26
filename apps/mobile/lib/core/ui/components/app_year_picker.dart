import 'package:flutter/material.dart';
import 'package:mobile/core/ui/components/app_option_tile.dart';
import 'package:mobile/core/ui/overlays/app_sheet_scaffold.dart';
import 'package:mobile/core/ui/overlays/app_sheet_search.dart';

class AppYearPicker extends StatefulWidget {
  const AppYearPicker({
    required this.initialYear,
    required this.firstYear,
    required this.lastYear,
    super.key,
  });
  final int initialYear;
  final int firstYear;
  final int lastYear;
  @override
  State<AppYearPicker> createState() => _AppYearPickerState();
}

class _AppYearPickerState extends State<AppYearPicker> {
  final _search = TextEditingController();
  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final m = MaterialLocalizations.of(context);
    return AppSheetScaffold(
      title: m.datePickerHelpText,
      search: AppSheetSearch(
        controller: _search,
        hint: m.datePickerHelpText,
        onChanged: (_) => setState(() {}),
      ),
      slivers: [
        SliverList.list(
          children: [
            for (var year = widget.firstYear; year <= widget.lastYear; year++)
              if ('$year'.contains(_search.text.trim()))
                AppOptionTile(
                  title: m.formatYear(DateTime(year)),
                  selected: year == widget.initialYear,
                  onTap: () => Navigator.of(context).pop(year),
                ),
          ],
        ),
      ],
    );
  }
}
