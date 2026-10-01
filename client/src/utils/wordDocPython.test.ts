import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importDocxToEditorText } from './docxImport';
import {
  WORD_DOC_SAMPLE_PY,
  WORD_DOC_SOURCE_MAX_CHARS,
  assignDownloadNames,
  classifyWordDocError,
  collectDocxPaths,
  extractPythonSource,
  isDocxZip,
  prepareWordDocSource,
  readDocxFiles,
  safeDocxFilename,
  WORD_DOC_RUNNER_PY,
  type WordDocFs,
} from './wordDocPython';

type RunnerResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  meta: { ok: boolean; error: string; stdout: string; stderr: string } | null;
};

function installFakeDocx(dir: string): void {
  const pkg = join(dir, 'docx');
  mkdirSync(pkg);
  writeFileSync(
    join(pkg, 'document.py'),
    [
      'class Document:',
      '    def save(self, path_or_stream):',
      '        data = b"PK\\x03\\x04fake-docx"',
      '        if isinstance(path_or_stream, (str, bytes)):',
      '            with open(path_or_stream, "wb") as handle:',
      '                handle.write(data)',
      '            return',
      '        path_or_stream.write(data)',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(pkg, '__init__.py'),
    [
      'from docx.document import Document as _Document',
      '',
      'def Document(*args, **kwargs):',
      '    return _Document()',
      '',
    ].join('\n'),
  );
}

function runRunner(userCode: string, pythonPath: string): RunnerResult & { outDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'graham-word-'));
  const outDir = join(root, 'out');
  mkdirSync(outDir);
  const scriptPath = join(root, 'run.py');
  const userPath = join(root, 'user_code.py');
  writeFileSync(userPath, userCode);
  writeFileSync(
    scriptPath,
    `USER_CODE = open(${JSON.stringify(userPath)}, encoding="utf-8").read()\n` +
      `DOCX_OUT_DIR_OVERRIDE = ${JSON.stringify(outDir)}\n` +
      WORD_DOC_RUNNER_PY +
      '\nprint(DOCX_META)\n',
  );
  const result = spawnSync('python3', [scriptPath], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONPATH: pythonPath },
  });
  const lines = (result.stdout ?? '').trim().split('\n').filter((line) => line.length > 0);
  const last = lines[lines.length - 1] ?? '';
  let meta: RunnerResult['meta'] = null;
  try {
    meta = JSON.parse(last) as RunnerResult['meta'];
  } catch {
    meta = null;
  }
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    meta,
    outDir,
  };
}

describe('prepareWordDocSource', () => {
  it('unwraps a fenced Gemini reply and keeps the longest block', () => {
    const raw = 'Here is the script:\n```python\nprint(1)\n```\n```python\nfrom docx import Document\ndoc = Document()\ndoc.save("a.docx")\n```\n';
    expect(extractPythonSource(raw)).toBe('from docx import Document\ndoc = Document()\ndoc.save("a.docx")');
    expect(prepareWordDocSource(raw)).toEqual({
      source: 'from docx import Document\ndoc = Document()\ndoc.save("a.docx")',
    });
  });

  it('rejects an empty script and a script past the size limit', () => {
    expect(prepareWordDocSource('  \n```python\n```\n')).toEqual({ issue: 'empty' });
    expect(prepareWordDocSource('a'.repeat(WORD_DOC_SOURCE_MAX_CHARS + 1))).toEqual({ issue: 'too-long' });
  });

  it('classifies the runner sentinel for a missing save', () => {
    expect(classifyWordDocError('')).toBe('none');
    expect(classifyWordDocError('NO_DOCX')).toBe('no-docx');
    expect(classifyWordDocError('Traceback (most recent call last):\n')).toBe('traceback');
  });
});

