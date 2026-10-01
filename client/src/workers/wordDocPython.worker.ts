import {
  executeWordDocSource,
  PYODIDE_INDEX_URL,
  type WordDocPhase,
  type WordDocPyodide,
} from '../utils/wordDocPython';

export type WordDocRunRequest = {
  type: 'RUN';
  id: number;
  source: string;
};

export type WordDocWorkerOutbound =
  | { type: 'PROGRESS'; id: number; phase: WordDocPhase }
  | {
      type: 'RESULT';
      id: number;
      ok: boolean;
      errorMessage: string;
      stdout: string;
      stderr: string;
      files: Array<{ name: string; buffer: ArrayBuffer }>;
    }
  | { type: 'ERROR'; id: number; message: string };

type LoadPyodide = (options: { indexURL: string }) => Promise<WordDocPyodide & {
  loadPackage: (names: string | string[]) => Promise<void>;
}>;

let runtime: WordDocPyodide | null = null;

function post(message: WordDocWorkerOutbound, transfer?: ArrayBuffer[]): void {
  if (transfer && transfer.length > 0) {
    self.postMessage(message, transfer);
    return;
  }
  self.postMessage(message);
}

async function loadRuntime(report: (phase: WordDocPhase) => void): Promise<WordDocPyodide> {
  if (runtime) return runtime;
  report('loading-runtime');
  const specifier: string = `${PYODIDE_INDEX_URL}pyodide.mjs`;
  const mod = (await import(/* @vite-ignore */ specifier)) as { loadPyodide: LoadPyodide };
  const pyodide = await mod.loadPyodide({ indexURL: PYODIDE_INDEX_URL });
  report('installing-library');
  await pyodide.loadPackage('micropip');
  await pyodide.runPythonAsync('import micropip\nawait micropip.install("python-docx")\n');
  runtime = pyodide;
  return pyodide;
}

async function withNetworkDisabled<T>(fn: () => Promise<T>): Promise<T> {
  const scope = globalThis as typeof globalThis & {
    fetch?: typeof fetch;
    XMLHttpRequest?: typeof XMLHttpRequest;
    WebSocket?: typeof WebSocket;
  };
  const savedFetch = scope.fetch;
  const SavedXHR = scope.XMLHttpRequest;
  const SavedWS = scope.WebSocket;
  const denied = () => Promise.reject(new Error('Network is disabled while generating the Word document'));
  scope.fetch = denied as typeof fetch;
  class BlockedXHR {
    open(): void {
      throw new Error('Network is disabled while generating the Word document');
    }
    send(): void {
      throw new Error('Network is disabled while generating the Word document');
    }
  }
  class BlockedWS {
    constructor() {
      throw new Error('Network is disabled while generating the Word document');
    }
  }
  scope.XMLHttpRequest = BlockedXHR as unknown as typeof XMLHttpRequest;
  scope.WebSocket = BlockedWS as unknown as typeof WebSocket;
  try {
    return await fn();
  } finally {
    scope.fetch = savedFetch;
    scope.XMLHttpRequest = SavedXHR;
    scope.WebSocket = SavedWS;
  }
}

self.addEventListener('message', (event: MessageEvent<WordDocRunRequest>) => {
  const request = event.data;
  if (!request || request.type !== 'RUN') return;
  void runJob(request);
});

async function runJob(request: WordDocRunRequest): Promise<void> {
  try {
    const pyodide = await loadRuntime((phase) => {
      post({ type: 'PROGRESS', id: request.id, phase });
    });
    post({ type: 'PROGRESS', id: request.id, phase: 'running' });
    const execution = await withNetworkDisabled(() => executeWordDocSource(pyodide, request.source));
    const transfers: ArrayBuffer[] = [];
    const files = execution.files.map((file) => {
      const copy = new Uint8Array(file.bytes.byteLength);
      copy.set(file.bytes);
      transfers.push(copy.buffer);
      return { name: file.name, buffer: copy.buffer };
    });
    post(
      {
        type: 'RESULT',
        id: request.id,
        ok: execution.ok,
        errorMessage: execution.error,
        stdout: execution.stdout,
        stderr: execution.stderr,
        files,
      },
      transfers,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({ type: 'ERROR', id: request.id, message });
  }
}
