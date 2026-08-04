const listeners = new Set<() => void>();

export function subscribeJobs(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function notifyJobs(): void {
  for (const cb of listeners) cb();
}