describe('docx file names', () => {
  it('strips directories and disambiguates duplicate downloads', () => {
    expect(safeDocxFilename('C:\\Users\\Teacher\\lesson.docx')).toBe('lesson.docx');
    expect(safeDocxFilename('../../etc/passwd.docx')).toBe('passwd.docx');
    expect(assignDownloadNames(['/docx_out/lesson.docx', '/other/lesson.docx'])).toEqual([
      { path: '/docx_out/lesson.docx', name: 'lesson.docx' },
      { path: '/other/lesson.docx', name: 'lesson-2.docx' },
    ]);
  });

  it('reads only zip-signature docx files from a virtual folder', () => {
    const tree = new Map<string, Uint8Array | 'dir'>([
      ['/docx_out', 'dir'],
      ['/docx_out/notes', 'dir'],
      ['/docx_out/notes/lesson.docx', new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1])],
      ['/docx_out/skip.docx', new Uint8Array([1, 2, 3, 4])],
    ]);
    const fs: WordDocFs = {
      readdir(path) {
        const prefix = path.replace(/\/$/, '');
        const names = new Set<string>();
        for (const key of tree.keys()) {
          if (key === prefix) continue;
          if (!key.startsWith(`${prefix}/`)) continue;
          const rest = key.slice(prefix.length + 1);
          names.add(rest.split('/')[0] ?? rest);
        }
        return [...names];
      },
      stat(path) {
        const value = tree.get(path);
        if (value === undefined) throw new Error('missing');
        return { mode: value === 'dir' ? 0o040755 : 0o100644 };
      },
      isDir(mode) {
        return mode === 0o040755;
      },
      readFile(path) {
        const value = tree.get(path);
        if (!(value instanceof Uint8Array)) throw new Error('not a file');
        return value;
      },
    };
    expect(collectDocxPaths(fs, '/docx_out')).toEqual([
      '/docx_out/notes/lesson.docx',
      '/docx_out/skip.docx',
    ]);
    const files = readDocxFiles(fs, '/docx_out');
    expect(files.map((file) => file.name)).toEqual(['lesson.docx']);
    expect(isDocxZip(files[0]?.bytes ?? new Uint8Array())).toBe(true);
  });
});

describe('python runner', () => {
  const fakeRoot = mkdtempSync(join(tmpdir(), 'graham-fake-docx-'));
  installFakeDocx(fakeRoot);

  it('redirects a Windows save path and blocks network imports', () => {
    const saved = runRunner(
      'from docx import Document\ndoc = Document()\ndoc.save(r"C:\\Users\\Teacher\\Desktop\\lesson.docx")\nprint("hello-from-script")\n',
      fakeRoot,
    );
    expect(saved.status, saved.stderr + saved.stdout).toBe(0);
    expect(saved.meta?.ok).toBe(true);
    expect(saved.meta?.stdout).toContain('hello-from-script');
    expect(readFileSync(join(saved.outDir, 'lesson.docx')).subarray(0, 2)).toEqual(Buffer.from([0x50, 0x4b]));

    const blocked = runRunner('import socket\n', fakeRoot);
    expect(blocked.meta?.ok).toBe(false);
    expect(blocked.meta?.error).toContain('disabled');

    const missing = runRunner('print("no file")\n', fakeRoot);
    expect(missing.meta?.error).toBe('NO_DOCX');
  });

  it('keeps a copy when the script saves to a byte stream', () => {
    const streamed = runRunner(
      'from io import BytesIO\nfrom docx import Document\nbuf = BytesIO()\nDocument().save(buf)\n',
      fakeRoot,
    );
    expect(streamed.status, streamed.stderr + streamed.stdout).toBe(0);
    expect(streamed.meta?.ok).toBe(true);
    expect(readFileSync(join(streamed.outDir, 'document-1.docx')).subarray(0, 2)).toEqual(
      Buffer.from([0x50, 0x4b]),
    );
  });

  const realDocx = process.env.WORD_DOC_PYTHONPATH;
  const realEnabled = Boolean(realDocx);

  it.skipIf(!realEnabled)('builds a real Word file from the example script', async () => {
    const saved = runRunner(WORD_DOC_SAMPLE_PY, realDocx ?? '');
    expect(saved.status, saved.stderr + saved.stdout).toBe(0);
    expect(saved.meta?.ok).toBe(true);
    const bytes = readFileSync(join(saved.outDir, 'document.docx'));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const { text } = await importDocxToEditorText(buffer);
    expect(text).toContain('Week 3 Reading Guide');
    expect(text).toContain('habitat');
  });
});
