import 'package:flutter/material.dart';
import 'package:mobile/core/ui/overlays/app_sheet_scaffold.dart';
import 'package:mobile/core/ui/overlays/show_app_sheet.dart';

Future<void> showAppInfoSheet({
  required BuildContext context,
  required String title,
  required String body,
}) => showAppSheet<void>(
  context: context,
  builder: (_) => AppSheetScaffold(title: title, child: Text(body)),
);
