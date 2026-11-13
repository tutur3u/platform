"""Generate EN/VI subsets and a normal 400 face, preserving outlines and hinting.
Requires fonttools[woff]==4.60.2 and brotli==1.2.1; the upstream OFL is retained.
"""
from pathlib import Path
from fontTools import subset

root = Path(__file__).resolve().parents[1] / 'src' / 'fonts'
ranges = {
    'latin': 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
    'vietnamese': 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
}
for name, unicodes in ranges.items():
    subset.main([str(root / 'jetbrains-mono-variable.woff2'), f'--unicodes={unicodes}', '--layout-features=*', '--name-IDs=*', '--flavor=woff2', f'--output-file={root / ("jetbrains-mono-" + name + ".woff2")}'])

# The first viewport uses normal-weight microcopy. A static 400 instance keeps
# that path small while the variable subsets still cover every other weight.
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
for name, unicodes in ranges.items():
    options = subset.Options()
    options.name_IDs = ['*']
    font = TTFont(root / 'jetbrains-mono-variable.woff2', recalcTimestamp=False)
    instantiateVariableFont(font, {'wght': 400}, inplace=True)
    worker = subset.Subsetter(options=options)
    worker.populate(unicodes=subset.parse_unicodes(unicodes))
    worker.subset(font)
    font.flavor = 'woff2'
    font.save(root / ('jetbrains-mono-400-' + name + '.woff2'))
