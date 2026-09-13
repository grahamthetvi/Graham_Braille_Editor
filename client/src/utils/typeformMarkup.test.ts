import { describe, expect, it } from 'vitest';
import {
  hasTypeformMarkup,
  LOU_TYPEFORM,
  parseTypeformMarkup,
  typeformBitsFromFlags,
} from './typeformMarkup';

describe('parseTypeformMarkup', () => {
  it('leaves plain text unchanged with zero typeforms', () => {
    const parsed = parseTypeformMarkup('Hello world');
    expect(parsed.plain).toBe('Hello world');
    expect(parsed.typeform).toEqual(Array(11).fill(0));
    expect(parsed.plainToSrc).toEqual([...Array(11).keys()]);
    expect(hasTypeformMarkup('Hello world')).toBe(false);
  });

  it('strips {i:} and marks italic bits', () => {
    const parsed = parseTypeformMarkup('say {i:hello} now');
    expect(parsed.plain).toBe('say hello now');
    expect(hasTypeformMarkup('say {i:hello} now')).toBe(true);
    const hello = parsed.plain.indexOf('hello');
    expect(parsed.typeform.slice(hello, hello + 5)).toEqual(
      Array(5).fill(LOU_TYPEFORM.italic),
    );
    expect(parsed.typeform[0]).toBe(0);
    expect(parsed.plainToSrc[hello]).toBe('say {i:hello} now'.indexOf('hello'));
  });

  it('maps bold, underline, and computer_braille flags', () => {
    expect(typeformBitsFromFlags('b')).toBe(LOU_TYPEFORM.bold);
    expect(typeformBitsFromFlags('u')).toBe(LOU_TYPEFORM.underline);
    expect(typeformBitsFromFlags('c')).toBe(LOU_TYPEFORM.computer_braille);
    expect(typeformBitsFromFlags('bi')).toBe(LOU_TYPEFORM.bold | LOU_TYPEFORM.italic);

    const parsed = parseTypeformMarkup('{b:Bold} {u:Under} {c:code()} {bi:both}');
    expect(parsed.plain).toBe('Bold Under code() both');
    expect(parsed.typeform[0]).toBe(LOU_TYPEFORM.bold);
    expect(parsed.typeform[parsed.plain.indexOf('U')]).toBe(LOU_TYPEFORM.underline);
    expect(parsed.typeform[parsed.plain.indexOf('c')]).toBe(LOU_TYPEFORM.computer_braille);
    expect(parsed.typeform[parsed.plain.indexOf('both')]).toBe(
      LOU_TYPEFORM.bold | LOU_TYPEFORM.italic,
    );
  });

  it('ignores unknown {x:} spans that are not i/b/u/c', () => {
    const parsed = parseTypeformMarkup('{z:nope} ok');
    expect(parsed.plain).toBe('{z:nope} ok');
    expect(hasTypeformMarkup('{z:nope} ok')).toBe(false);
  });
});
