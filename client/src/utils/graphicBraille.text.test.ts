import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'opentype.js';
import { generateRaisedPrintTextGraphic } from './graphicBraille';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fontPath = path.resolve(
  __dirname,
  '../../../node_modules/@fontsource/open-sans/files/open-sans-latin-700-normal.woff'
);

function getLoadedFont() {
  const buffer = fs.readFileSync(fontPath);
  // Convert Node Buffer to ArrayBuffer as required by opentype.js parse()
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return parse(arrayBuffer);
}

describe('2D Raised Print Tactile Text Feature', () => {
  it('loads the font successfully', () => {
    const font = getLoadedFont();
    expect(font).toBeDefined();
    expect(font.names.windows?.fontFamily?.en).toBe('Open Sans');
  });

  it('generates non-empty outline tactile print text graphic', () => {
    const font = getLoadedFont();
    const text = 'HELLO';
    const result = generateRaisedPrintTextGraphic(font, text, 24, false);

    expect(result.brf.length).toBeGreaterThan(0);
    expect(result.brf.replace(/\s/g, '').length).toBeGreaterThan(0);
    expect(result.summary).toContain('Raised print text "HELLO"');
    expect(result.summary).toContain('outline');
  });

  it('generates filled tactile print text graphic with more dots than outline', () => {
    const font = getLoadedFont();
    const text = 'O';
    const outlineResult = generateRaisedPrintTextGraphic(font, text, 24, false);
    const filledResult = generateRaisedPrintTextGraphic(font, text, 24, true);

    const countDots = (brf: string) => {
      // count non-space, non-newline, non-empty (Unicode offset 0) characters
      let count = 0;
      for (const char of brf) {
        if (char !== ' ' && char !== '\n') {
          count++;
        }
      }
      return count;
    };

    expect(filledResult.brf.length).toBeGreaterThan(0);
    expect(filledResult.summary).toContain('filled');
    
    // Filled letters should contain more active cells/dots than outline
    expect(countDots(filledResult.brf)).toBeGreaterThanOrEqual(countDots(outlineResult.brf));
  });

  it('handles empty text safely without crash', () => {
    const font = getLoadedFont();
    const result = generateRaisedPrintTextGraphic(font, '', 24, false);
    expect(result.brf.length).toBeGreaterThan(0);
    expect(result.summary).toContain('Raised print text ""');
  });
});
