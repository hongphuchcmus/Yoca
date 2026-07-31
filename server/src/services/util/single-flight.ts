/**
 * Prevents cache stampedes when concurrent requests refresh the same dataset.
 * Calls with the same key share one in-flight operation, reducing duplicate
 * provider calls without caching the resolved value. Use `.by(keySelector)`
 * for reused operations or `.key(key).run(...args)` at one refresh boundary.
 * Errors propagate unchanged; coordination is local to this Node.js process.
 */
export function singleFlight<Args extends unknown[], Result>(
  operation: (...args: Args) => Promise<Result>,
) {
  const active = new Map<string, Promise<Result>>();

  const run = (key: string, args: Args): Promise<Result> => {
    const pending = active.get(key);

    // Concurrent callers for the same dataset share the active operation.
    if (pending) {
      return pending;
    }

    // Do not retain resolved values; persisted data remains in the database.
    const operationPromise = operation(...args).finally(() => {
      active.delete(key);
    });
    active.set(key, operationPromise);
    return operationPromise;
  };

  return {
    by(keySelector: (...args: Args) => string) {
      return (...args: Args): Promise<Result> =>
        run(keySelector(...args), args);
    },
    key(key: string) {
      return {
        run(...args: Args): Promise<Result> {
          return run(key, args);
        },
      };
    },
  };
}
