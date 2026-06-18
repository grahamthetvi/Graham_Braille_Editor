import type { Embosser, EmbossingAttributeSet, Rectangle } from './Embosser';

const Duplex = {
    INTERPOINT: 64, // '@'
    P1ONLY: 65,     // 'A'
    P2ONLY: 66      // 'B'
} as const;

const CellType = {
    NLS: 64 // '@'
} as const;

export class EnablingTechnologiesEmbosser implements Embosser {
    private id: string;
    private model: string;
    private maxPaper: Rectangle;
    private minPaper: Rectangle;
    private interpoint: boolean;
    private maxCellsPerLine: number = 44; // Default for ET Romeo/Juliet models

    constructor(id: string, model: string, maxPaper: Rectangle, minPaper: Rectangle, interpoint: boolean) {
        this.id = id;
        this.model = model;
        this.maxPaper = maxPaper;
        this.minPaper = minPaper;
        this.interpoint = interpoint;
    }

    getId(): string { return this.id; }
    getManufacturer(): string { return 'Enabling Technologies'; }
    getModel(): string { return this.model; }

    getMaximumPaper(): Rectangle { return this.maxPaper; }
    getMinimumPaper(): Rectangle { return this.minPaper; }
    supportsInterpoint(): boolean { return this.interpoint; }

    private getNumberArg(value: number): number {
        return 64 + value;
    }

    generateBytes(brf: string, _attributes: EmbossingAttributeSet): Uint8Array {
        const encoder = new TextEncoder();
        const brfBytes = encoder.encode(brf.replace(/\|/g, '\\'));

        // Default formatting values (would typically come from attributes)
        const duplex = this.interpoint ? Duplex.INTERPOINT : Duplex.P1ONLY;
        const cell = CellType.NLS;
        const cellsPerLine = this.maxCellsPerLine;
        const pageLengthInches = 11;
        const totalLines = 25;

        // Build the ET Header
        const ESC = 0x1b;
        const header = new Uint8Array([
            ESC, 65, 64, 64, // ESC A @ @ (Set Braille tables)
            ESC, 75, 64,       // ESC K @ (Set 6-dot mode)
            ESC, 87, 64,       // ESC W @ (Line wrapping)
            ESC, 105, duplex,  // ESC i <duplex> 
            ESC, 115, cell,    // ESC s <cell>
            ESC, 76, 65,                   // ESC L A (Left margin = 1)
            ESC, 82, this.getNumberArg(cellsPerLine), // ESC R <cells>
            ESC, 84, this.getNumberArg(pageLengthInches), // ESC T <page length int>
            ESC, 81, this.getNumberArg(totalLines)  // ESC Q <total lines>
        ]);

        // Combine header and payload
        const output = new Uint8Array(header.length + brfBytes.length);
        output.set(header);
        output.set(brfBytes, header.length);

        return output;
    }
}
