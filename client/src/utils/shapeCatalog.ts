import type { InventoryShapeKind } from './graphicBraille';

export type ShapeCatalogCategory = 'basics' | 'science' | 'history' | 'math' | 'everyday';

export type GraphicsSection = 'math' | 'shapes' | 'drawing';

export interface ShapeCatalogEntry {
  kind: InventoryShapeKind;
  label: string;
  shortLabel: string;
  category: ShapeCatalogCategory;
  /** Extra terms for search (kind/label are always searched). */
  keywords?: string[];
}

/**
 * Public shape catalog for the graphics UI.
 * Shapes may exist in InventoryShapeKind / draw APIs without appearing here (e.g. axe).
 */
export const SHAPE_CATALOG: ShapeCatalogEntry[] = [
  // Basics
  { kind: 'circle', label: 'Circle', shortLabel: 'Circle', category: 'basics' },
  { kind: 'heart', label: 'Heart', shortLabel: 'Heart', category: 'basics' },
  { kind: 'star', label: 'Star (5-Pointed)', shortLabel: 'Star', category: 'basics' },
  { kind: 'cross', label: 'Cross', shortLabel: 'Cross', category: 'basics' },
  { kind: 'moon', label: 'Crescent Moon', shortLabel: 'Moon', category: 'basics', keywords: ['crescent'] },
  { kind: 'cloud', label: 'Cloud', shortLabel: 'Cloud', category: 'basics' },
  { kind: 'cloudLightning', label: 'Cloud with Lightning Bolt', shortLabel: 'Cloud+Lt', category: 'basics', keywords: ['storm', 'weather'] },
  { kind: 'lightning', label: 'Lightning Bolt', shortLabel: 'Lightning', category: 'basics', keywords: ['bolt'] },

  // Science
  { kind: 'atom', label: 'Atom', shortLabel: 'Atom', category: 'science', keywords: ['chemistry', 'nucleus'] },
  { kind: 'dna', label: 'DNA Helix', shortLabel: 'DNA', category: 'science', keywords: ['helix', 'biology', 'gene'] },
  { kind: 'leaf', label: 'Leaf', shortLabel: 'Leaf', category: 'science', keywords: ['plant'] },
  { kind: 'fish', label: 'Fish', shortLabel: 'Fish', category: 'science', keywords: ['animal'] },
  { kind: 'butterfly', label: 'Butterfly', shortLabel: 'Butterfly', category: 'science', keywords: ['insect', 'metamorphosis'] },
  { kind: 'earth', label: 'Earth / Globe', shortLabel: 'Earth', category: 'science', keywords: ['globe', 'planet', 'world'] },
  { kind: 'sun', label: 'Sun', shortLabel: 'Sun', category: 'science', keywords: ['solar'] },
  { kind: 'volcano', label: 'Volcano', shortLabel: 'Volcano', category: 'science', keywords: ['geology', 'eruption'] },
  { kind: 'magnet', label: 'Horseshoe Magnet', shortLabel: 'Magnet', category: 'science', keywords: ['horseshoe', 'magnetism'] },
  { kind: 'thermometer', label: 'Thermometer', shortLabel: 'Therm.', category: 'science', keywords: ['temperature', 'weather'] },
  { kind: 'beaker', label: 'Lab Beaker', shortLabel: 'Beaker', category: 'science', keywords: ['lab', 'flask', 'chemistry'] },
  { kind: 'microscope', label: 'Microscope', shortLabel: 'Micro.', category: 'science', keywords: ['lab'] },

  // History
  { kind: 'pyramid', label: 'Pyramid', shortLabel: 'Pyramid', category: 'history', keywords: ['egypt'] },
  { kind: 'greekColumn', label: 'Greek Column', shortLabel: 'Column', category: 'history', keywords: ['greece', 'doric'] },
  { kind: 'castle', label: 'Castle', shortLabel: 'Castle', category: 'history', keywords: ['medieval'] },
  { kind: 'shipSail', label: 'Sailing Ship', shortLabel: 'Ship', category: 'history', keywords: ['exploration', 'boat', 'sail'] },
  { kind: 'compassRose', label: 'Compass Rose', shortLabel: 'Compass', category: 'history', keywords: ['navigation', 'map'] },
  { kind: 'scroll', label: 'Scroll', shortLabel: 'Scroll', category: 'history', keywords: ['parchment', 'document'] },
  { kind: 'libertyBell', label: 'Liberty Bell', shortLabel: 'Bell', category: 'history', keywords: ['us', 'america'] },
  { kind: 'flag', label: 'Flag', shortLabel: 'Flag', category: 'history', keywords: ['nation'] },
  { kind: 'timeline', label: 'Timeline', shortLabel: 'Timeline', category: 'history', keywords: ['chronology'] },

  // Math (quick shapes — live under Math section only)
  { kind: 'triangle', label: 'Triangle', shortLabel: 'Triangle', category: 'math', keywords: ['geometry'] },
  { kind: 'square', label: 'Square', shortLabel: 'Square', category: 'math', keywords: ['geometry'] },
  { kind: 'hexagon', label: 'Hexagon', shortLabel: 'Hexagon', category: 'math', keywords: ['geometry', 'polygon'] },
  { kind: 'cube', label: 'Cube', shortLabel: 'Cube', category: 'math', keywords: ['3d', 'solid'] },
  { kind: 'cone', label: 'Cone', shortLabel: 'Cone', category: 'math', keywords: ['3d', 'solid'] },
  { kind: 'cylinder', label: 'Cylinder', shortLabel: 'Cylinder', category: 'math', keywords: ['3d', 'solid'] },
  { kind: 'rightTriangle', label: 'Right Triangle', shortLabel: 'Rt Tri', category: 'math', keywords: ['pythagorean', 'geometry'] },
  { kind: 'angle', label: 'Angle', shortLabel: 'Angle', category: 'math', keywords: ['geometry', 'ray'] },
  { kind: 'coordinateAxes', label: 'Coordinate Axes', shortLabel: 'Axes', category: 'math', keywords: ['graph', 'xy', 'plane'] },
  { kind: 'pieChart', label: 'Pie (shape)', shortLabel: 'Pie', category: 'math', keywords: ['circle graph', 'fraction'] },

  // Everyday (axe intentionally omitted from catalog; draw API retained)
  { kind: 'actingMask', label: 'Acting Mask', shortLabel: 'Mask', category: 'everyday', keywords: ['theater', 'drama'] },
  { kind: 'apple', label: 'Apple', shortLabel: 'Apple', category: 'everyday' },
  { kind: 'beach', label: 'Beach', shortLabel: 'Beach', category: 'everyday', keywords: ['sand', 'palm'] },
  { kind: 'bed', label: 'Bed', shortLabel: 'Bed', category: 'everyday' },
  { kind: 'birdHouse', label: 'Bird House', shortLabel: 'Bird H.', category: 'everyday' },
  { kind: 'bowling', label: 'Bowling', shortLabel: 'Bowling', category: 'everyday' },
  { kind: 'candle', label: 'Candle', shortLabel: 'Candle', category: 'everyday' },
  { kind: 'cat', label: 'Cat', shortLabel: 'Cat', category: 'everyday' },
  { kind: 'dog', label: 'Dog', shortLabel: 'Dog', category: 'everyday' },
  { kind: 'flower', label: 'Flower', shortLabel: 'Flower', category: 'everyday', keywords: ['daisy'] },
  { kind: 'hiking', label: 'Hiking', shortLabel: 'Hiking', category: 'everyday', keywords: ['trail'] },
  { kind: 'house', label: 'House', shortLabel: 'House', category: 'everyday' },
  { kind: 'iceSkates', label: 'Ice Skating Skates', shortLabel: 'Skates', category: 'everyday' },
  { kind: 'movieProjector', label: 'Movie Projector', shortLabel: 'Proj.', category: 'everyday', keywords: ['film'] },
  { kind: 'mustache', label: 'Mustache', shortLabel: 'Mustache', category: 'everyday' },
  { kind: 'paintbrush', label: 'Paintbrush', shortLabel: 'Brush', category: 'everyday', keywords: ['art'] },
  { kind: 'vampireFangs', label: 'Vampire Fangs', shortLabel: 'Fangs', category: 'everyday' },
];

