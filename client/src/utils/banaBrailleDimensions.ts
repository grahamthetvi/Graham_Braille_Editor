/**
 * BANA interpoint / signage-style tactile dimensions (millimeters).
 * Ranges from Braille Authority of North America size-and-spacing guidance;
 * defaults use the midpoint of each range for predictable exports.
 *
 * STL files carry no unit metadata; slicers conventionally treat values as millimeters.
 */
export interface BanaBrailleDimensionsMm {
  /** Center-to-center horizontal spacing of corresponding dots in adjacent cells. */
  interCellCenterMm: number;
  /** Center-to-center spacing of corresponding dots on consecutive lines. */
  lineCenterMm: number;
  /** Center-to-center spacing between adjacent dot centers within one cell (row or column). */
  intraCellCenterMm: number;
  /** Nominal dot base diameter (flat cylinder footprint). */
  dotBaseDiameterMm: number;
  /** Raised dot height above the plate surface. */
  dotHeightMm: number;
}

/** Inclusive BANA ranges (mm); useful for UI sliders later. */
export const BANA_DIMENSION_RANGES_MM = {
  dotBaseDiameter: { min: 1.5, max: 1.6 },
  dotHeight: { min: 0.6, max: 0.9 },
  intraCell: { min: 2.3, max: 2.5 },
  interCell: { min: 6.1, max: 7.6 },
  lineCenter: { min: 10.0, max: 10.2 },
} as const;

function mid(a: number, b: number): number {
  return (a + b) / 2;
}

/** Default export dimensions = midpoint of each BANA range. */
export function defaultBanaBrailleDimensionsMm(): BanaBrailleDimensionsMm {
  const d = BANA_DIMENSION_RANGES_MM;
  return {
    dotBaseDiameterMm: mid(d.dotBaseDiameter.min, d.dotBaseDiameter.max),
    dotHeightMm: mid(d.dotHeight.min, d.dotHeight.max),
    intraCellCenterMm: mid(d.intraCell.min, d.intraCell.max),
    interCellCenterMm: mid(d.interCell.min, d.interCell.max),
    lineCenterMm: mid(d.lineCenter.min, d.lineCenter.max),
  };
}
