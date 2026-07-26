declare module 'espeak-ng' {
  type ESpeakModule = {
    FS: {
      writeFile: (path: string, data: string | Uint8Array) => void;
      readFile: (path: string, opts?: { encoding?: string }) => Uint8Array | string;
    };
  };

  type ESpeakFactory = (opts?: {
    arguments?: string[];
    preRun?: Array<(mod: ESpeakModule) => void>;
    locateFile?: (path: string) => string;
  }) => Promise<ESpeakModule>;

  const ESpeakNg: ESpeakFactory;
  export default ESpeakNg;
}
