/**
 * Unit tests for MusicSynthEngine with a minimal Web Audio mock.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicSynthEngine } from './musicSynth';

type MockOsc = {
  type: string;
  frequency: { setValueAtTime: ReturnType<typeof vi.fn> };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
};

type MockGain = {
  gain: {
    value: number;
    setValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    cancelScheduledValues: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

const createdContexts: MockAudioContext[] = [];

class MockAudioContext {
  currentTime = 0;
  state: AudioContextState = 'suspended';
  destination = {};
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  oscillators: MockOsc[] = [];

  constructor() {
    createdContexts.push(this);
  }

  createOscillator = vi.fn(() => {
    const osc: MockOsc = {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    };
    this.oscillators.push(osc);
    return osc;
  });

  createGain = vi.fn(() => {
    const gainNode: MockGain = {
      gain: {
        value: 0.0001,
        setValueAtTime: vi.fn((v: number) => {
          gainNode.gain.value = v;
        }),
        exponentialRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    return gainNode;
  });
}

describe('MusicSynthEngine', () => {
  beforeEach(() => {
    createdContexts.length = 0;
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('webkitAudioContext', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('awaits context resume before ensureReady resolves', async () => {
    const engine = new MusicSynthEngine();
    await engine.ensureReady();
    expect(createdContexts).toHaveLength(1);
    expect(createdContexts[0].resume).toHaveBeenCalledTimes(1);
    expect(createdContexts[0].state).toBe('running');
    expect(engine.now()).toBe(0);
  });

  it('schedules a chord after ensureReady and reuses one context', async () => {
    const engine = new MusicSynthEngine();
    await engine.ensureReady();
    const firstCtx = createdContexts[0];
    engine.playChord([60, 64], 0.05, 0.5);
    expect(firstCtx.createOscillator).toHaveBeenCalledTimes(2);
    expect(firstCtx.oscillators[0].start).toHaveBeenCalled();
    expect(firstCtx.oscillators[1].start).toHaveBeenCalled();

    engine.silence();
    await engine.ensureReady();
    engine.playNote(67, engine.now() + 0.05, 0.2);
    expect(createdContexts).toHaveLength(1);
    expect(createdContexts[0]).toBe(firstCtx);
  });

  it('silence keeps the context open; dispose closes it', async () => {
    const engine = new MusicSynthEngine();
    await engine.ensureReady();
    engine.playNote(60, 0.05, 0.3);
    engine.silence();
    expect(createdContexts[0].close).not.toHaveBeenCalled();
    expect(createdContexts[0].state).toBe('running');

    engine.dispose();
    expect(createdContexts[0].close).toHaveBeenCalledTimes(1);
  });

  it('throws when Web Audio is unavailable', async () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    const engine = new MusicSynthEngine();
    await expect(engine.ensureReady()).rejects.toThrow(/not available/i);
  });

  it('clamps start times that are in the past', async () => {
    const engine = new MusicSynthEngine();
    await engine.ensureReady();
    createdContexts[0].currentTime = 1;
    engine.playNote(60, 0.01, 0.2);
    const startArg = createdContexts[0].oscillators[0].start.mock.calls[0][0] as number;
    expect(startArg).toBeGreaterThan(1);
  });
});
