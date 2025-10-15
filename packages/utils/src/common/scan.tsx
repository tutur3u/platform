import { DEV_MODE } from '../constants';

const enabled = false;

export const ReactScan = () => {
  if (!DEV_MODE || !enabled) return null;
  return (
    <head>
      <script
        crossOrigin="anonymous"
        src="//unpkg.com/react-scan/dist/auto.global.js"
      />
    </head>
  );
};
