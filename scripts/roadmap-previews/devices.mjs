// Viewport profiles for the roadmap previews. `frame` picks the generic
// device frame composed around the raw capture.
export const DEVICES = {
  mac: { width: 1512, height: 982, scale: 2, frame: 'mac', maxEdge: 1600 },
  ipad: {
    width: 1024,
    height: 1366,
    scale: 2,
    frame: 'tablet',
    touch: true,
    maxEdge: 1600,
  },
  'ipad-landscape': {
    width: 1366,
    height: 1024,
    scale: 2,
    frame: 'tablet',
    touch: true,
    maxEdge: 1600,
  },
  iphone: {
    width: 393,
    height: 852,
    scale: 3,
    frame: 'phone',
    mobile: true,
    maxEdge: 1280,
  },
  // Apple foldable: outer display 1398x2034 (closed), inner 2853x2007 (open).
  'duo-folded': {
    width: 466,
    height: 678,
    scale: 3,
    frame: 'fold-closed',
    mobile: true,
    maxEdge: 1280,
  },
  'duo-unfolded': {
    width: 951,
    height: 669,
    scale: 3,
    frame: 'fold-open',
    mobile: true,
    maxEdge: 1600,
  },
};

export const THEMES = ['light', 'dark'];
export const LOCALES = ['en', 'vi'];
