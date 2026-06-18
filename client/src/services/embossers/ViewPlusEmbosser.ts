import type { Embosser, EmbossingAttributeSet, Rectangle } from './Embosser';
import { GenericTextEmbosser } from './GenericTextEmbosser';

/** Suggested left padding (cells) for single-sheet / offset issues; tune per device. */
export const VIEW_PLUS_LEFT_PAD_PRESETS = {
    none: 0,
    max: 15,
    rogue: 0,
    premier: 0,
    embraille: 0,
} as const;

/** Default padding cells when none is stored (US Letter ViewPlus tuning). */
export const VIEW_PLUS_DEFAULT_LEFT_PAD_CELLS = 16;

export type ViewPlusModelPreset = keyof typeof VIEW_PLUS_LEFT_PAD_PRESETS;

function padBrfLinesLeft(brf: string, cells: number): string {
    if (cells === 0) return brf;
    const lines = brf.split(/\r?\n/);
    if (cells > 0) {
        const pad = ' '.repeat(cells);
        return lines.map(line => pad + line).join('\n');
    } else {
        const trimCount = Math.abs(cells);
        return lines.map(line => line.slice(trimCount)).join('\n');
    }
}

/**
 * ViewPlus: same generic BRF stream as GenericTextEmbosser, with optional
 * left padding per line for models where the driver origin does not match
 * single-sheet registration (e.g. Max).
 */
export class ViewPlusEmbosser implements Embosser {
    private readonly generic: GenericTextEmbosser;
    private readonly defaultPad: number;

    constructor(id: string = 'viewplus', model: string = 'ViewPlus', defaultPad: number = 16) {
        this.generic = new GenericTextEmbosser(id, model);
        this.defaultPad = defaultPad;
    }

    getId(): string {
        return this.generic.getId();
    }
    getManufacturer(): string {
        return this.generic.getManufacturer();
    }
    getModel(): string {
        return this.generic.getModel();
    }

    getDefaultLeftPadCells(): number {
        return this.defaultPad;
    }

    getMaximumPaper(): Rectangle {
        return this.generic.getMaximumPaper();
    }
    getMinimumPaper(): Rectangle {
        return this.generic.getMinimumPaper();
    }
    supportsInterpoint(): boolean {
        return this.generic.supportsInterpoint();
    }

    generateBytes(brf: string, attributes: EmbossingAttributeSet): Uint8Array {
        const raw = attributes.viewPlusLeftPadCells ?? this.defaultPad;
        const cells = Math.max(-80, Math.min(80, Math.floor(raw)));
        const padded = padBrfLinesLeft(brf, cells);
        return this.generic.generateBytes(padded, attributes);
    }
}
