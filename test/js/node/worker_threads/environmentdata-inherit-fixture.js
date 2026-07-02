const { Worker, getEnvironmentData, setEnvironmentData, workerData, isMainThread } = require("worker_threads");

if (isMainThread) {
  // this value should be passed all the way down even through worker threads that don't call setEnvironmentData
  setEnvironmentData("inherited", "foo");
  new Worker(__filename, { workerData: { depth: 0 } });
} else {
  console.log(getEnvironmentData("inherited"));
  const { depth } = workerData;
  // 3 levels, each a sequential full VM boot, are enough to prove the value
  // survives workers that never call setEnvironmentData. Deeper chains push a
  // debug+ASAN run past the default test budget for no extra coverage.
  if (depth + 1 < 3) {
    new Worker(__filename, { workerData: { depth: depth + 1 } });
  }
}
