import { parse } from 'opentype.js';
import fontUrl from '@fontsource/open-sans/files/open-sans-latin-700-normal.woff?url';
import { buildBrailleStlBinary, type BuildBrailleStlOptions } from '../utils/brailleStl';

export type StlWorkerRequest = {
  type: 'BUILD';
  id: number;
  payload: BuildBrailleStlOptions;
};

export type StlWorkerResponse =
  | { type: 'READY' }
  | { type: 'RESULT'; id: number; buffer: ArrayBuffer }
  | { type: 'ERROR'; id: number; message: string };

let printFontPromise: Promise<import('opentype.js').Font | null> | null = null;

function loadPrintFontOnce(): Promise<import('opentype.js').Font | null> {
  if (!printFontPromise) {
    printFontPromise = fetch(fontUrl)
      .then(r => {
        if (!r.ok) throw new Error(String(r.status));
        return r.arrayBuffer();
      })
      .then(ab => parse(ab))
      .catch(() => null);
  }
  return printFontPromise;
}

self.onmessage = async (ev: MessageEvent<StlWorkerRequest>) => {
  const msg = ev.data;
  if (msg.type !== 'BUILD') return;
  try {
    const lines = msg.payload.unicodeLines;
    const needVectorPrint = Boolean(
      msg.payload.printTextLine?.trim() && Array.isArray(lines) && lines.length === 1,
    );
    const printFont = needVectorPrint ? await loadPrintFontOnce() : undefined;
    const buffer = buildBrailleStlBinary({
      ...msg.payload,
      printFont: printFont ?? undefined,
    });
    const res: StlWorkerResponse = { type: 'RESULT', id: msg.id, buffer };
    self.postMessage(res, [buffer]);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const res: StlWorkerResponse = { type: 'ERROR', id: msg.id, message };
    self.postMessage(res);
  }
};

const ready: StlWorkerResponse = { type: 'READY' };
self.postMessage(ready);
