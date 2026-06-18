import { describe, expect, it } from 'vitest';
import { ViewPlusEmbosser } from './ViewPlusEmbosser';

describe('ViewPlusEmbosser padding tests', () => {
  it('should use default padding of 16 if not overridden', () => {
    const emb = new ViewPlusEmbosser('viewplus', 'ViewPlus', 16);
    expect(emb.getDefaultLeftPadCells()).toBe(16);
    
    const rawBytes = emb.generateBytes("hello", {});
    const decoded = new TextDecoder().decode(rawBytes);
    expect(decoded.startsWith(' '.repeat(16) + 'hello')).toBe(true);
  });

  it('should use default padding of 0 for EmBraille if not overridden', () => {
    const emb = new ViewPlusEmbosser('viewplus-embraille', 'EmBraille', 0);
    expect(emb.getDefaultLeftPadCells()).toBe(0);
    
    const rawBytes = emb.generateBytes("hello", {});
    const decoded = new TextDecoder().decode(rawBytes);
    expect(decoded.startsWith('hello')).toBe(true);
  });

  it('should allow custom positive padding via attributes override', () => {
    const emb = new ViewPlusEmbosser('viewplus', 'ViewPlus', 16);
    const rawBytes = emb.generateBytes("hello", { viewPlusLeftPadCells: 5 });
    const decoded = new TextDecoder().decode(rawBytes);
    expect(decoded.startsWith(' '.repeat(5) + 'hello')).toBe(true);
  });

  it('should allow custom negative padding (slicing characters)', () => {
    const emb = new ViewPlusEmbosser('viewplus', 'ViewPlus', 16);
    const rawBytes = emb.generateBytes("abcdefg\nhijk", { viewPlusLeftPadCells: -3 });
    const decoded = new TextDecoder().decode(rawBytes);
    const lines = decoded.split(/\r?\n/);
    expect(lines[0]).toBe('defg');
    expect(lines[1]).toBe('k');
  });

  it('should clamp padding to limits (-80, 80)', () => {
    const emb = new ViewPlusEmbosser('viewplus', 'ViewPlus', 16);
    const rawBytes = emb.generateBytes("abcdefg", { viewPlusLeftPadCells: -100 });
    const decoded = new TextDecoder().decode(rawBytes);
    expect(decoded.replace(/\f|\r?\n/g, '')).toBe('');
  });
});
