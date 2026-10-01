import {
  WORD_DOC_LOAD_TIMEOUT_MS,
  WORD_DOC_RUN_TIMEOUT_MS,
  type WordDocExecution,
  type WordDocPhase,
} from '../utils/wordDocPython';
import type { WordDocRunRequest, WordDocWorkerOutbound } from '../workers/wordDocPython.worker';

export class WordDocCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'WordDocCancelled';
  }
}

export class WordDocTimeout extends Error {
  constructor() {
    super('timeout');
    this.name = 'WordDocTimeout';
  }
}

export class WordDocInfrastructureError extends Error {
  readonly duringRun: boolean;
  constructor(message: string, duringRun: boolean) {
    super(message);
    this.name = 'WordDocInfrastructureError';
    this.duringRun = duringRun;
  }
}

type Job = {
  id: number;
  duringRun: boolean;
  timer: number;
  onProgress?: (phase: WordDocPhase) => void;
  resolve: (result: WordDocExecution) => void;
  reject: (err: Error) => void;
};

let worker: Worker | null = null;
let nextId = 1;
let active: Job | null = null;

function rejectActive(err: Error): void {
  const job = active;
  active = null;
  if (!job) return;
  window.clearTimeout(job.timer);
  job.reject(err);
}

function armTimer(job: Job, ms: number): void {
  window.clearTimeout(job.timer);
  job.timer = window.setTimeout(() => {
    if (active?.id !== job.id) return;
    const current = worker;
    worker = null;
    current?.terminate();
    rejectActive(new WordDocTimeout());
  }, ms);
}

function ensureWorker(): Worker {
  if (worker) return worker;
  const created = new Worker(new URL('../workers/wordDocPython.worker.ts', import.meta.url), {
    type: 'module',
  });
  created.onmessage = (event: MessageEvent<WordDocWorkerOutbound>) => {
    const message = event.data;
    if (!message || !active || message.id !== active.id) return;
    if (message.type === 'PROGRESS') {
      if (message.phase === 'running') {
        active.duringRun = true;
        armTimer(active, WORD_DOC_RUN_TIMEOUT_MS);
      }
      active.onProgress?.(message.phase);
      return;
    }
    if (message.type === 'ERROR') {
      const duringRun = active.duringRun;
      const job = active;
      active = null;
      window.clearTimeout(job.timer);
      job.reject(new WordDocInfrastructureError(message.message, duringRun));
      return;
    }
    if (message.type === 'RESULT') {
      const job = active;
      active = null;
      window.clearTimeout(job.timer);
      job.resolve({
        ok: message.ok,
        error: message.errorMessage,
        stdout: message.stdout,
        stderr: message.stderr,
        files: message.files.map((file) => ({
          name: file.name,
          bytes: new Uint8Array(file.buffer),
        })),
      });
      return;
    }
    const unexpected: never = message;
    void unexpected;
  };
  created.onerror = (event) => {
    event.preventDefault();
    if (worker !== created) return;
    const duringRun = active?.duringRun ?? false;
    worker = null;
    rejectActive(new WordDocInfrastructureError(event.message || 'Worker failed', duringRun));
  };
  worker = created;
  return created;
}

export function generateWordDocument(
  source: string,
  options: {
    signal?: AbortSignal;
    onProgress?: (phase: WordDocPhase) => void;
  } = {},
): Promise<WordDocExecution> {
  if (options.signal?.aborted) {
    return Promise.reject(new WordDocCancelled());
  }
  if (active) {
    return Promise.reject(new WordDocInfrastructureError('A Word document is already being generated.', true));
  }

  const id = nextId;
  nextId += 1;
  const pyWorker = ensureWorker();

  return new Promise((resolve, reject) => {
    const job: Job = {
      id,
      duringRun: false,
      timer: 0,
      onProgress: options.onProgress,
      resolve,
      reject,
    };
    active = job;
    armTimer(job, WORD_DOC_LOAD_TIMEOUT_MS);

    const onAbort = () => {
      if (active?.id !== id) return;
      const current = worker;
      worker = null;
      current?.terminate();
      rejectActive(new WordDocCancelled());
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    const previousResolve = job.resolve;
    const previousReject = job.reject;
    job.resolve = (result) => {
      options.signal?.removeEventListener('abort', onAbort);
      previousResolve(result);
    };
    job.reject = (err) => {
      options.signal?.removeEventListener('abort', onAbort);
      previousReject(err);
    };

    const request: WordDocRunRequest = { type: 'RUN', id, source };
    pyWorker.postMessage(request);
    options.onProgress?.('loading-runtime');
  });
}
