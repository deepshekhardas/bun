// A parked write whose callback throws must not leak the pending-report count. If it
// does, the sink's promise stays parked for the life of the stream, and every later
// accepted write reports from a microtask while readline's no-op moveCursor reports
// from process.nextTick, permanently reordering them.
//
// Park one write with a throwing callback, drain, then after its promise has settled
// write once more alongside a no-op moveCursor and report which callback ran first.
const fs = require("node:fs");
const readline = require("node:readline");

// The parked write's callback throws on success (.then) and again on the error re-run
// (.catch), so swallow both so the process survives to phase two.
process.on("uncaughtException", () => {});
process.on("unhandledRejection", () => {});

const readFd = fs.openSync(process.env.BUN_TEST_FIFO, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);

const chunk = Buffer.alloc(4096, 0x61);
let parkedIndex = -1;
let index = 0;
while (parkedIndex === -1) {
  const i = index++;
  // Only the parked write throws; the accepted ones must report cleanly.
  const accepted = process.stdout.write(chunk, () => {
    if (i === parkedIndex) throw new Error("boom");
  });
  if (!accepted) parkedIndex = i;
}

const scratch = Buffer.alloc(65536);
for (;;) {
  try {
    if (fs.readSync(readFd, scratch, 0, scratch.length, null) === 0) break;
  } catch (err) {
    if (err.code === "EAGAIN") break;
    throw err;
  }
}

// setTimeout runs after the parked write's promise has settled (and leaked, if buggy).
setTimeout(() => {
  const order = [];
  let pending = 2;
  const done = name => {
    order.push(name);
    if (--pending === 0) {
      fs.writeSync(2, JSON.stringify({ order }) + "\n");
      process.exit(0);
    }
  };
  process.stdout.write("A", () => done("write"));
  readline.moveCursor(process.stdout, 0, 0, () => done("moveCursor"));
}, 50);
