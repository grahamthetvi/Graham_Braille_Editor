import { describe, expect, it } from 'vitest';
import { createScrollSync, type FrameScheduler } from './useScrollSync';

function mockScheduler() {
  let nextId = 1;
  const pending = new Map<number, () => void>();
  const scheduler: FrameScheduler = {
    request(cb) {
      const id = nextId++;
      pending.set(id, cb);
      return id;
    },
    cancel(id) {
      pending.delete(id);
    },
  };
  const flushFrame = () => {
    const cbs = [...pending.values()];
    pending.clear();
    for (const cb of cbs) cb();
  };
  return { scheduler, flushFrame, pending };
}

describe('createScrollSync', () => {
  it('applies the follower update immediately (no frame delay)', () => {
    const { scheduler } = mockScheduler();
    const sync = createScrollSync(scheduler);
    const applied: number[] = [];

    sync.syncFrom('editor', () => {
      applied.push(0.4);
    });

    expect(applied).toEqual([0.4]);
  });

  it('ignores follower echoes while the leader gesture is in flight', () => {
    const { scheduler } = mockScheduler();
    const sync = createScrollSync(scheduler);
    const preview: number[] = [];
    const editor: number[] = [];

    sync.syncFrom('editor', () => {
      preview.push(0.5);
      // DOM/Monaco typically fire the follower scroll event synchronously.
      sync.syncFrom('preview', () => {
        editor.push(0.5);
      });
    });

    expect(preview).toEqual([0.5]);
    expect(editor).toEqual([]);
  });

  it('keeps applying further leader events during the echo lock', () => {
    const { scheduler, flushFrame } = mockScheduler();
    const sync = createScrollSync(scheduler);
    const preview: number[] = [];

    sync.syncFrom('editor', () => {
      preview.push(0.1);
    });
    sync.syncFrom('editor', () => {
      preview.push(0.2);
    });
    sync.syncFrom('editor', () => {
      preview.push(0.3);
    });

    expect(preview).toEqual([0.1, 0.2, 0.3]);

    // Echo from the last programmatic follower update is still ignored.
    sync.syncFrom('preview', () => {
      preview.push(99);
    });
    expect(preview).toEqual([0.1, 0.2, 0.3]);

    flushFrame();
    flushFrame();

    sync.syncFrom('preview', () => {
      preview.push(0.4);
    });
    expect(preview).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it('lets the other pane become leader after the echo lock clears', () => {
    const { scheduler, flushFrame } = mockScheduler();
    const sync = createScrollSync(scheduler);
    const applied: Array<[string, number]> = [];

    sync.syncFrom('preview', () => {
      applied.push(['editor', 0.8]);
    });
    flushFrame();
    flushFrame();

    sync.syncFrom('editor', () => {
      applied.push(['preview', 0.9]);
    });

    expect(applied).toEqual([
      ['editor', 0.8],
      ['preview', 0.9],
    ]);
  });
});
