/// <reference types="vite/client" />

declare module '*.json' {
  const value: any;
  export default value;
}

declare module '*.wasm?url' {
  const src: string;
  export default src;
}
