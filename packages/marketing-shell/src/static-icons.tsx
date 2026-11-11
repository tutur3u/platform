import { createElement, type SVGProps } from 'react';

// Lucide geometry, generated from lucide-static/icons (ISC; see static-icons.LICENSE).
// Plain SVG has no client context or hydration dependency.
type Node = [string, Record<string, string>];
function icon(nodes: Node[]) {
  return function StaticIcon({
    size = 24,
    ...props
  }: SVGProps<SVGSVGElement> & { size?: number }) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {nodes.map(([tag, attrs], index) =>
          createElement(tag, { ...attrs, key: index })
        )}
      </svg>
    );
  };
}

export const ArrowRight = icon([
  ['path', { d: 'M5 12h14' }],
  ['path', { d: 'm12 5 7 7-7 7' }],
]);
export const BookText = icon([
  [
    'path',
    {
      d: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20',
    },
  ],
  ['path', { d: 'M8 11h8' }],
  ['path', { d: 'M8 7h6' }],
]);
export const Bot = icon([
  ['path', { d: 'M12 8V4H8' }],
  ['rect', { width: '16', height: '12', x: '4', y: '8', rx: '2' }],
  ['path', { d: 'M2 14h2' }],
  ['path', { d: 'M20 14h2' }],
  ['path', { d: 'M15 13v2' }],
  ['path', { d: 'M9 13v2' }],
]);
export const Boxes = icon([
  [
    'path',
    {
      d: 'M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z',
    },
  ],
  ['path', { d: 'm7 16.5-4.74-2.85' }],
  ['path', { d: 'm7 16.5 5-3' }],
  ['path', { d: 'M7 16.5v5.17' }],
  [
    'path',
    {
      d: 'M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z',
    },
  ],
  ['path', { d: 'm17 16.5-5-3' }],
  ['path', { d: 'm17 16.5 4.74-2.85' }],
  ['path', { d: 'M17 16.5v5.17' }],
  [
    'path',
    {
      d: 'M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z',
    },
  ],
  ['path', { d: 'M12 8 7.26 5.15' }],
  ['path', { d: 'm12 8 4.74-2.85' }],
  ['path', { d: 'M12 13.5V8' }],
]);
export const Building2 = icon([
  ['path', { d: 'M10 12h4' }],
  ['path', { d: 'M10 8h4' }],
  ['path', { d: 'M14 21v-3a2 2 0 0 0-4 0v3' }],
  [
    'path',
    {
      d: 'M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2',
    },
  ],
  ['path', { d: 'M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16' }],
]);
export const Calendar = icon([
  ['path', { d: 'M8 2v3' }],
  ['path', { d: 'M16 2v3' }],
  ['rect', { x: '3', y: '3', width: '18', height: '18', rx: '2' }],
  ['path', { d: 'M3 9h18' }],
]);
export const CalendarClock = icon([
  ['path', { d: 'M16 14v2.2l1.6 1' }],
  ['path', { d: 'M16 2v3' }],
  [
    'path',
    { d: 'M21 7.338V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h2.338' },
  ],
  ['path', { d: 'M3 9h5.859' }],
  ['path', { d: 'M8 2v3' }],
  ['circle', { cx: '16', cy: '16', r: '6' }],
]);
export const CheckCircle2 = icon([
  ['circle', { cx: '12', cy: '12', r: '10' }],
  ['path', { d: 'm16 9-5.5 5.5L8 12' }],
]);
export const ClipboardList = icon([
  ['rect', { width: '8', height: '4', x: '8', y: '2', rx: '1', ry: '1' }],
  [
    'path',
    {
      d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
    },
  ],
  ['path', { d: 'M12 11h4' }],
  ['path', { d: 'M12 16h4' }],
  ['path', { d: 'M8 11h.01' }],
  ['path', { d: 'M8 16h.01' }],
]);
export const Code2 = icon([
  ['path', { d: 'm18 16 4-4-4-4' }],
  ['path', { d: 'm6 8-4 4 4 4' }],
  ['path', { d: 'm14.5 4-5 16' }],
]);
export const Download = icon([
  ['path', { d: 'M12 15V3' }],
  ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
  ['path', { d: 'm7 10 5 5 5-5' }],
]);
export const FileText = icon([
  [
    'path',
    {
      d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z',
    },
  ],
  ['path', { d: 'M14 2v5a1 1 0 0 0 1 1h5' }],
  ['path', { d: 'M10 9H8' }],
  ['path', { d: 'M16 13H8' }],
  ['path', { d: 'M16 17H8' }],
]);
export const Fingerprint = icon([
  ['path', { d: 'M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4' }],
  ['path', { d: 'M14 13.12c0 2.38 0 6.38-1 8.88' }],
  ['path', { d: 'M17.29 21.02c.12-.6.43-2.3.5-3.02' }],
  ['path', { d: 'M2 12a10 10 0 0 1 18-6' }],
  ['path', { d: 'M2 16h.01' }],
  ['path', { d: 'M21.8 16c.2-2 .131-5.354 0-6' }],
  ['path', { d: 'M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2' }],
  ['path', { d: 'M8.65 22c.21-.66.45-1.32.57-2' }],
  ['path', { d: 'M9 6.8a6 6 0 0 1 9 5.2v2' }],
]);
export const Folder = icon([
  [
    'path',
    {
      d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
    },
  ],
]);
export const GraduationCap = icon([
  [
    'path',
    {
      d: 'M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z',
    },
  ],
  ['path', { d: 'M22 10v6' }],
  ['path', { d: 'M6 12.5V16a6 3 0 0 0 12 0v-3.5' }],
]);
export const HeartHandshake = icon([
  [
    'path',
    {
      d: 'M19.414 14.414C21 12.828 22 11.5 22 9.5a5.5 5.5 0 0 0-9.591-3.676.6.6 0 0 1-.818.001A5.5 5.5 0 0 0 2 9.5c0 2.3 1.5 4 3 5.5l5.535 5.362a2 2 0 0 0 2.879.052 2.12 2.12 0 0 0-.004-3 2.124 2.124 0 1 0 3-3 2.124 2.124 0 0 0 3.004 0 2 2 0 0 0 0-2.828l-1.881-1.882a2.41 2.41 0 0 0-3.409 0l-1.71 1.71a2 2 0 0 1-2.828 0 2 2 0 0 1 0-2.828l2.823-2.762',
    },
  ],
]);
export const History = icon([
  ['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }],
  ['path', { d: 'M3 3v5h5' }],
  ['path', { d: 'M12 7v5l4 2' }],
]);
export const Mail = icon([
  ['path', { d: 'm22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7' }],
  ['rect', { x: '2', y: '4', width: '20', height: '16', rx: '2' }],
]);
export const MessageSquare = icon([
  [
    'path',
    {
      d: 'M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z',
    },
  ],
]);
export const Package = icon([
  [
    'path',
    {
      d: 'M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z',
    },
  ],
  ['path', { d: 'M12 22V12' }],
  ['polyline', { points: '3.29 7 12 12 20.71 7' }],
  ['path', { d: 'm7.5 4.27 9 5.15' }],
]);
export const Paintbrush = icon([
  ['path', { d: 'm14.622 17.897-10.68-2.913' }],
  [
    'path',
    {
      d: 'M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z',
    },
  ],
  [
    'path',
    {
      d: 'M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15',
    },
  ],
]);
export const PlayCircle = icon([
  [
    'path',
    {
      d: 'M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z',
    },
  ],
  ['circle', { cx: '12', cy: '12', r: '10' }],
]);
export const QrCode = icon([
  ['rect', { width: '5', height: '5', x: '3', y: '3', rx: '1' }],
  ['rect', { width: '5', height: '5', x: '16', y: '3', rx: '1' }],
  ['rect', { width: '5', height: '5', x: '3', y: '16', rx: '1' }],
  ['path', { d: 'M21 16h-3a2 2 0 0 0-2 2v3' }],
  ['path', { d: 'M21 21v.01' }],
  ['path', { d: 'M12 7v3a2 2 0 0 1-2 2H7' }],
  ['path', { d: 'M3 12h.01' }],
  ['path', { d: 'M12 3h.01' }],
  ['path', { d: 'M12 16v.01' }],
  ['path', { d: 'M16 12h1' }],
  ['path', { d: 'M21 12v.01' }],
  ['path', { d: 'M12 21v-1' }],
]);
export const Shield = icon([
  [
    'path',
    {
      d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
    },
  ],
]);
export const Sparkles = icon([
  [
    'path',
    {
      d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z',
    },
  ],
  ['path', { d: 'M20 2v4' }],
  ['path', { d: 'M22 4h-4' }],
  ['circle', { cx: '4', cy: '20', r: '2' }],
]);
export const Store = icon([
  ['path', { d: 'M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5' }],
  [
    'path',
    {
      d: 'M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244',
    },
  ],
  ['path', { d: 'M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05' }],
]);
export const Timer = icon([
  ['line', { x1: '10', x2: '14', y1: '2', y2: '2' }],
  ['line', { x1: '12', x2: '15', y1: '14', y2: '11' }],
  ['circle', { cx: '12', cy: '14', r: '8' }],
]);
export const Users = icon([
  ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
  ['path', { d: 'M16 3.128a4 4 0 0 1 0 7.744' }],
  ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }],
  ['circle', { cx: '9', cy: '7', r: '4' }],
]);
export const Wallet = icon([
  [
    'path',
    {
      d: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1',
    },
  ],
  ['path', { d: 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4' }],
]);
export const Zap = icon([
  [
    'path',
    {
      d: 'M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z',
    },
  ],
]);
