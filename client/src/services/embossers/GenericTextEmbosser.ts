import { unicodeBrailleToAscii } from '../../utils/braille';
import type { Embosser, EmbossingAttributeSet, Rectangle } from './Embosser';

export class GenericTextEmbosser implements Embosser {
    private id: string;
    private manufacturer: string;
    private model: string;

    constructor(id: string = 'generic-text', manufacturer: string = 'Generic', model: string = 'Text Embosser') {
        this.id = id;
        this.manufacturer = manufacturer;
        this.model = model;
    }

    getId(): string { return this.id; }
    getManufacturer(): string { return this.manufacturer; }
    getModel(): string { return this.model; }

    getMaximumPaper(): Rectangle { return { width: 300, height: 300 }; }
    getMinimumPaper(): Rectangle { return { width: 0, height: 0 }; }
    supportsInterpoint(): boolean { return false; }

    /**
     * For generic text embossers, the biggest issue is ensuring the text is formatted 
     * exactly with proper line breaks (`\r\n`) and page breaks (`\f` or Form Feed).
     * Often, if a document "only prints one line", it's missing CR/LF line terminators.
     */
    generateBytes(brf: string, _attributes: EmbossingAttributeSet): Uint8Array {
        const asciiBrf = unicodeBrailleToAscii(brf).replace(/\|/g, '\\');

        // formatBrfForOutput() already inserts \f between pages (\r\n\f\r\n). If we also inject \f
        // every 25 lines AND treat split-only "\f" as a line of content, the embosser advances
        // twice per page — e.g. first page OK, next page one line, following page blank.
        if (asciiBrf.includes('\f')) {
            const segments = asciiBrf.split('\f');
            let formattedBrf = '';
            for (let s = 0; s < segments.length; s++) {
                const lines = segments[s].split(/\r?\n/);
                for (const line of lines) {
                    formattedBrf += line + '\r\n';
                }
                if (s < segments.length - 1) {
                    formattedBrf += '\f';
                }
            }
            if (!formattedBrf.endsWith('\f')) {
                formattedBrf += '\f';
            }
            return new TextEncoder().encode(formattedBrf);
        }

        const lines = asciiBrf.split(/\r?\n/);
        const linesPerPage = 25;
        let formattedBrf = '';

        for (let i = 0; i < lines.length; i++) {
            formattedBrf += lines[i] + '\r\n';

            if ((i + 1) % linesPerPage === 0) {
                formattedBrf += '\f';
            }
        }

        if (!formattedBrf.endsWith('\f')) {
            formattedBrf += '\f';
        }

        return new TextEncoder().encode(formattedBrf);
    }
}
