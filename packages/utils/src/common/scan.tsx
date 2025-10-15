import { DEV_MODE } from '../constants';

export const ReactScan = () => {
  if (!DEV_MODE) return null;
  return (
    <head>
      <script
        crossOrigin="anonymous"
        src="//unpkg.com/react-scan/dist/auto.global.js"
      />
    </head>
  );
};