export const SHAPE_CATEGORY_LABELS: Record<ShapeCatalogCategory, string> = {
  basics: 'Basics',
  science: 'Science',
  history: 'History',
  math: 'Math',
  everyday: 'Everyday',
};

/** Categories shown in the Shapes section (math quick shapes live under Math). */
export const SHAPES_SECTION_CATEGORIES: Array<Exclude<ShapeCatalogCategory, 'math'>> = [
  'basics',
  'science',
  'history',
  'everyday',
];

export function shapesInCategory(category: ShapeCatalogCategory): ShapeCatalogEntry[] {
  return SHAPE_CATALOG.filter(s => s.category === category);
}

export function getShapeEntry(kind: InventoryShapeKind): ShapeCatalogEntry | undefined {
  return SHAPE_CATALOG.find(s => s.kind === kind);
}

export interface MathToolEntry {
  id: 'clock' | 'fraction' | 'numberLine' | 'base10' | 'manipulatives' | 'graph' | 'chart';
  label: string;
  keywords?: string[];
}

export const MATH_TOOLS: MathToolEntry[] = [
  { id: 'clock', label: 'Clock', keywords: ['time'] },
  { id: 'fraction', label: 'Fraction', keywords: ['pie', 'sector'] },
  { id: 'numberLine', label: 'Number Line', keywords: ['line'] },
  { id: 'base10', label: 'Base-10', keywords: ['blocks', 'place value'] },
  { id: 'manipulatives', label: 'Manipulatives', keywords: ['array', 'grid'] },
  { id: 'graph', label: 'Graphs', keywords: ['equation', 'function', 'plot'] },
  { id: 'chart', label: 'Charts (data)', keywords: ['bar', 'data', 'table'] },
];

