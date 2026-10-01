/**
 * Turn a python-docx script into a .docx inside the browser.
 *
 * The Python runner below is executed by Pyodide. It never interpolates the
 * user's source into the runner: the script arrives as the USER_CODE variable.
 * Writes are kept in the output folder, and network-related imports are refused.
 */

export const PYODIDE_VERSION = '314.0.7';
export const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
export const DOCX_OUT_DIR = '/docx_out';
export const WORD_DOC_SOURCE_MAX_CHARS = 100_000;
export const WORD_DOC_OUTPUT_MAX_BYTES = 15 * 1024 * 1024;
export const WORD_DOC_MAX_FILES = 8;
export const WORD_DOC_LOAD_TIMEOUT_MS = 180_000;
export const WORD_DOC_RUN_TIMEOUT_MS = 30_000;

export const WORD_DOC_SAMPLE_PY = `from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt

doc = Document()

title = doc.add_heading("Week 3 Reading Guide", level=0)
title.alignment = WD_ALIGN_PARAGRAPH.CENTER

doc.add_paragraph(
    "Paste Python from Gemini here, or edit this example, then generate a Word file."
)

doc.add_heading("Vocabulary", level=1)
word = doc.add_paragraph()
name = word.add_run("habitat")
name.bold = True
name.font.size = Pt(14)
word.add_run(" — the place where an animal lives")

table = doc.add_table(rows=2, cols=2)
table.style = "Table Grid"
table.cell(0, 0).text = "Word"
table.cell(0, 1).text = "Meaning"
table.cell(1, 0).text = "habitat"
table.cell(1, 1).text = "where an animal lives"

doc.add_page_break()
doc.add_heading("Questions", level=1)
doc.add_paragraph("Name one habitat near your school.", style="List Number")

doc.save("document.docx")
`;

export type WordDocPhase = 'loading-runtime' | 'installing-library' | 'running';

export type WordDocSourceIssue = 'empty' | 'too-long';

export type WordDocFs = {
  readdir: (path: string) => string[];
  stat: (path: string) => { mode: number };
  isDir: (mode: number) => boolean;
  readFile: (path: string) => Uint8Array;
};

export type WordDocPyodide = {
  runPythonAsync: (code: string) => Promise<unknown>;
  globals: {
    set: (name: string, value: string) => void;
    get: (name: string) => unknown;
  };
  FS: WordDocFs;
};

export type GeneratedWordFile = {
  name: string;
  bytes: Uint8Array;
};

export type WordDocExecution = {
  ok: boolean;
  error: string;
  stdout: string;
  stderr: string;
  files: GeneratedWordFile[];
};

export class WordDocOutputTooLargeError extends Error {
  constructor() {
    super('OUTPUT_TOO_LARGE');
    this.name = 'WordDocOutputTooLargeError';
  }
}

export function extractPythonSource(raw: string): string {
  const trimmed = raw.trim();
  const onlyFence = trimmed.match(/^```(?:python|py)?\s*\n([\s\S]*?)\n?```$/i);
  if (onlyFence) return (onlyFence[1] ?? '').trim();

  const blocks = [...trimmed.matchAll(/```(?:python|py)?\s*\n([\s\S]*?)```/gi)]
    .map((match) => (match[1] ?? '').trim())
    .filter((block) => block.length > 0);
  if (blocks.length === 0) return trimmed;
  return blocks.sort((a, b) => b.length - a.length)[0] ?? trimmed;
}

export function prepareWordDocSource(
  raw: string,
): { source: string } | { issue: WordDocSourceIssue } {
  const source = extractPythonSource(raw);
  if (!source.trim()) return { issue: 'empty' };
  if (source.length > WORD_DOC_SOURCE_MAX_CHARS) return { issue: 'too-long' };
  return { source };
}

export function isDocxZip(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export function safeDocxFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? '';
  const cleaned = base.replace(/[^\w.\- ()[\]]+/g, '_').replace(/^[.\s]+/, '').trim();
  let name = cleaned || 'document.docx';
  if (!name.toLowerCase().endsWith('.docx')) name = `${name}.docx`;
  if (name.length > 120) {
    name = `${name.slice(0, 115).replace(/\.docx$/i, '')}.docx`;
  }
  return name;
}

export function assignDownloadNames(paths: string[]): Array<{ path: string; name: string }> {
  const used = new Set<string>();
  return paths.map((path) => {
    const original = safeDocxFilename(path);
    const stem = original.replace(/\.docx$/i, '');
    let name = original;
    let suffix = 2;
    while (used.has(name.toLowerCase())) {
      name = `${stem}-${suffix}.docx`;
      suffix += 1;
    }
    used.add(name.toLowerCase());
    return { path, name };
  });
}

export function classifyWordDocError(error: string): 'none' | 'no-docx' | 'traceback' {
  if (!error) return 'none';
  if (error === 'NO_DOCX') return 'no-docx';
  return 'traceback';
}

