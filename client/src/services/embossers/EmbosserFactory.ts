import type { Embosser } from './Embosser';
import { GenericTextEmbosser } from './GenericTextEmbosser';
import { ViewPlusEmbosser } from './ViewPlusEmbosser';
import { EnablingTechnologiesEmbosser } from './EnablingTechnologiesEmbosser';
import { IndexBrailleEmbosser } from './IndexBrailleEmbosser';
import { BrailloEmbosser } from './BrailloEmbosser';

export interface EmbosserDefinition {
    id: string;
    name: string;
    creator: () => Embosser;
}

export const EMBOSSER_LIST: EmbosserDefinition[] = [
    {
        id: 'generic',
        name: 'Generic Text Embosser (Fallback)',
        creator: () => new GenericTextEmbosser()
    },
    {
        id: 'enabling-romeo',
        name: 'Enabling Technologies (Romeo/Juliet)',
        creator: () => new EnablingTechnologiesEmbosser('et-basic', 'Basic Model', { width: 300, height: 300 }, { width: 10, height: 10 }, true)
    },
    {
        id: 'index-basic',
        name: 'Index Braille (Basic-D / Everest)',
        creator: () => new IndexBrailleEmbosser('index-basic', 'Basic-D', { width: 300, height: 300 }, { width: 10, height: 10 })
    },
    {
        id: 'braillo-200',
        name: 'Braillo (200 / 270)',
        creator: () => new BrailloEmbosser('braillo-200', 'Braillo 200/270', { width: 300, height: 300 }, { width: 10, height: 10 }, true)
    },
    {
        id: 'aph-pageblaster',
        name: 'APH PageBlaster',
        creator: () => new IndexBrailleEmbosser('aph-pageblaster', 'PageBlaster', { width: 300, height: 300 }, { width: 10, height: 10 })
    },
    {
        id: 'aph-pixblaster',
        name: 'APH PixBlaster',
        creator: () => new EnablingTechnologiesEmbosser('aph-pixblaster', 'PixBlaster', { width: 300, height: 300 }, { width: 10, height: 10 }, true)
    },
    {
        id: 'viewplus-embraille',
        name: 'ViewPlus EmBraille',
        creator: () => new ViewPlusEmbosser('viewplus-embraille', 'EmBraille', 0)
    },
    {
        id: 'viewplus',
        name: 'ViewPlus (Rogue / Max / Premier)',
        creator: () => new ViewPlusEmbosser('viewplus', 'ViewPlus', 16)
    }
];

export class EmbosserFactory {
    static getEmbosser(id: string): Embosser {
        const def = EMBOSSER_LIST.find(e => e.id === id);
        if (def) {
            return def.creator();
        }
        return new GenericTextEmbosser(); // Safe fallback
    }
}
