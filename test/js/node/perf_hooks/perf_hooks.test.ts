import { expect, test } from "bun:test";
import perf from "perf_hooks";

// Like node, require("node:perf_hooks").performance is the global performance
// object itself, not a separate wrapper.
test("perf_hooks.performance is the global performance object", () => {
  expect(perf.performance).toBe(globalThis.performance);
});

test("doesn't throw", () => {
  expect(() => performance.mark("test")).not.toThrow();
  expect(() => performance.measure("test", "test")).not.toThrow();
  expect(() => performance.clearMarks()).not.toThrow();
  expect(() => performance.clearMeasures()).not.toThrow();
  expect(() => performance.getEntries()).not.toThrow();
  expect(() => performance.getEntriesByName("test")).not.toThrow();
  expect(() => performance.getEntriesByType("measure")).not.toThrow();
  expect(() => performance.now()).not.toThrow();
  expect(() => performance.timeOrigin).not.toThrow();
  expect(() => performance.markResourceTiming()).not.toThrow();
});

test("node-only members are present on performance", () => {
  expect(perf.performance.nodeTiming).toBeObject();
  expect(perf.performance.now()).toBeNumber();
  expect(perf.performance.timeOrigin).toBeNumber();
  expect(perf.performance.eventLoopUtilization).toBeFunction();
  expect(perf.performance.eventLoopUtilization()).toEqual({
    idle: expect.any(Number),
    active: expect.any(Number),
    utilization: expect.any(Number),
  });
});

// markResourceTiming / clearResourceTimings were missing / a JS no-op before the
// module exported the global; now they are the global's own methods.
test("resource-timing methods are present and callable", () => {
  expect(perf.performance.markResourceTiming).toBeFunction();
  expect(() => perf.performance.markResourceTiming()).not.toThrow();
  expect(perf.performance.clearResourceTimings).toBeFunction();
  expect(() => perf.performance.clearResourceTimings()).not.toThrow();
});

// node puts the node-only members on Performance.prototype, non-enumerable, so
// Object.keys(performance) is unchanged.
test("node-only members live on the prototype, non-enumerable", () => {
  const proto = Object.getPrototypeOf(globalThis.performance);
  for (const key of ["nodeTiming", "eventLoopUtilization"]) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    expect(descriptor).toBeDefined();
    expect(descriptor!.enumerable).toBe(false);
  }
  expect(Object.keys(globalThis.performance)).not.toContain("nodeTiming");
  expect(Object.keys(globalThis.performance)).not.toContain("eventLoopUtilization");
});

// onresourcetimingbufferfull is the global's own accessor; since the module
// object is the global, assigning through either reaches the same object.
test("onresourcetimingbufferfull is the global's accessor", () => {
  const previous = globalThis.performance.onresourcetimingbufferfull;
  try {
    const listener = () => {};
    perf.performance.onresourcetimingbufferfull = listener;
    expect(globalThis.performance.onresourcetimingbufferfull).toBe(listener);
  } finally {
    globalThis.performance.onresourcetimingbufferfull = previous;
  }
});

// node's lib/perf_hooks.js lists eventLoopUtilization in module.exports as well
// as on `performance`, and the two are the same function object. (It is absent
// from the module exports on v22 and earlier; this matches current node.)
test("perf_hooks exports eventLoopUtilization at the module level", () => {
  expect(perf.eventLoopUtilization).toBeFunction();
  expect(perf.eventLoopUtilization).toBe(perf.performance.eventLoopUtilization);
  expect(perf.eventLoopUtilization()).toEqual({
    idle: expect.any(Number),
    active: expect.any(Number),
    utilization: expect.any(Number),
  });
});