export function collectDocxPaths(fs: WordDocFs, dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    let names: string[];
    try {
      names = fs.readdir(current);
    } catch {
      return;
    }
    for (const name of names) {
      if (name === '.' || name === '..') continue;
      const path = `${current.replace(/\/$/, '')}/${name}`;
      let stat: { mode: number };
      try {
        stat = fs.stat(path);
      } catch {
        continue;
      }
      if (fs.isDir(stat.mode)) {
        walk(path);
      } else if (name.toLowerCase().endsWith('.docx')) {
        found.push(path);
      }
    }
  };
  walk(dir);
  found.sort((a, b) => a.localeCompare(b));
  return found;
}

export function readDocxFiles(fs: WordDocFs, dir: string): GeneratedWordFile[] {
  const named = assignDownloadNames(collectDocxPaths(fs, dir)).slice(0, WORD_DOC_MAX_FILES);
  const files: GeneratedWordFile[] = [];
  for (const item of named) {
    const bytes = fs.readFile(item.path);
    if (bytes.byteLength > WORD_DOC_OUTPUT_MAX_BYTES) {
      throw new WordDocOutputTooLargeError();
    }
    if (!isDocxZip(bytes)) continue;
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    files.push({ name: item.name, bytes: copy });
  }
  return files;
}

function pythonString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'destroy' in value) {
    try {
      return String(value);
    } finally {
      const destroy = (value as { destroy?: () => void }).destroy;
      if (typeof destroy === 'function') destroy.call(value);
    }
  }
  throw new Error('Python runner did not return status JSON');
}

export async function executeWordDocSource(
  pyodide: WordDocPyodide,
  source: string,
): Promise<WordDocExecution> {
  pyodide.globals.set('USER_CODE', source);
  pyodide.globals.set('DOCX_OUT_DIR_OVERRIDE', '');
  await pyodide.runPythonAsync(WORD_DOC_RUNNER_PY);
  const metaJson = pythonString(await pyodide.runPythonAsync('DOCX_META'));
  const meta = JSON.parse(metaJson) as {
    ok?: unknown;
    error?: unknown;
    stdout?: unknown;
    stderr?: unknown;
  };
  return {
    ok: meta.ok === true,
    error: typeof meta.error === 'string' ? meta.error : '',
    stdout: typeof meta.stdout === 'string' ? meta.stdout : '',
    stderr: typeof meta.stderr === 'string' ? meta.stderr : '',
    files: readDocxFiles(pyodide.FS, DOCX_OUT_DIR),
  };
}

