/**
 * Math braille path (forward + Nemeth back-translate).
 *
 * Decision: keep Speech Rule Engine for *forward* math. The worker does
 * LaTeX → KaTeX MathML → SRE (Nemeth or UEB). liblouis `nemeth.ctb` /
 * `en-ueb-math.ctb` are not used for that path — they expect liblouisutdml
 * semantic MathML, not raw KaTeX MathML via `lou_translate`.
 *
 * `nemeth.ctb` is used only to back-translate SRE Nemeth passages that were
 * wrapped with UEB Nemeth indicators. See MATH_STRATEGY.md.
 */

import {
  NEMETH_INDICATOR_PAD,
  UEB_NEMETH_CLOSE,
  UEB_NEMETH_OPEN,
} from './braille';

export type MathCode = 'nemeth' | 'ueb';

/** Forward math engine. Do not route $$…$$ through lou_translate. */
export const MATH_FORWARD_ENGINE = 'sre' as const;

/** Liblouis table for Nemeth *body* back-translation (matches tableRegistry). */
export const NEMETH_BACK_TRANSLATE_TABLE = 'nemeth.ctb';

export function isMathCode(value: string): value is MathCode {
  return value === 'nemeth' || value === 'ueb';
}

export type SreBrailleSetup = {
  domain: string;
  locale: string;
};

/** SRE domain/locale for a math-code choice. */
export function sreSetupForMathCode(mathCode: MathCode): SreBrailleSetup {
  switch (mathCode) {
    case 'nemeth':
      return { domain: 'nemeth', locale: 'nemeth' };
    case 'ueb':
      return { domain: 'default', locale: 'en' };
    default: {
      const _exhaustive: never = mathCode;
      return _exhaustive;
    }
  }
}

/**
 * Wrap SRE Nemeth output in UEB Nemeth passage indicators so literary tables
 * can surround it. UEB math from SRE is already literary-context UEB.
 */
export function wrapMathBrailleForLiteraryContext(braille: string, mathCode: MathCode): string {
  switch (mathCode) {
    case 'ueb':
      return braille;
    case 'nemeth':
      if (!braille) return braille;
      if (braille.startsWith('[Math Error:')) return braille;
      return (
        UEB_NEMETH_OPEN +
        NEMETH_INDICATOR_PAD +
        braille +
        NEMETH_INDICATOR_PAD +
        UEB_NEMETH_CLOSE
      );
    default: {
      const _exhaustive: never = mathCode;
      return _exhaustive;
    }
  }
}
