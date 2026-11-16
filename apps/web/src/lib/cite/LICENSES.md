# Citation engine and style assets

Server metadata text extraction uses `htmlparser2` 12.0.0 under the MIT license.
Its parser is already part of the dependency graph through `@types/sanitize-html`;
the owning web app pins a direct runtime dependency. Upstream source and license:
<https://github.com/fb55/htmlparser2>.

The citation helper runs the unmodified `citeproc` 2.4.63 package (citeproc-js
1.4.63). Copyright (c) 2009-2019 Frank Bennett. The CPAL-1.0 licensing option
applies to that dependency. Its source is available at
<https://github.com/Juris-M/citeproc-js> and through the pinned npm package.
The license text is included in [styles/citeproc-CPAL.txt](styles/citeproc-CPAL.txt).
The package metadata also lists an AGPL option; the source header specifies
AGPL version 3, rather than the metadata's AGPL-1.0 identifier.

The public citation interface displays the CPAL attribution information:
"(c) Frank Bennett", "citeproc-js implements the Citation Style Language", and
<https://citationstyles.org/>. Keep this attribution and the source/license link
when reusing the formatter in another interface.

The APA 7 and RMIT University Harvard styles are supplied by the official
[CSL styles repository](https://github.com/citation-style-language/styles).
The English locale files are supplied by the official
[CSL locales repository](https://github.com/citation-style-language/locales).
These assets are licensed under
[Creative Commons Attribution-ShareAlike 3.0 Unported](https://creativecommons.org/licenses/by-sa/3.0/).
Credit belongs to the CSL project and each author/contributor listed in the
retained XML metadata. The Harvard style lists Katie Finch as its author.

The JSON files store the original XML as strings so the application can import
them without runtime filesystem access. Decoding the JSON produces the
unmodified upstream bytes; authors, translators, licenses, and source links
remain intact. [styles/provenance.json](styles/provenance.json) records immutable
upstream commit URLs and SHA-256 hashes of the decoded XML. Any modified style
must retain attribution and use the same CC BY-SA license.

The style files contain formatting rules. RMIT Easy Cite explanatory prose and
examples are not included. Test fixtures are synthetic. The compatibility label
does not imply affiliation or endorsement by RMIT.
