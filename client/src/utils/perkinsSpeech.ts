/**
 * Speech strings for Perkins practice: dot numbers in order 1–6, and
 * matching fingers (left pointer→1 … left ring→3, right pointer→4 … right ring→6).
 */

const FINGER_BY_DOT: Record<number, string> = {
    1: 'left pointer',
    2: 'left middle',
    3: 'left ring',
    4: 'right pointer',
    5: 'right middle',
    6: 'right ring',
};

function joinOxford(items: string[]): string {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/** Dots 1–6 that are active, in ascending order. */
export function getActiveDotNumbers(dots: readonly boolean[]): number[] {
    const out: number[] = [];
    for (let i = 0; i < 6; i++) {
        if (dots[i]) out.push(i + 1);
    }
    return out;
}

export function buildDotsSpeech(active: number[], isSpace: boolean): string {
    if (isSpace) {
        return 'Press the space bar. No letter dots for a space.';
    }
    if (active.length === 0) {
        return 'No dots are defined for this character in the practice map.';
    }
    const listed = joinOxford(active.map(String));
    return `Press dots ${listed} together, all at once.`;
}

export function buildFingersSpeech(active: number[], isSpace: boolean): string {
    if (isSpace) {
        return 'Press the space bar with both thumbs.';
    }
    if (active.length === 0) {
        return 'No finger keys for this character in the practice map.';
    }
    const fingers = active.map((d) => FINGER_BY_DOT[d]);
    const listed = joinOxford(fingers);
    return `Press together: ${listed}.`;
}

let currentUtterance: SpeechSynthesisUtterance | null = null;
let speechTimeoutId: ReturnType<typeof setTimeout> | null = null;

export function speakPerkinsHint(text: string): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    if (speechTimeoutId !== null) {
        clearTimeout(speechTimeoutId);
        speechTimeoutId = null;
    }

    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.92;

    u.onend = () => {
        if (currentUtterance === u) {
            currentUtterance = null;
        }
    };
    u.onerror = () => {
        if (currentUtterance === u) {
            currentUtterance = null;
        }
    };

    currentUtterance = u;

    // Use a 50ms delay to prevent Chromium from asynchronously cancelling 
    // the newly queued utterance right after calling cancel().
    speechTimeoutId = setTimeout(() => {
        if (currentUtterance === u) {
            window.speechSynthesis.speak(u);
        }
        speechTimeoutId = null;
    }, 50);
}

export function cancelPerkinsSpeech(): void {
    if (speechTimeoutId !== null) {
        clearTimeout(speechTimeoutId);
        speechTimeoutId = null;
    }
    currentUtterance = null;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
}

