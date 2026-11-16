# Citation core and formatting assets

Tuturuuu's authored TypeScript modules use the repository MIT license. The
formatter imports unmodified `citeproc` 2.4.63 (citeproc-js 1.4.63), Copyright
(c) 2009-2019 Frank Bennett, under its CPAL-1.0 option. Its source is available
at <https://github.com/Juris-M/citeproc-js>. The complete CPAL notice is retained
in `styles/citeproc-CPAL.txt`.

Interfaces using this formatter display `(c) Frank Bennett`,
`citeproc-js implements the Citation Style Language`,
<https://citationstyles.org/>, and the engine source/license links. This package
does not modify the citeproc engine or elect the alternative AGPL license.

The official APA, RMIT University Harvard and English locale XML assets are from
the CSL project under CC BY-SA 3.0. Original authors, contributors and notices
remain in the decoded XML. `styles/provenance.json` records immutable upstream
sources and SHA256 hashes. Retain attribution and
<https://creativecommons.org/licenses/by-sa/3.0/> when distributing the styles.

`styles/harvard-phase1.csl.json` is a Tuturuuu modification of the RMIT University
Harvard style by Katie Finch. It remains CC BY-SA 3.0 and retains the original
author and license. Its derived identity, changes and decoded XML SHA256 are in
`styles/harvard-phase1-provenance.json`. The overrides cover text conjunctions,
three-author et al., colon locators, given-name/year disambiguation, article
quotes, DOI/place fallback, website/accessed dates, and source medium/version.
Claims are limited to tested synthetic cases; this is not a blanket assertion of
RMIT rule parity. RMIT Easy Cite prose and worked examples are not included.

The legacy `formatCitation` adapter retains the unmodified official styles to
preserve the standalone helper's established outputs. New `formatWork` and
`formatDocument` APIs use the derived Harvard style. The compatibility label is
`Compatible with RMIT Easy Cite styles`; it does not imply RMIT endorsement.

`htmlparser2` 12.0.0 parses rich engine output into an explicit text/mark allowlist.
It uses the MIT license; source: <https://github.com/fb55/htmlparser2>.
