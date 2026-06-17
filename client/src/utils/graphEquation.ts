/**
 * graphEquation.ts
 * Equation → tactile braille graph renderer.
 *
 * Uses math.js for robust expression parsing and the existing GridCanvas
 * for 6-dot braille cell rendering.  Input is *very* forgiving: `sinx`,
 * `sin.x`, `2x`, `x^2`, `sin(x)`, etc. all work.
 */

import { create, all, type MathJsInstance, type EvalFunction } from 'mathjs';
import { GridCanvas } from './chartBraille';
import type { GraphicResult } from './graphicBraille';

// ── math.js instance (create once, reuse) ───────────────────────────
const math: MathJsInstance = create(all, { number: 'number' });

// ── Forgiving input normaliser ──────────────────────────────────────

/**
 * Common named functions we want to recognise even without parentheses.
 * Ordered longest-first so `asin` matches before `sin`, etc.
 */
const MATH_FNS = [
  'arcsinh', 'arccosh', 'arctanh',
  'arcsin', 'arccos', 'arctan',
  'asinh', 'acosh', 'atanh',
  'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh',
  'sqrt', 'cbrt',
  'ceil', 'floor', 'round',
  'sign',
  'sin', 'cos', 'tan',
  'sec', 'csc', 'cot',
  'log', 'log2', 'log10',
  'exp', 'abs', 'ln',
] as const;

/** Sorted longest-first for greedy matching. */
const SORTED_FNS = [...MATH_FNS].sort((a, b) => b.length - a.length);

/**
 * Normalise a human-typed math expression into something math.js can parse.
 *
 * Goals:
 *  - `sinx`, `sin.x`, `sin x` → `sin(x)`
 *  - `2x`, `3pi` → `2*x`, `3*pi`
 *  - `x^2` → `x^2`  (math.js handles `^` as power)
 *  - `)(` → `)*(`, `2(` → `2*(`, `)x` → `)*x`
 *  - `ln(x)` → `log(x)`  (math.js uses `log` for natural log)
 *  - `pi`, `e` stay as-is (math.js knows them)
 */
