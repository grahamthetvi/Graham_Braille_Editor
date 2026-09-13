import { describe, expect, it } from 'vitest';
import {
  isMathCode,
  MATH_FORWARD_ENGINE,
  NEMETH_BACK_TRANSLATE_TABLE,
  sreSetupForMathCode,
  wrapMathBrailleForLiteraryContext,
  type MathCode,
} from './mathBraille';
import {
  NEMETH_INDICATOR_PAD,
  UEB_NEMETH_CLOSE,
  UEB_NEMETH_OPEN,
} from './braille';

describe('math path invariants', () => {
  it('keeps Speech Rule Engine as the forward math engine', () => {
    expect(MATH_FORWARD_ENGINE).toBe('sre');
  });

  it('uses nemeth.ctb only as the Nemeth back-translate table', () => {
    expect(NEMETH_BACK_TRANSLATE_TABLE).toBe('nemeth.ctb');
  });

  it('narrows MathCode and maps SRE setups exhaustively', () => {
    expect(isMathCode('nemeth')).toBe(true);
    expect(isMathCode('ueb')).toBe(true);
    expect(isMathCode('marburg')).toBe(false);

    const codes: MathCode[] = ['nemeth', 'ueb'];
    for (const code of codes) {
      switch (code) {
        case 'nemeth':
          expect(sreSetupForMathCode(code)).toEqual({ domain: 'nemeth', locale: 'nemeth' });
          break;
        case 'ueb':
          expect(sreSetupForMathCode(code)).toEqual({ domain: 'default', locale: 'en' });
          break;
        default: {
          const _exhaustive: never = code;
          throw new Error(String(_exhaustive));
        }
      }
    }
  });

  it('wraps SRE Nemeth in UEB passage indicators and leaves UEB math bare', () => {
    const body = '123';
    expect(wrapMathBrailleForLiteraryContext(body, 'ueb')).toBe(body);
    expect(wrapMathBrailleForLiteraryContext(body, 'nemeth')).toBe(
      UEB_NEMETH_OPEN + NEMETH_INDICATOR_PAD + body + NEMETH_INDICATOR_PAD + UEB_NEMETH_CLOSE,
    );
    expect(wrapMathBrailleForLiteraryContext('[Math Error: x]', 'nemeth')).toBe('[Math Error: x]');
    expect(wrapMathBrailleForLiteraryContext('', 'nemeth')).toBe('');
  });
});
