# Shared chart kit

Import `package:mobile/core/ui/charts/charts.dart`. The kit has no feature
imports, chart dependencies, data source, or sample data. All display prose,
summaries, units, coverage notes, and unavailable labels come from the caller's
localized templates. Use exact public labels where the product contract requires
them.

## Data and drawing

`ChartSeries` holds immutable original points and a fixed palette slot. Slot
indices never cycle. Entity-to-slot assignments belong to the adapter. Use
`AppTone` for status and severity, with `StatusGlyph` for a shape and word.
Waiting uses `ChartPattern.forward`; unknown uses `backward`, a neutral tone,
and a dashed style. Success is solid and rework dashed. Critical open uses a
destructive tone and diamond; closed uses neutral, dashed, hollow diamonds.

`segment` splits nulls and temporal gaps and flags the last bucket partial.
Pass a cadence for known buckets; otherwise the neighbour rule applies.
`LinePainter` supports solid, dashed, and step lines, fixed or signed axes,
and `ChartBand` time/reset or value/floor rules. Supply absolute GMT+7 reset
labels. `ChartValueAxis` accepts a localized unit or value formatter (for
example seconds displayed as minutes). Counts start at zero; remaining and
rate charts use `ChartValueAxis.percent`.

`StackedAreaPainter` aligns timestamps and breaks the entire stack at an
incomplete bucket. Line and area painters use drawing-only min/max decimation;
never decimate the table or summary input. `StackedBarPainter` supports vertical,
horizontal, and diverging stacks. Null values never become bars at zero.

`HeatmapPainter` takes `ChartMatrix`; transpose severity/status matrices below
600dp in the adapter, using `transpose()` to preserve header hatch metadata.
Use outlined cells for critical severity, and hatched terminal headers.
Null cells are dashed; a known zero gets the lightest of five ramp steps.
`SankeyPainter` uses five fixed role indices and directed proportional ribbons.
`TreemapPainter` takes weighted, labelled, patterned tiles. Supply role/product
labels and localized aggregate detail through the readout; no thread identity
belongs in these objects. Tile labels remain in semantics even when too small
to paint. `Sparkline` uses the same line/gap renderer without axes.

## Interaction and tables

Own and dispose a widget-local `ChartSelectionController`. `ChartPlot` takes
bucket and series counts and a `painterBuilder`; pass the selection to the
painter's selected index parameters. For irregular time spacing, supply
`bucketPositions` normalized to the actual plot x positions (including axis
insets). For matrices, horizontal bars and tiles, supply a `hitTest` using the
same rectangles as the painter (`HeatmapPainter.cellRect`,
`chartTreemapRects`). This keeps touch selection and the visible outline aligned.

Place `ChartReadout` below the plot. Its localized callback handles the selected
indices; `chartPointReadout` provides GMT+7 date/time, series, value/unit,
coverage, unknown and partial-bucket labels for time series. Include samples or
other domain qualifiers in the callback when required. Left/right and semantics
increase/decrease step buckets, up/down cycle series, Escape clears. Horizontal
drag selects while vertical drag remains available to the parent scroll view.
Selection and painting have no tickers or entry animations.

`ChartPanel` places the summary first, followed by optional coverage, plot,
wrapping shape legend, live readout and the localized Table action. The caller
provides the same summary as `ChartPlot.summary`, the filtered `ChartTableData`
and a Table action that opens that data. Omit the plot when coverage is missing
or unavailable; compose partial/stale summaries before passing them in.
`ChartTableData.fromSeries` uses the original filtered points and unknown cells.
Categorical tables supply their own exact public headers and rows. `ChartTable`
renders grouped rows, switching to stacked fields at text scale 2.0.
`ChartTableRow` can be built lazily in a detail-page sliver.

## Verification

Run in `apps/mobile`, in the foreground through shared resource admission:

```sh
ttr resources run -- flutter test test/core/ui/charts --concurrency=1
ttr resources run -- flutter analyze lib/core/ui/charts test/core/ui/charts test/helpers/golden_tolerance.dart
```

Goldens use Ahem, 360×220 logical pixels, light/dark and text scales 1/2.
`test/helpers/golden_tolerance.dart` permits at most 0.5% differing pixels and
emits standard Flutter comparison artifacts on failure. Generate references
with the same test and `--update-goldens`; confirm the PR's exact head in CI.
If CI exceeds tolerance, use its actual-image artifact to replace the affected
reference. Never increase the tolerance. The `golden` tag allows a dedicated
golden pass without changing the normal suite's coverage.
