/// Icon abstraction for the mobile design system.
///
/// Lucide glyphs come from the maintained standalone `lucide_icons_flutter`
/// package. `LucideIcons.<name>` keeps the legacy shadcn member names, so the
/// migration codemod only drops the `shad.` prefix. The standalone package
/// omits brand marks; [AppIcons] maps the few the app used to neutral glyphs.
library;

import 'package:flutter/widgets.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

export 'package:lucide_icons_flutter/lucide_icons.dart' show LucideIcons;

/// App-owned icon aliases: semantic names for repeated actions plus the brand
/// fallbacks missing from the standalone Lucide set.
abstract final class AppIcons {
  // Semantic actions.
  static const IconData search = LucideIcons.search;
  static const IconData close = LucideIcons.x;
  static const IconData check = LucideIcons.check;
  static const IconData back = LucideIcons.chevronLeft;
  static const IconData forward = LucideIcons.chevronRight;
  static const IconData expand = LucideIcons.chevronsUpDown;
  static const IconData info = LucideIcons.info;
  static const IconData success = LucideIcons.circleCheck;
  static const IconData warning = LucideIcons.triangleAlert;
  static const IconData error = LucideIcons.circleAlert;

  // Brand marks absent from lucide_icons_flutter. Prefer the SVG logos in
  // `assets/logos/` where a real brand mark is required.
  static const IconData codepen = LucideIcons.codeXml;
  static const IconData codesandbox = LucideIcons.box;
  static const IconData dribbble = LucideIcons.circleDot;
  static const IconData facebook = LucideIcons.globe;
  static const IconData figma = LucideIcons.penTool;
  static const IconData framer = LucideIcons.layers;
  static const IconData github = LucideIcons.gitBranch;
  static const IconData gitlab = LucideIcons.gitMerge;
  static const IconData instagram = LucideIcons.camera;
  static const IconData linkedin = LucideIcons.briefcase;
  static const IconData pocket = LucideIcons.bookmark;
  static const IconData railSymbol = LucideIcons.trainFront;
  static const IconData slack = LucideIcons.hash;
  static const IconData trello = LucideIcons.squareKanban;
  static const IconData twitch = LucideIcons.tv;
  static const IconData twitter = LucideIcons.atSign;
  static const IconData youtube = LucideIcons.play;
}
