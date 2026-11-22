import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import './excalidraw-overrides.css';

// This module is only reached through a dynamic import, so Excalidraw and its
// styles stay out of any bundle until a whiteboard actually renders.
export default Excalidraw;
