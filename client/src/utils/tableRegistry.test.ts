/**
 * tableRegistry.test.ts — registry integrity vs public/tables/
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  ALL_TABLES,
  DEFAULT_TABLE,
  TABLE_GROUPS,
  TABLE_RENAMES,
  migrateTableFilename,
  isKnownTable,
  isGrade2Table,
  getGrade2TableFor,
} from './tableRegistry';
import { UI_LOCALES } from '../i18n/locales';

const tablesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/tables');

describe('tableRegistry', () => {
  it('has unique filenames across groups', () => {
    const files = ALL_TABLES.map((t) => t.file);
    expect(new Set(files).size).toBe(files.length);
  });

  it('every registry file exists under public/tables/', () => {
    const missing = ALL_TABLES.map((t) => t.file).filter(
      (f) => !existsSync(resolve(tablesDir, f))
    );
    expect(missing).toEqual([]);
  });

  it('DEFAULT_TABLE is registered and present', () => {
    expect(isKnownTable(DEFAULT_TABLE)).toBe(true);
    expect(existsSync(resolve(tablesDir, DEFAULT_TABLE))).toBe(true);
  });

  it('locale default tables are registered', () => {
    for (const locale of UI_LOCALES) {
      expect(isKnownTable(locale.defaultTable), locale.id).toBe(true);
      expect(existsSync(resolve(tablesDir, locale.defaultTable)), locale.id).toBe(true);
    }
  });

  it('migrateTableFilename maps legacy names', () => {
    expect(migrateTableFilename('Fr-Fr-g2.ctb')).toBe('fr-bfu-g2.ctb');
    expect(migrateTableFilename('de-de-g1.ctb')).toBe('de-g1.ctb');
    expect(migrateTableFilename('ru-compbrl.ctb')).toBe('ru-comp6.utb');
    expect(migrateTableFilename('en-ueb-g1.ctb')).toBe('en-ueb-g1.ctb');
  });

  it('rename targets exist on disk', () => {
    for (const target of Object.values(TABLE_RENAMES)) {
      expect(existsSync(resolve(tablesDir, target)), target).toBe(true);
    }
  });

  it('has a substantial literary/computer coverage', () => {
    expect(ALL_TABLES.length).toBeGreaterThanOrEqual(150);
    expect(TABLE_GROUPS.length).toBeGreaterThanOrEqual(10);
  });

  describe('isGrade2Table', () => {
    it('identifies Grade 2 and Grade 3 tables', () => {
      expect(isGrade2Table('en-ueb-g2.ctb')).toBe(true);
      expect(isGrade2Table('en-us-g2.ctb')).toBe(true);
      expect(isGrade2Table('en-g3.ctb')).toBe(true);
      expect(isGrade2Table('es-g2.ctb')).toBe(true);
      expect(isGrade2Table('en-ueb-g1.ctb')).toBe(false);
      expect(isGrade2Table('de-g0.utb')).toBe(false);
    });
  });

  describe('getGrade2TableFor', () => {
    it('resolves Grade 2 counterparts for common Grade 1 tables', () => {
      expect(getGrade2TableFor('en-ueb-g1.ctb')).toBe('en-ueb-g2.ctb');
      expect(getGrade2TableFor('en-us-g1.ctb')).toBe('en-us-g2.ctb');
      expect(getGrade2TableFor('es-g1.ctb')).toBe('es-g2.ctb');
      expect(getGrade2TableFor('en-gb-g1.utb')).toBe('en-GB-g2.ctb');
    });

    it('keeps existing Grade 2 tables', () => {
      expect(getGrade2TableFor('en-ueb-g2.ctb')).toBe('en-ueb-g2.ctb');
      expect(getGrade2TableFor('en-us-g2.ctb')).toBe('en-us-g2.ctb');
    });

    it('falls back to en-ueb-g2.ctb for unknown or unmapped tables', () => {
      expect(getGrade2TableFor('nemeth.ctb')).toBe('en-ueb-g2.ctb');
    });
  });
});
