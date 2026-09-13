/**
 * Editor typeform markup → liblouis per-character typeform bits.
 *
 * The editor is plain-text Monaco (same family as `$$…$$` / `:::graphic`).
 * Emphasis is marked with `{i:…}`, `{b:…}`, `{u:…}`, `{c:…}` spans. Flags may
 * combine (`{bi:bold italic}`). Markers are stripped before `lou_translate`.
 *
 * Bits match liblouis 3.38+ `typeforms` in liblouis.h. Canonical flag order is `ibuc`.
 */

export const LOU_TYPEFORM = {
  italic: 0x0001,
  underline: 0x0002,
  bold: 0x0004,
  computer_braille: 0x0400,
} as const;

export type TypeformFlag = 'i' | 'b' | 'u' | 'c';

export type ParsedTypeformMarkup = {
  /** Source with `{i:…}` (etc.) markers removed. */
  plain: string;
  /** One liblouis formtype per `plain` character. */
  typeform: number[];
  /** For each `plain` index, the corresponding index in `source`. */
  plainToSrc: number[];
};

const MARKUP_RE = /\{([ibuc]+):([^}]*)\}/g;

function bitsForFlag(flag: TypeformFlag): number {
  switch (flag) {
    case 'i':
      return LOU_TYPEFORM.italic;
    case 'b':
      return LOU_TYPEFORM.bold;
    case 'u':
      return LOU_TYPEFORM.underline;
    case 'c':
      return LOU_TYPEFORM.computer_braille;
    default: {
      const _exhaustive: never = flag;
      return _exhaustive;
    }
  }
}

function isTypeformFlag(ch: string): ch is TypeformFlag {
  return ch === 'i' || ch === 'b' || ch === 'u' || ch === 'c';
}

/** OR together `i`/`b`/`u`/`c` flag letters. Returns 0 if `flags` is empty. */
export function typeformBitsFromFlags(flags: string): number {
  let bits = 0;
  for (const ch of flags) {
    if (!isTypeformFlag(ch)) return 0;
    bits |= bitsForFlag(ch);
  }
  return bits;
}

/**
 * Strips `{i:…}` / `{b:…}` / `{u:…}` / `{c:…}` markers and builds a typeform
 * array for the remaining characters. Nested spans are not supported: the first
 * closing `}` ends the span.
 */
export function parseTypeformMarkup(source: string): ParsedTypeformMarkup {
  if (!source) {
    return { plain: '', typeform: [], plainToSrc: [] };
  }

  let plain = '';
  const typeform: number[] = [];
  const plainToSrc: number[] = [];
  let last = 0;
  MARKUP_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = MARKUP_RE.exec(source)) !== null) {
    const flags = match[1];
    const inner = match[2];
    const bits = typeformBitsFromFlags(flags);
    if (bits === 0) {
      continue;
    }

    const before = source.slice(last, match.index);
    for (let i = 0; i < before.length; i++) {
      plain += before[i];
      typeform.push(0);
      plainToSrc.push(last + i);
    }

    const innerStart = match.index + 1 + flags.length + 1; // `{` + flags + `:`
    for (let i = 0; i < inner.length; i++) {
      plain += inner[i];
      typeform.push(bits);
      plainToSrc.push(innerStart + i);
    }

    last = match.index + match[0].length;
  }

  const rest = source.slice(last);
  for (let i = 0; i < rest.length; i++) {
    plain += rest[i];
    typeform.push(0);
    plainToSrc.push(last + i);
  }

  return { plain, typeform, plainToSrc };
}

export function hasTypeformMarkup(source: string): boolean {
  MARKUP_RE.lastIndex = 0;
  const found = MARKUP_RE.test(source);
  MARKUP_RE.lastIndex = 0;
  return found;
}

const TYPEFORM_MASK =
  LOU_TYPEFORM.italic |
  LOU_TYPEFORM.underline |
  LOU_TYPEFORM.bold |
  LOU_TYPEFORM.computer_braille;

/** Canonical `i`/`b`/`u`/`c` letters for a masked typeform bitset. */
export function flagsFromTypeformBits(bits: number): string {
  const masked = bits & TYPEFORM_MASK;
  let flags = '';
  if (masked & LOU_TYPEFORM.italic) flags += 'i';
  if (masked & LOU_TYPEFORM.bold) flags += 'b';
  if (masked & LOU_TYPEFORM.underline) flags += 'u';
  if (masked & LOU_TYPEFORM.computer_braille) flags += 'c';
  return flags;
}

/**
 * Wrap runs of non-zero typeform bits as `{i:…}` / `{bi:…}` (etc.).
 * `typeform[i]` is aligned with `plain[i]`. Extra typeform slots are ignored;
 * extra plain characters after the array are appended unmarked.
 */
export function serializeTypeformMarkup(plain: string, typeform: number[]): string {
  if (!plain) return '';
  const n = Math.min(plain.length, typeform.length);
  let out = '';
  let i = 0;
  while (i < n) {
    const bits = typeform[i] & TYPEFORM_MASK;
    let j = i + 1;
    while (j < n && (typeform[j] & TYPEFORM_MASK) === bits) {
      j++;
    }
    const chunk = plain.slice(i, j);
    if (bits === 0) {
      out += chunk;
    } else {
      out += `{${flagsFromTypeformBits(bits)}:${chunk}}`;
    }
    i = j;
  }
  if (n < plain.length) {
    out += plain.slice(n);
  }
  return out;
}
