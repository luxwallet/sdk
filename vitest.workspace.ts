/**
 * Vitest workspace — discover every package's tests. `pnpm -r test` runs
 * each package's own `vitest run`; this file lets a root `vitest` run them
 * all at once during local iteration.
 */
export default ["packages/*"];
