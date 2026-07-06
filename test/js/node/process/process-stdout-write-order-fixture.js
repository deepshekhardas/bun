// stdout is a FIFO nobody else reads. Fill it until the sink reports
// backpressure, drain the pipe synchronously, then write once more: that last
// write is accepted outright while the previous one is still parked on the
// sink's backpressure promise.
//
// BUN_TEST_MODE perturbs what runs while that promise's reactions are still
// queued, which is where the reporting order is easy to get wrong:
//   throw-on-drain    a 'drain' listener throws, settling the parked write's
//                     callback one microtask later than the promise itself
//   write-on-drain    a 'drain' listener writes
//   write-in-callback the parked write's own callback writes
const fs = require("node:fs");

const mode = process.env.BUN_TEST_MODE ?? "";
const readFd = fs.openSync(process.env.BUN_TEST_FIFO, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);

const order = [];
let next = 0;
let total = -1;
let resolveDone;
const done = new Promise(resolve => (resolveDone = resolve));

function seal() {
  total = next;
  if (order.length >= total) resolveDone();
}

function record(index) {
  order.push(index);
  if (total >= 0 && order.length >= total) resolveDone();
}

// The re-entrant write, issued from user code that runs while the sink's promise
// reactions are still queued. It has to report after every write issued before it.
let reentrant = -1;
function writeReentrant() {
  if (reentrant !== -1) return;
  reentrant = next++;
  process.stdout.write(Buffer.from("!"), () => record(reentrant));
  seal();
}

if (mode === "throw-on-drain") {
  process.stdout.on("drain", () => {
    throw new Error("drain listener throws");
  });
} else if (mode === "write-on-drain") {
  process.stdout.once("drain", writeReentrant);
}

const chunk = Buffer.alloc(4096, 0x61);
let parked = -1;
let backpressured = false;
while (next < 1024) {
  const index = next++;
  const accepted = process.stdout.write(chunk, () => {
    record(index);
    if (mode === "write-in-callback" && index === parked) writeReentrant();
  });
  if (!accepted) {
    parked = index;
    backpressured = true;
    break;
  }
}

// Empty the pipe so the next write can flush the sink's whole buffer in one go.
const scratch = Buffer.alloc(65536);
for (;;) {
  try {
    if (fs.readSync(readFd, scratch, 0, scratch.length, null) === 0) break;
  } catch (err) {
    if (err.code === "EAGAIN") break;
    throw err;
  }
}

const last = next++;
const lastWriteAccepted = process.stdout.write(Buffer.from("."), () => record(last));

// The re-entrant modes seal once their extra write is issued.
if (mode !== "write-on-drain" && mode !== "write-in-callback") seal();

done.then(() => {
  process.stderr.write(JSON.stringify({ backpressured, lastWriteAccepted, reentrant, order }) + "\n");
  process.exit(0);
});