export const WORD_DOC_RUNNER_PY = `
import builtins
import importlib
import io
import json
import os
import shutil
import sys
import tempfile
import traceback

OUT_DIR = "/docx_out"
DOCX_OK = False
DOCX_ERROR = ""
DOCX_STDOUT = ""
DOCX_STDERR = ""
DOCX_META = ""

_stdout = io.StringIO()
_stderr = io.StringIO()
_old_stdout = sys.stdout
_old_stderr = sys.stderr
_old_cwd = os.getcwd()
_real_open = builtins.open
_real_import = builtins.__import__
_real_io_open = io.open
_orig_system = os.system
_orig_popen = os.popen
_orig_import_module = importlib.import_module
_patched_class = None
_orig_save = None

class _Capped(io.StringIO):
    def write(self, text):
        if self.tell() >= 20000:
            return len(text)
        room = 20000 - self.tell()
        return super().write(text[:room])

def _unsafe_dir(path):
    return path in ("/", "/tmp", "/var", "/usr", "/home", "/lib", "/bin", "/etc")

def _safe_docx_name(raw):
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", "replace")
    else:
        raw = os.fspath(raw)
    text = str(raw).replace("\\\\", "/")
    base = text.rstrip("/").split("/")[-1]
    cleaned = []
    for ch in base:
        if ch.isalnum() or ch in " ._-()":
            cleaned.append(ch)
        else:
            cleaned.append("_")
    name = "".join(cleaned).strip(" .")
    if not name:
        name = "document.docx"
    if not name.lower().endswith(".docx"):
        name += ".docx"
    if name.lower() == ".docx":
        name = "document.docx"
    return name[:120]

def _stream_count():
    _stream_count.n += 1
    return _stream_count.n

_stream_count.n = 0

def _is_write_mode(mode):
    text = mode.decode("ascii", "replace") if isinstance(mode, bytes) else str(mode)
    return any(flag in text for flag in ("w", "a", "x", "+"))

def _allowed_write(path):
    parent = os.path.realpath(os.path.dirname(os.path.abspath(path)))
    for root in (OUT_DIR, os.path.realpath(tempfile.gettempdir())):
        if parent == root or parent.startswith(root + os.sep):
            return True
    return False

def _redirect_write_target(file):
    if isinstance(file, int) or not isinstance(file, (str, bytes, os.PathLike)):
        return file
    raw = os.fspath(file)
    text = raw.decode("utf-8", "replace") if isinstance(raw, bytes) else str(raw)
    if text.replace("\\\\", "/").lower().endswith(".docx"):
        return os.path.join(OUT_DIR, _safe_docx_name(text))
    if _allowed_write(text):
        return file
    raise PermissionError("This generator only writes Word files in its output folder.")

def _guarded_open(file, mode="r", *args, **kwargs):
    if _is_write_mode(mode):
        file = _redirect_write_target(file)
    return _real_open(file, mode, *args, **kwargs)

_BLOCKED_ROOTS = {
    "socket", "subprocess", "multiprocessing", "ctypes", "pty",
    "urllib", "http", "ftplib", "smtplib", "poplib", "imaplib", "nntplib", "xmlrpc",
    "webbrowser", "requests", "httpx", "aiohttp", "pyodide", "pyodide_js",
    "micropip", "js", "_pyodide",
}

def _blocked_name(name):
    if not isinstance(name, str):
        return False
    root = name.split(".")[0]
    return name in _BLOCKED_ROOTS or root in _BLOCKED_ROOTS

def _guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
    if level == 0 and _blocked_name(name):
        raise ImportError("Import of " + repr(name) + " is disabled in the Word document generator")
    return _real_import(name, globals, locals, fromlist, level)

def _guarded_import_module(name, package=None):
    if _blocked_name(name):
        raise ImportError("Import of " + repr(name) + " is disabled in the Word document generator")
    return _orig_import_module(name, package)

def _no_shell(*_args, **_kwargs):
    raise OSError("System commands are disabled in the Word document generator")

def _unwrap_save(fn):
    seen = 0
    while getattr(fn, "_graham_word_doc_patch", False) and seen < 5:
        fn = fn._graham_orig
        seen += 1
    return fn

def _list_docx(root):
    found = []
    if not os.path.isdir(root):
        return found
    for dirpath, _dirnames, filenames in os.walk(root):
        for filename in filenames:
            if filename.lower().endswith(".docx"):
                found.append(os.path.join(dirpath, filename))
    return found

try:
    _override = globals().get("DOCX_OUT_DIR_OVERRIDE")
    if isinstance(_override, str) and _override.startswith("/") and not _unsafe_dir(_override):
        OUT_DIR = _override
    OUT_DIR = os.path.realpath(OUT_DIR)
    if _unsafe_dir(OUT_DIR):
        raise RuntimeError("Refusing to use an unsafe output directory")
    if os.path.isdir(OUT_DIR):
        shutil.rmtree(OUT_DIR)
    os.makedirs(OUT_DIR, exist_ok=True)

    import docx.document as _docx_document

    def _saving_save(self, path_or_stream):
        if isinstance(path_or_stream, (str, bytes, os.PathLike)):
            target = os.path.join(OUT_DIR, _safe_docx_name(path_or_stream))
            return _orig_save(self, target)
        buffer = io.BytesIO()
        _orig_save(self, buffer)
        data = buffer.getvalue()
        target = os.path.join(OUT_DIR, _safe_docx_name("document-" + str(_stream_count()) + ".docx"))
        with _real_open(target, "wb") as handle:
            handle.write(data)
        if path_or_stream is not buffer and hasattr(path_or_stream, "write"):
            path_or_stream.write(data)
        return None

    _patched_class = _docx_document.Document
    _orig_save = _unwrap_save(_patched_class.save)
    _saving_save._graham_word_doc_patch = True
    _saving_save._graham_orig = _orig_save
    _patched_class.save = _saving_save

    builtins.open = _guarded_open
    io.open = _guarded_open
    builtins.__import__ = _guarded_import
    importlib.import_module = _guarded_import_module
    os.system = _no_shell
    os.popen = _no_shell
    os.chdir(OUT_DIR)

    _stdout = _Capped()
    _stderr = _Capped()
    sys.stdout = _stdout
    sys.stderr = _stderr
    try:
        exec(compile(USER_CODE, "<word-doc.py>", "exec"), {"__name__": "__main__"})
        DOCX_OK = True
    except Exception:
        DOCX_OK = False
        DOCX_ERROR = traceback.format_exc()[-8000:]
finally:
    sys.stdout = _old_stdout
    sys.stderr = _old_stderr
    builtins.open = _real_open
    io.open = _real_io_open
    builtins.__import__ = _real_import
    importlib.import_module = _orig_import_module
    os.system = _orig_system
    os.popen = _orig_popen
    if _patched_class is not None and _orig_save is not None:
        _patched_class.save = _orig_save
    try:
        os.chdir(_old_cwd)
    except OSError:
        pass
    try:
        DOCX_STDOUT = _stdout.getvalue()
        DOCX_STDERR = _stderr.getvalue()
    except Exception:
        DOCX_STDOUT = ""
        DOCX_STDERR = ""
    try:
        USER_CODE = ""
    except Exception:
        pass

_files = _list_docx(OUT_DIR)
if not _files and not DOCX_ERROR:
    DOCX_OK = False
    DOCX_ERROR = "NO_DOCX"

DOCX_META = json.dumps({
    "ok": bool(DOCX_OK and _files),
    "error": DOCX_ERROR,
    "stdout": DOCX_STDOUT,
    "stderr": DOCX_STDERR,
})
`;
