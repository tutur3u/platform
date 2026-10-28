import 'package:flutter/widgets.dart';

/// True once Dynamic Type scales text past 130%: the activity tiles go two by
/// two, the freshness line wraps, and trailing row content moves under the
/// title so long Vietnamese labels never clip.
bool mastermindLargeText(BuildContext context) =>
    MediaQuery.textScalerOf(context).scale(10) > 13;
