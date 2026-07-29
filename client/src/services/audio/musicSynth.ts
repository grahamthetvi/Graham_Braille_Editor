/**
 * Lightweight native Web Audio synthesizer for Music Braille playback.
 * No external audio packages — triangle oscillators with a short envelope.
 */

type WebkitWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

export class MusicSynthEngine {
  private ctx: AudioContext | null = null;
  private activeNodes: Array<{ osc: OscillatorNode; gain: GainNode }> = [];

  private getContext(): AudioContext {
    if (!this.ctx) {
      const w = window as WebkitWindow;
      const Ctor = window.AudioContext || w.webkitAudioContext;
      if (!Ctor) {
        throw new Error('Web Audio API is not available in this browser');
      }
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  /** Current audio clock time (seconds), or 0 if context not yet created. */
  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  playNote(midiPitch: number, startTime: number, durationSec: number): void {
    this.playChord([midiPitch], startTime, durationSec);
  }

  playChord(midiPitches: number[], startTimeSec: number, durationSec: number): void {
    if (!midiPitches.length || durationSec <= 0) return;

    const ctx = this.getContext();
    const voiceCount = midiPitches.length;
    const peak = Math.min(0.22, 0.35 / Math.sqrt(voiceCount));
    const attack = Math.min(0.02, durationSec * 0.2);
    const release = Math.min(0.05, Math.max(0.01, durationSec * 0.25));
    const stopAt = startTimeSec + durationSec;

    for (const midiPitch of midiPitches) {
      if (!Number.isFinite(midiPitch)) continue;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const freq = 440 * Math.pow(2, (midiPitch - 69) / 12);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTimeSec);

      gain.gain.setValueAtTime(0.0001, startTimeSec);
      gain.gain.exponentialRampToValueAtTime(peak, startTimeSec + attack);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        Math.max(startTimeSec + attack + 0.001, stopAt - release),
      );

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTimeSec);
      osc.stop(stopAt + 0.01);

      const entry = { osc, gain };
      this.activeNodes.push(entry);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          /* already disconnected */
        }
        this.activeNodes = this.activeNodes.filter((n) => n !== entry);
      };
    }
  }

  /** Silence and tear down the audio context (call on Stop). */
  stopAll(): void {
    for (const { osc, gain } of this.activeNodes) {
      try {
        osc.stop();
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.activeNodes = [];
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
