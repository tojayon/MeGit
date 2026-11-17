export function createRefreshQueue(task: () => Promise<void>): () => Promise<void> {
  let running = false;
  let waiters: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];
  async function drain() {
    running = true;
    while (waiters.length) {
      const batch = waiters;
      waiters = [];
      try {
        await task();
        batch.forEach((waiter) => waiter.resolve());
      } catch (error) {
        batch.forEach((waiter) => waiter.reject(error));
      }
    }
    running = false;
  }
  return () => {
    const result = new Promise<void>((resolve, reject) => waiters.push({ resolve, reject }));
    if (!running) void drain();
    return result;
  };
}
