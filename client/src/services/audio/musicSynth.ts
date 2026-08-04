/**
 * Lightweight native Web Audio synthesizer for Music Braille playback.
 * No external audio packages — triangle oscillators with a short envelope.
 *
 * Keeps a single AudioContext alive across pause/resume; only `dispose()`
 * closes it (e.g. on unmount). Call `ensureReady()` from a user gesture
 * before scheduling so autoplay-policy resume completes first.
 */

type WebkitWindow = typeof globalThis & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

type ActiveVoice = { osc: OscillatorNode; gain: GainNode };

export class MusicSynthEngine {
  private ctx: AudioContext | null = null;
  private activeNodes = new Set<ActiveVoice>();
  private readyPromise: Promise<AudioContext> | null = null;

  private getOrCreateContext(): AudioContext {
    if (this.ctx && this.ctx.state !== 'closed') {
      return this.ctx;
    }
    const g = globalThis as WebkitWindow;
    const Ctor = g.AudioContext || g.webkitAudioContext;
    if (!Ctor) {
      throw new Error('Web Audio API is not available in this browser');
    }
    this.ctx = new Ctor();
    return this.ctx;
  }

  /**
   * Ensure an AudioContext exists and is running. Must be awaited before
   * scheduling notes so the first attack is not lost to autoplay policy.
   */
  async ensureReady(): Promise<AudioContext> {
    if (this.ctx && this.ctx.state === 'running') {
      return this.ctx;
    }
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = (async () => {
      const ctx = this.getOrCreateContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      if (ctx.state !== 'running') {
        throw new Error('AudioContext failed to resume');
      }
      return ctx;
    })();

    try {
      return await this.readyPromise;
    } finally {
      this.readyPromise = null;
    }
  }

  /** Current audio clock time (seconds). Prefer calling after `ensureReady()`. */
  now(): number {
    return this.ctx && this.ctx.state !== 'closed' ? this.ctx.currentTime : 0;
  }

  playNote(midiPitch: number, startTime: number, durationSec: number): void {
    this.playChord([midiPitch], startTime, durationSec);
  }

  /**
   * Soft pedagogical click for a rest (not a pitched note). Short square blip
   * so students can feel measured silence without confusing it for melody.
   */
  playRestClick(startTimeSec: number): void {
    const ctx = this.getOrCreateContext();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const durationSec = 0.04;
    const peak = 0.08;
    const start = Math.max(startTimeSec, ctx.currentTime + 0.001);
    const stopAt = start + durationSec;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1400, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(stopAt + 0.01);

    const entry: ActiveVoice = { osc, gain };
    this.activeNodes.add(entry);
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* already disconnected */
      }
      this.activeNodes.delete(entry);
    };
  }

  playChord(midiPitches: number[], startTimeSec: number, durationSec: number): void {
    if (!midiPitches.length || durationSec <= 0) return;

    const ctx = this.getOrCreateContext();
    // Best-effort resume if a caller skipped ensureReady (e.g. tests).
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const voiceCount = midiPitches.length;
    const peak = Math.min(0.22, 0.35 / Math.sqrt(voiceCount));
    const attack = Math.min(0.02, durationSec * 0.2);
    const release = Math.min(0.05, Math.max(0.01, durationSec * 0.25));
    // Clamp into the future so Web Audio does not reject past automation times.
    const start = Math.max(startTimeSec, ctx.currentTime + 0.001);
    const stopAt = start + durationSec;

    for (const midiPitch of midiPitches) {
      if (!Number.isFinite(midiPitch)) continue;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const freq = 440 * Math.pow(2, (midiPitch - 69) / 12);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + attack);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        Math.max(start + attack + 0.001, stopAt - release),
      );

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(stopAt + 0.01);

      const entry: ActiveVoice = { osc, gain };
      this.activeNodes.add(entry);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          /* already disconnected */
        }
        this.activeNodes.delete(entry);
      };
    }
  }

  /** Silence sounding voices but keep the AudioContext for reuse. */
  silence(): void {
    const now = this.now();
    for (const entry of this.activeNodes) {
      const { osc, gain } = entry;
      try {
        gain.gain.cancelScheduledValues(now);
        const current = Math.max(0.0001, gain.gain.value || 0.0001);
        gain.gain.setValueAtTime(current, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
        osc.stop(now + 0.03);
      } catch {
        try {
          osc.stop();
        } catch {
          /* already stopped */
        }
      }
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.activeNodes.clear();
  }

  /** Silence and close the audio context (call on unmount). */
  dispose(): void {
    this.silence();
    this.readyPromise = null;
    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close();
    }
    this.ctx = null;
  }
}
