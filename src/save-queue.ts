/** Serialize writes so an older autosave cannot finish after a newer explicit save. */
export function createSaveQueue() {
  let pending: Promise<void> = Promise.resolve();
  let count = 0;
  const enqueue = (write: () => Promise<void>): Promise<void> => {
    count += 1;
    const next = pending.catch(() => undefined).then(write).finally(() => { count -= 1; });
    pending = next;
    return next;
  };
  return Object.assign(enqueue, { isPending: () => count > 0 });
}
