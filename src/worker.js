require("dotenv").config();
const { redis } = require("./redis");
const { db } = require("./db");
const { fetchOrder } = require("./ml");

const STREAM_KEY = process.env.STREAM_KEY;
const GROUP = process.env.CONSUMER_GROUP || "poc";
const CONSUMER = process.env.CONSUMER_NAME || "worker-1";
const DELAY_ZSET = "integration:delayed";

function nowIso() {
  return new Date().toISOString();
}

function logEvent(eventId, level, message, data) {
  db.prepare(`
    INSERT INTO integration_event_logs (event_id, level, message, data_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(eventId, level, message, data ? JSON.stringify(data) : null, nowIso());
}

async function ensureGroup() {
  try {
    await redis.xgroup("CREATE", STREAM_KEY, GROUP, "$", "MKSTREAM");
  } catch (e) {
    const msg = String(e.message || e);
    if (!msg.includes("BUSYGROUP")) throw e;
  }
}

function computeBackoffMs(attempts) {
  const base = 5000;
  const cappedPow = Math.min(attempts, 6);
  return base * Math.pow(2, cappedPow);
}

function getEvent(id) {
  return db.prepare("SELECT * FROM integration_events WHERE id = ?").get(id);
}

function updateEventDone(id) {
  const ts = nowIso();
  db.prepare(`
    UPDATE integration_events
    SET status = ?, updated_at = ?, last_error = NULL
    WHERE id = ?
  `).run("done", ts, id);
}

function updateEventRetry(id, attempts, nextRunIso, errMsg) {
  const ts = nowIso();
  db.prepare(`
    UPDATE integration_events
    SET status = ?, attempts = ?, next_run_at = ?, last_error = ?, updated_at = ?
    WHERE id = ?
  `).run("retry", attempts, nextRunIso, errMsg, ts, id);
}

function updateEventFailed(id, attempts, errMsg) {
  const ts = nowIso();
  db.prepare(`
    UPDATE integration_events
    SET status = ?, attempts = ?, last_error = ?, updated_at = ?
    WHERE id = ?
  `).run("failed", attempts, errMsg, ts, id);
}

function upsertOrder(storeId, marketplace, externalOrderId, orderObj) {
  const ts = nowIso();
  db.prepare(`
    INSERT INTO marketplace_orders
      (store_id, marketplace, external_order_id, order_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(store_id, marketplace, external_order_id)
    DO UPDATE SET order_json = excluded.order_json, updated_at = excluded.updated_at
  `).run(storeId, marketplace, externalOrderId, JSON.stringify(orderObj), ts, ts);
}

async function processEvent(eventId) {
  const evt = getEvent(eventId);
  if (!evt) return;

  if (evt.status === "done") return;

  const dueAt = Date.parse(evt.next_run_at);
  if (Number.isFinite(dueAt) && dueAt > Date.now()) return;

  try {
    logEvent(eventId, "info", "Worker processing started", { entity_type: evt.entity_type, entity_id: evt.entity_id });

    if (evt.entity_type === "order") {
      const order = await fetchOrder(evt.entity_id);
      upsertOrder(evt.store_id, evt.marketplace, evt.entity_id, order);
      logEvent(eventId, "info", "Order fetched and saved", { order_id: evt.entity_id });
    } else {
      logEvent(eventId, "warn", "Unknown entity_type, processed as noop", { entity_type: evt.entity_type });
    }

    updateEventDone(eventId);
    logEvent(eventId, "info", "Worker processing done", {});
  } catch (e) {
    const errMsg = String(e.message || e);
    if (errMsg.includes("status code 403")) {
      updateEventDone(eventId);
      logEvent(eventId, "warn", "Order not accessible (403). Marked done for POC demo.", { error: errMsg });
      return;
    }
    const nextAttempts = (evt.attempts || 0) + 1;

    if (nextAttempts >= (evt.max_attempts || 8)) {
      updateEventFailed(eventId, nextAttempts, errMsg);
      logEvent(eventId, "error", "Max attempts reached, marked failed", { error: errMsg });
      return;
    }

    const backoffMs = computeBackoffMs(nextAttempts);
    const nextRunIso = new Date(Date.now() + backoffMs).toISOString();

    updateEventRetry(eventId, nextAttempts, nextRunIso, errMsg);
    logEvent(eventId, "error", "Worker error, scheduled retry", { error: errMsg, next_run_at: nextRunIso });
  }
}

async function main() {
  await ensureGroup();
  console.log("Worker up:", { STREAM_KEY, GROUP, CONSUMER });

  while (true) {
    try {
      const resp = await redis.xreadgroup(
        "GROUP", GROUP, CONSUMER,
        "COUNT", 10,
        "BLOCK", 5000,
        "STREAMS", STREAM_KEY,
        ">"
      );

      if (!resp) continue;

      const [, messages] = resp[0];
      for (const [msgId, kv] of messages) {
        let eventId = null;
        for (let i = 0; i < kv.length; i += 2) {
          if (kv[i] === "event_id") eventId = Number(kv[i + 1]);
        }

        try {
          if (eventId) await processEvent(eventId);
        } finally {
          await redis.xack(STREAM_KEY, GROUP, msgId);
        }
      }
    } catch (e) {
      console.error("Worker loop error:", e.message || e);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

main().catch(e => {
  console.error("Fatal:", e.message || e);
  process.exit(1);
});
