/**
 * UEB reverse-translation post-pass.
 *
 * Dots 2-3-6 (`8` in BRF) is both an opening quotation mark and the word
 * “his”. Liblouis’s legacy fallback emits `his` for a standalone cell;
 * if the line is clearly a quoted sentence, restore the quote.
 */
export function restoreUebOpenQuoteFromHis(plain: string): string {
  return plain.replace(/^(\s*)his\s+(.*?"\s*)$/i, '$1"$2');
}