export interface DrawingToolEntry {
  id: 'photo' | 'raisedPrintText';
  label: string;
  keywords?: string[];
}

export const DRAWING_TOOLS: DrawingToolEntry[] = [
  { id: 'photo', label: 'Tactile Design', keywords: ['trace', 'image', 'draw', 'label', 'braille', 'diagram', 'photo', 'overlay'] },
  { id: 'raisedPrintText', label: 'Raised Print Text', keywords: ['jumbo', 'large print', 'letters'] },
];

export type SearchHit =
  | { kind: 'mathTool'; tool: MathToolEntry }
  | { kind: 'mathQuickShape'; shape: ShapeCatalogEntry }
  | { kind: 'shape'; shape: ShapeCatalogEntry }
  | { kind: 'customShape' }
  | { kind: 'drawing'; tool: DrawingToolEntry };

function tokenize(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Token-aware match so short queries like "axe" do not hit "coordinateAxes". */
function matchesQuery(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const tokens = tokenize(haystack);
  if (tokens.some(t => t === q)) return true;
  // Multi-word / phrase (e.g. "pie shape", "number line")
  const norm = tokenize(haystack).join(' ');
  if (q.includes(' ') && norm.includes(q)) return true;
  // Prefix match for longer queries ("volc" → volcano, "tri" skipped at <4)
  if (q.length >= 4 && tokens.some(t => t.startsWith(q))) return true;
  return false;
}

export function searchGraphicsCatalog(rawQuery: string): SearchHit[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];

  const hits: SearchHit[] = [];

  for (const tool of MATH_TOOLS) {
    const blob = [tool.label, tool.id, ...(tool.keywords ?? [])].join(' ');
    if (matchesQuery(blob, q)) hits.push({ kind: 'mathTool', tool });
  }

  for (const shape of shapesInCategory('math')) {
    const blob = [shape.label, shape.shortLabel, shape.kind, shape.category, ...(shape.keywords ?? [])].join(' ');
    if (matchesQuery(blob, q)) hits.push({ kind: 'mathQuickShape', shape });
  }

  for (const shape of SHAPE_CATALOG.filter(s => s.category !== 'math')) {
    const blob = [shape.label, shape.shortLabel, shape.kind, shape.category, ...(shape.keywords ?? [])].join(' ');
    if (matchesQuery(blob, q)) hits.push({ kind: 'shape', shape });
  }

  if (matchesQuery('custom shapes polygon sides rotation', q)) {
    hits.push({ kind: 'customShape' });
  }

  for (const tool of DRAWING_TOOLS) {
    const blob = [tool.label, tool.id, ...(tool.keywords ?? [])].join(' ');
    if (matchesQuery(blob, q)) hits.push({ kind: 'drawing', tool });
  }

  return hits;
}

export function searchHitLabel(hit: SearchHit): string {
  switch (hit.kind) {
    case 'mathTool':
      return hit.tool.label;
    case 'mathQuickShape':
      return hit.shape.label;
    case 'shape':
      return hit.shape.label;
    case 'customShape':
      return 'Custom Polygon';
    case 'drawing':
      return hit.tool.label;
  }
}

export function searchHitChip(hit: SearchHit): string {
  switch (hit.kind) {
    case 'mathTool':
      return 'Math · Tool';
    case 'mathQuickShape':
      return 'Math · Quick shape';
    case 'shape':
      return `Shapes · ${SHAPE_CATEGORY_LABELS[hit.shape.category]}`;
    case 'customShape':
      return 'Shapes · Custom';
    case 'drawing':
      return 'Drawing';
  }
}
