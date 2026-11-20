export function createAnimationFrameBatch(
  update: () => void,
  requestFrame: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancelFrame: (handle: number) => void = cancelAnimationFrame,
) {
  let frame: number | null = null;
  let pending = false;

  const flush = () => {
    if (frame !== null) cancelFrame(frame);
    frame = null;
    if (!pending) return;
    pending = false;
    update();
  };

  return {
    schedule() {
      pending = true;
      if (frame !== null) return;
      frame = requestFrame(() => {
        frame = null;
        if (!pending) return;
        pending = false;
        update();
      });
    },
    flush,
    cancel() {
      if (frame !== null) cancelFrame(frame);
      frame = null;
      pending = false;
    },
  };
}
