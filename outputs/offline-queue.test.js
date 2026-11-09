"use strict";

const assert = require("assert");

function isRetryableSubmissionError(error) {
  return error instanceof TypeError || /\((429|5\d\d)\)/.test(String(error.message || ""));
}

async function processQueue(items, submit) {
  for (const item of items) {
    if (item.retryable === false) continue;
    try {
      await submit(item);
      item.state = "submitted";
      item.remove = true;
    } catch (error) {
      item.retryable = isRetryableSubmissionError(error);
      item.state = item.retryable ? "queued-offline" : "needs-attention";
    }
  }
  return items.filter((item) => !item.remove);
}

(async () => {
  const offlineItem = { submissionKey: "offline-key", state: "queued-offline" };
  let attempts = 0;
  let queued = await processQueue([offlineItem], async () => {
    attempts += 1;
    throw new TypeError("network unavailable");
  });
  assert.strictEqual(queued[0].state, "queued-offline");
  assert.strictEqual(queued[0].retryable, true);

  queued = await processQueue(queued, async () => {
    attempts += 1;
  });
  assert.strictEqual(queued.length, 0);
  assert.strictEqual(attempts, 2);

  const permanentItem = { submissionKey: "invalid-key", state: "queued-offline" };
  let permanentAttempts = 0;
  queued = await processQueue([permanentItem], async () => {
    permanentAttempts += 1;
    throw new Error("Submission failed (400)");
  });
  assert.strictEqual(queued[0].state, "needs-attention");
  assert.strictEqual(queued[0].retryable, false);
  await processQueue(queued, async () => {
    permanentAttempts += 1;
  });
  assert.strictEqual(permanentAttempts, 1);

  console.log("Offline queue policy test passed");
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