export function normalizeEquation(raw: string): string {
  let s = raw.trim();
  if (!s) return s;

  // Strip leading `y=` or `f(x)=` prefixes
  s = s.replace(/^\s*(?:y\s*=|f\s*\(\s*x\s*\)\s*=)\s*/i, '');

  // Replace `ln(` with `log(` (math.js's `log` is natural log)
  s = s.replace(/\bln\s*\(/g, 'log(');

  // Handle bare `ln` without parens: `lnx` → `log(x)`, handled below with function pass

  // Replace `|...|` absolute value with `abs(...)`
  // Simple greedy: find matching `|…|` pairs
  s = s.replace(/\|([^|]+)\|/g, 'abs($1)');

  // ── Function-name pass ─────────────────────────────────────────
  // For each known function name, handle:
  //   sinx  → sin(x)
  //   sin.x → sin(x)
  //   sin x → sin(x)
  //   sin2x → sin(2*x)
  // But leave `sin(...)` alone.
  for (const fn of SORTED_FNS) {
    // Replace `ln` references with `log` in the function list
    const target = fn === 'ln' ? 'log' : fn;

    // Pattern: function name, optional dot/space, then a non-paren character
    // We capture what follows so we can wrap it in parens
    const re = new RegExp(
      `\\b${fn}` +             // the function name
      `[.\\s]*` +              // optional dot or whitespace
      `(?!\\s*\\()` +          // NOT already followed by `(`
      `([a-zA-Z0-9_.^*+\\-/]+)`, // capture the "argument" chars
      'g'
    );
    s = s.replace(re, `${target}($1)`);
  }

  // ── Implicit multiplication ────────────────────────────────────
  // number followed by letter/paren:  2x → 2*x,  3( → 3*(
  s = s.replace(/(\d)([a-zA-Z(])/g, '$1*$2');

  // letter/closing-paren followed by opening paren:  x( → x*(,  )( → )*(
  s = s.replace(/([a-zA-Z)])(\()/g, (match, before, paren) => {
    // Don't insert `*` if `before` is the end of a known function name
    // Check if the text leading up to here is a function name
    // Simple heuristic: if before is a single lowercase letter or `)`, multiply
    // Functions already have their `(` from the earlier pass
    if (before === ')') return `)*${paren}`;
    return match; // leave `sin(` etc. alone
  });

  // closing paren followed by letter/number:  )x → )*x,  )2 → )*2
  s = s.replace(/\)([a-zA-Z0-9])/g, ')*$1');

  // letter followed by number (but not inside function names):  x2 → x*2
  // Only for single variable names (length 1)
  s = s.replace(/\b([a-zA-Z])\b(\d)/g, '$1*$2');

  return s;
}

// ── Expression compilation & evaluation ─────────────────────────────

export interface CompiledEquation {
  /** The normalised expression string. */
  normalized: string;
  /** Evaluate for a given x. Returns NaN for undefined / domain errors. */
  evaluate: (x: number) => number;
}

/**
 * Compile a user-typed equation string.  Throws a human-readable error
 * string if the expression cannot be parsed.
 */
export function compileEquation(raw: string): CompiledEquation {
  const normalized = normalizeEquation(raw);
  if (!normalized) throw 'Please enter an equation.';

  let compiled: EvalFunction;
  try {
    compiled = math.compile(normalized);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw `Could not parse equation: ${msg}`;
  }

  return {
    normalized,
    evaluate(x: number): number {
      try {
        const result = compiled.evaluate({ x, X: x });
        if (typeof result === 'number' && Number.isFinite(result)) return result;
        return NaN;
      } catch {
        return NaN;
      }
    },
  };
}

// ── Graph generation ────────────────────────────────────────────────

export interface EquationGraphOptions {
  /** The raw equation string from the user. */
  equation: string;
  /** Domain start. */
  xMin: number;
  /** Domain end. */
  xMax: number;
  /** Braille grid width in cells. */
  cellsWidth: number;
  /** Braille grid height in cell lines. */
  cellsHeight: number;
  /** Number of sample points across the domain. */
  samplePoints: number;
  /** Optional manual Y range; if omitted, auto-fit to data. */
  yMin?: number;
  yMax?: number;
  /** Distance between tick marks on the X axis (in data units). 0 = auto. */
  xTickDistance: number;
  /** Distance between tick marks on the Y axis (in data units). 0 = auto. */
  yTickDistance: number;
  /** Optional title (defaults to the equation itself). */
  title?: string;
}

/**
 * Auto-choose a "nice" tick spacing for a given data range.
 * Aims for roughly 3-7 ticks across the range.
 */
function autoTickDistance(min: number, max: number): number {
  const range = max - min;
  if (range <= 0) return 1;
  const rawStep = range / 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  let nice: number;
  if (residual <= 1.5) nice = 1;
  else if (residual <= 3.5) nice = 2;
  else if (residual <= 7.5) nice = 5;
  else nice = 10;
  return nice * magnitude;
}

/**
 * Scale a data-space X value to pixel column on the canvas.
 * Leaves a 1-pixel margin on each side for the axis line.
 */
function xToPixel(x: number, xMin: number, xMax: number, canvasWidth: number): number {
  if (xMax === xMin) return Math.floor(canvasWidth / 2);
  return 1 + Math.round(((x - xMin) / (xMax - xMin)) * (canvasWidth - 2));
}

/**
 * Scale a data-space Y value to pixel row on the canvas.
 * Y increases upward in data space but downward in pixel space.
 */
function yToPixel(y: number, yMin: number, yMax: number, canvasHeight: number): number {
  if (yMax === yMin) return Math.floor(canvasHeight / 2);
  return canvasHeight - 2 - Math.round(((y - yMin) / (yMax - yMin)) * (canvasHeight - 2));
}

/**
 * Detect a discontinuity: if the Y jump between two adjacent samples
 * is large relative to the visible range, treat it as a break.
 */
function isDiscontinuity(
  y0: number,
  y1: number,
  yRange: number
): boolean {
  if (!Number.isFinite(y0) || !Number.isFinite(y1)) return true;
  // If the jump is > 40% of the visible range, call it a discontinuity
  return Math.abs(y1 - y0) > yRange * 0.4;
}

/**
 * Generate a tactile braille graph of a mathematical equation.
 *
 * Returns the BRF string and a plain-text summary suitable for embossing.
 */
export function generateEquationGraph(opts: EquationGraphOptions): GraphicResult & { error?: string } {
  // ── Compile ─────────────────────────────────────────────────────
  let eq: CompiledEquation;
  try {
    eq = compileEquation(opts.equation);
  } catch (err) {
    return { brf: '', summary: '', error: String(err) };
  }

  const {
    xMin, xMax,
    cellsWidth, cellsHeight,
    samplePoints,
    xTickDistance,
    yTickDistance,
  } = opts;

  if (xMin >= xMax) {
    return { brf: '', summary: '', error: 'X min must be less than X max.' };
  }

  // ── Sample ──────────────────────────────────────────────────────
  const n = Math.max(10, Math.min(2000, samplePoints));
  const samples: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const x = xMin + (i / n) * (xMax - xMin);
    const y = eq.evaluate(x);
    samples.push({ x, y });
  }

  // ── Y range (auto-fit or manual) ───────────────────────────────
  const finiteYs = samples.map(s => s.y).filter(Number.isFinite);
  if (finiteYs.length === 0) {
    return { brf: '', summary: '', error: 'Equation produced no finite values in this X range.' };
  }

  let yMin = opts.yMin ?? Math.min(...finiteYs);
  let yMax = opts.yMax ?? Math.max(...finiteYs);

  // Add some padding
  if (opts.yMin == null && opts.yMax == null) {
    const yPad = (yMax - yMin) * 0.05 || 0.5;
    yMin -= yPad;
    yMax += yPad;
  }
  if (yMin >= yMax) yMax = yMin + 1;

  const yRange = yMax - yMin;

  // ── Canvas ──────────────────────────────────────────────────────
  const cw = Math.max(5, cellsWidth);
  const ch = Math.max(5, cellsHeight);
  const canvas = new GridCanvas(cw, ch);

  // ── Draw axes ───────────────────────────────────────────────────
  // Y axis (left edge, or at x=0 if visible)
  const xZeroPx = xToPixel(0, xMin, xMax, canvas.width);
  const yAxisX = (xMin <= 0 && xMax >= 0)
    ? Math.max(0, Math.min(canvas.width - 1, xZeroPx))
    : 0;
  canvas.drawLine(yAxisX, 0, yAxisX, canvas.height - 1);

  // X axis (bottom edge, or at y=0 if visible)
  const yZeroPx = yToPixel(0, yMin, yMax, canvas.height);
  const xAxisY = (yMin <= 0 && yMax >= 0)
    ? Math.max(0, Math.min(canvas.height - 1, yZeroPx))
    : canvas.height - 1;
  canvas.drawLine(0, xAxisY, canvas.width - 1, xAxisY);

  // ── Draw tick marks ─────────────────────────────────────────────
  const xTick = xTickDistance > 0 ? xTickDistance : autoTickDistance(xMin, xMax);
  const yTick = yTickDistance > 0 ? yTickDistance : autoTickDistance(yMin, yMax);
  const tickLen = Math.max(1, Math.min(3, Math.floor(Math.min(canvas.width, canvas.height) / 20)));

  // X ticks
  const xTickStart = Math.ceil(xMin / xTick) * xTick;
  for (let tx = xTickStart; tx <= xMax; tx += xTick) {
    const px = xToPixel(tx, xMin, xMax, canvas.width);
    if (px >= 0 && px < canvas.width) {
      canvas.drawLine(px, xAxisY - tickLen, px, xAxisY + tickLen);
    }
  }

  // Y ticks
  const yTickStart = Math.ceil(yMin / yTick) * yTick;
  for (let ty = yTickStart; ty <= yMax; ty += yTick) {
    const py = yToPixel(ty, yMin, yMax, canvas.height);
    if (py >= 0 && py < canvas.height) {
      canvas.drawLine(yAxisX - tickLen, py, yAxisX + tickLen, py);
    }
  }

  // ── Plot curve ──────────────────────────────────────────────────
  let prevPx: number | null = null;
  let prevPy: number | null = null;
  let prevY: number | null = null;

  for (const { x, y } of samples) {
    if (!Number.isFinite(y) || y < yMin || y > yMax) {
      prevPx = null;
      prevPy = null;
      prevY = null;
      continue;
    }

    const px = xToPixel(x, xMin, xMax, canvas.width);
    const py = yToPixel(y, yMin, yMax, canvas.height);

    if (prevPx !== null && prevPy !== null && prevY !== null) {
      if (!isDiscontinuity(prevY, y, yRange)) {
        canvas.drawLine(prevPx, prevPy, px, py);
      }
    }

    canvas.setPoint(px, py);
    prevPx = px;
    prevPy = py;
    prevY = y;
  }

  // ── Summary ─────────────────────────────────────────────────────
  const titleText = opts.title?.trim() || `y = ${eq.normalized}`;
  const summaryLines = [
    `Graph: ${titleText}`,
    `Domain: x from ${xMin} to ${xMax}`,
    `Range: y from ${Number(yMin.toFixed(4))} to ${Number(yMax.toFixed(4))}`,
    `Grid: ${cw} cells wide by ${ch} lines tall`,
    `X tick spacing: ${xTick}`,
    `Y tick spacing: ${yTick}`,
    `Sample points: ${n}`,
  ];

  return {
    brf: canvas.renderToBRF(),
    summary: summaryLines.join('\n'),
  };
}
