import { describe, expect, it } from 'vitest';
import { restoreUebOpenQuoteFromHis } from './uebBackTranslate';

describe('restoreUebOpenQuoteFromHis', () => {
  it('restores an opening quote when a line is his … "', () => {
    expect(restoreUebOpenQuoteFromHis('his hello"')).toBe('"hello"');
    expect(restoreUebOpenQuoteFromHis('  his foo "')).toBe('  "foo "');
    expect(restoreUebOpenQuoteFromHis('HIS Hello"')).toBe('"Hello"');
  });

  it('leaves genuine his and unquoted lines alone', () => {
    expect(restoreUebOpenQuoteFromHis('his friend')).toBe('his friend');
    expect(restoreUebOpenQuoteFromHis('hello world')).toBe('hello world');
    expect(restoreUebOpenQuoteFromHis('"already quoted"')).toBe('"already quoted"');
  });
});
