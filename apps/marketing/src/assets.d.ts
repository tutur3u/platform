declare module '*.webp?url' {
  const url: string;
  export default url;
}
declare module '*.woff2?url' {
  const url: string;
  export default url;
}

declare module 'virtual:landing-styles' {
  const styles: Record<string, { critical: string; remaining: string }>;
  export default styles;
}
