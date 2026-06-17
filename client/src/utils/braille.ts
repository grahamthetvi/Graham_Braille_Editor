/**
 * Maps standard North American ASCII Braille (BRF) characters to Unicode Braille patterns.
 * ASCII range: 0x20 to 0x5F (Space to Underscore)
 * Unicode range: U+2800 to U+283F
 */

// Precise mapping of ASCII [0x20-0x5F] to Unicode Braille Pattern offsets [U+2800-U+283F]
const BRF_TO_UNICODE_OFFSETS = [
    0x00, 0x2E, 0x10, 0x3C, 0x2B, 0x29, 0x2F, 0x04,  // 0x20-0x27: space, !, ", #, $, %, &, '
    0x37, 0x3E, 0x21, 0x2C, 0x20, 0x24, 0x28, 0x0C,  // 0x28-0x2F: (, ), *, +, ,, -, ., /
    0x34, 0x02, 0x06, 0x12, 0x32, 0x22, 0x16, 0x36,  // 0x30-0x37: 0, 1, 2, 3, 4, 5, 6, 7
    0x26, 0x14, 0x31, 0x30, 0x23, 0x3F, 0x1C, 0x39,  // 0x38-0x3F: 8, 9, :, ;, <, =, >, ?
    0x08, 0x01, 0x03, 0x09, 0x19, 0x11, 0x0B, 0x1B,  // 0x40-0x47: @, A, B, C, D, E, F, G
    0x13, 0x0A, 0x1A, 0x05, 0x07, 0x0D, 0x1D, 0x15,  // 0x48-0x4F: H, I, J, K, L, M, N, O
    0x0F, 0x1F, 0x17, 0x0E, 0x1E, 0x25, 0x27, 0x3A,  // 0x50-0x57: P, Q, R, S, T, U, V, W
    0x2D, 0x3D, 0x35, 0x2A, 0x33, 0x3B, 0x18, 0x38   // 0x58-0x5F: X, Y, Z, [, \, ], ^, _
];

/** Dot-pattern offset (0–0xFF) → first matching North American BRF character (inverse of asciiToUnicodeBraille). */
const UNICODE_OFFSET_TO_ASCII: string[] = (() => {
    const map: string[] = [];
    for (let i = 0; i < 64; i++) {
        const off = BRF_TO_UNICODE_OFFSETS[i];
        if (map[off] === undefined) {
            map[off] = String.fromCharCode(0x20 + i);
        }
    }
    return map;
})();

/**
 * Converts Unicode braille cells (U+2800–U+28FF) to North American ASCII BRF where mapped.
 * Other characters (newlines, spaces, unmapped cells) are left unchanged.
 */
export function unicodeBrailleToAscii(s: string): string {
    let out = '';
    for (const ch of s) {
        const cp = ch.codePointAt(0)!;
        if (cp >= 0x2800 && cp <= 0x28ff) {
            const offset = cp - 0x2800;
            const mapped = UNICODE_OFFSET_TO_ASCII[offset];
            out += mapped !== undefined ? mapped : ch;
        } else {
            out += ch;
        }
    }
    return out;
}

/**
 * Marks a line of literal large-print ("jumbo") text in the BRF stream. Such lines are
 * NOT braille — they carry plain text that the preview renders as big print. The marker
 * is a control char (0x02) outside the BRF range so it survives ASCII↔Unicode conversion.
 * Format of a jumbo line: `\u0002<sizePx>\u0002<text>`.
 */
export const JUMBO_LINE_MARKER = '\u0002';

/** UEB Nemeth passage markers (must match braille.worker wrap). */
export const UEB_NEMETH_OPEN = '\u2838\u2829';
export const UEB_NEMETH_CLOSE = '\u2838\u2831';
export const NEMETH_INDICATOR_PAD = ' ';

/** Same markers in ASCII BRF (e.g. after unicodeBrailleToAscii). */
export const UEB_NEMETH_OPEN_ASCII = unicodeBrailleToAscii(UEB_NEMETH_OPEN);
export const UEB_NEMETH_CLOSE_ASCII = unicodeBrailleToAscii(UEB_NEMETH_CLOSE);

export function asciiToUnicodeBraille(asciiString: string): string {
    let unicodeStr = "";
    let atLineStart = true;
    for (let i = 0; i < asciiString.length; i++) {
        const ch = asciiString.charAt(i);

        if (ch === '\n') {
            unicodeStr += ch;
            atLineStart = true;
            continue;
        }

        // Jumbo / large-print lines hold translated BRF text — preserve the marker and size prefix,
        // but translate the text itself.
        if (atLineStart && ch === JUMBO_LINE_MARKER) {
            const nextMarkerIdx = asciiString.indexOf(JUMBO_LINE_MARKER, i + 1);
            if (nextMarkerIdx !== -1) {
                const prefix = asciiString.slice(i, nextMarkerIdx + 1);
                unicodeStr += prefix;
                i = nextMarkerIdx;
                atLineStart = false;
                continue;
            }
        }
        atLineStart = false;

        let charCode = asciiString.charCodeAt(i);

        // Map lowercase / extended ASCII (0x60 - 0x7F) down to standard BRF (0x40 - 0x5F)
        // This handles a-z -> A-Z, as well as {, |, }, ~ -> [, \, ], ^
        if (charCode >= 0x60 && charCode <= 0x7F) {
            charCode -= 0x20;
        }

        const index = charCode - 0x20;

        if (index >= 0 && index < 64) {
            unicodeStr += String.fromCharCode(0x2800 + BRF_TO_UNICODE_OFFSETS[index]);
        } else {
            // If character is not in the BRF set (e.g., newlines), leave it as is
            unicodeStr += ch;
        }
    }
    return unicodeStr;
}

/**
 * Given a Unicode Braille Character (U+2800 to U+28FF),
 * returns an array of 8 booleans indicating which dots (1-8) are active.
 * Dot 1 corresponds to index 0, Dot 8 corresponds to index 7.
 */
export function extractDots(unicodeChar: string): boolean[] {
    const dots = [false, false, false, false, false, false, false, false];
    if (!unicodeChar || unicodeChar.length === 0) return dots;

    let codePoint = unicodeChar.charCodeAt(0);
    // If it's a standard ASCII/BRF character, try to map it to unicode first
    if (codePoint >= 0x20 && codePoint <= 0x7F) {
        const unicodeConverted = asciiToUnicodeBraille(unicodeChar[0]);
        if (unicodeConverted && unicodeConverted.length > 0) {
            codePoint = unicodeConverted.charCodeAt(0);
        }
    }

    if (codePoint >= 0x2800 && codePoint <= 0x28FF) {
        const offset = codePoint - 0x2800;
        // Dot 1: 0x1
        dots[0] = (offset & 0x01) !== 0;
        // Dot 2: 0x2
        dots[1] = (offset & 0x02) !== 0;
        // Dot 3: 0x4
        dots[2] = (offset & 0x04) !== 0;
        // Dot 4: 0x8
        dots[3] = (offset & 0x08) !== 0;
        // Dot 5: 0x10
        dots[4] = (offset & 0x10) !== 0;
        // Dot 6: 0x20
        dots[5] = (offset & 0x20) !== 0;
        // Dot 7: 0x40
        dots[6] = (offset & 0x40) !== 0;
        // Dot 8: 0x80
        dots[7] = (offset & 0x80) !== 0;
    }

    return dots;
}
