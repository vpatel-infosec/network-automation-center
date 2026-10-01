/**
 * Run `worker` for every item with at most `limit` tasks in flight.
 * Unlike Promise.all this never rejects: every item resolves to
 *   { status: 'fulfilled', value }  or  { status: 'rejected', reason }
 * which keeps one broken device from aborting a whole automation job.
 */
export async function runPool(items, limit, worker) {
  const list = Array.from(items);
  const results = new Array(list.length);
  const size = Math.max(1, Math.min(limit || 1, list.length || 1));
  let cursor = 0;

  async function drain() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= list.length) return;
      try {
        results[index] = { status: 'fulfilled', value: await worker(list[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(Array.from({ length: size }, () => drain()));
  return results;
}

export default runPool;
