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

self.onmessage = (ev: MessageEvent<StlWorkerRequest>) => {
  const msg = ev.data;
  if (msg.type !== 'BUILD') return;
  try {
    const buffer = buildBrailleStlBinary(msg.payload);
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
