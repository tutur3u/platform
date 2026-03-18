declare module '*.css';
declare module '*.layer.css';

declare module 'jspdf/dist/jspdf.es.min.js' {
  export * from 'jspdf';
  export { default } from 'jspdf';
}
