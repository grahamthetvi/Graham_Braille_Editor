/**
 * Spoken announcements for Music Braille step controls.
 * Mirrors Perkins speech: cancel + short delay so Chromium does not drop the utterance.
 */

let currentUtterance: SpeechSynthesisUtterance | null = null;
let speechTimeoutId: ReturnType<typeof setTimeout> | null = null;

export function speakMusicHint(text: string): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  if (!text.trim()) return;

  if (speechTimeoutId !== null) {
    clearTimeout(speechTimeoutId);
    speechTimeoutId = null;
  }

  window.speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;

  u.onend = () => {
    if (currentUtterance === u) currentUtterance = null;
  };
  u.onerror = () => {
    if (currentUtterance === u) currentUtterance = null;
  };

  currentUtterance = u;

  speechTimeoutId = setTimeout(() => {
    if (currentUtterance === u) {
      window.speechSynthesis.speak(u);
    }
    speechTimeoutId = null;
  }, 50);
}

export function cancelMusicSpeech(): void {
  if (speechTimeoutId !== null) {
    clearTimeout(speechTimeoutId);
    speechTimeoutId = null;
  }
  currentUtterance = null;
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}
