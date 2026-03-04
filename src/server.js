require("dotenv").config();
const express = require("express");
const { db } = require("./db");
const { redis } = require("./redis");
const { buildIdempotencyKey } = require("./idempotency");

const app = express();
app.use(express.json({ limit: "1mb" }));

function nowIso() {
  return new Date().toISOString();
}

function parseNotification(body) {
  const topic = String(body.topic || body.topic_id || "unknown");
  const resource = String(body.resource || body.resource_path || "");
  const action = String(body.action || "updated");

  let entityId = String(body.entity_id || "");
  if (!entityId && resource) {
    const parts = resource.split("/").filter(Boolean);
    entityId = parts[parts.length - 1] || "unknown";
  }

  const entityType = topic.includes("order") || topic.includes("orders") ? "order" : "unknown";
  return { topic, resource, action, entityId, entityType };
}

function logEvent(eventId, level, message, data) {
  db.prepare(`
    INSERT INTO integration_event_logs (event_id, level, message, data_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(eventId, level, message, data ? JSON.stringify(data) : null, nowIso());
}

app.get("/health", async (req, res) => {
  try {
    const ping = await redis.ping();
    db.prepare("SELECT 1 as ok").get();
    res.json({ ok: true, redis: ping, db: "ok" });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get("/events", (req, res) => {
  const status = req.query.status ? String(req.query.status) : null;
  const marketplace = req.query.marketplace ? String(req.query.marketplace) : null;

  const where = [];
  const params = {};

  if (status) { where.push("status = @status"); params.status = status; }
  if (marketplace) { where.push("marketplace = @marketplace"); params.marketplace = marketplace; }

  const sql = `
    SELECT id, store_id, marketplace, topic, action, entity_type, entity_id,
           status, attempts, next_run_at, last_error, created_at, updated_at
    FROM integration_events
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY id DESC
    LIMIT 200
  `;
  const rows = db.prepare(sql).all(params);
  res.json({ items: rows });
});

app.post("/events/:id/reprocess", async (req, res) => {
  const id = Number(req.params.id);
  const evt = db.prepare("SELECT * FROM integration_events WHERE id = ?").get(id);
  if (!evt) return res.status(404).json({ ok: false, error: "event not found" });

  const ts = new Date(Date.now() - 1000).toISOString(); db.prepare(`
    UPDATE integration_events
    SET status = ?, next_run_at = ?, updated_at = ?, last_error = NULL
    WHERE id = ?
  `).run("retry", ts, ts, id);

  logEvent(id, "info", "Manual reprocess requested", { by: "api" });

  await redis.xadd(process.env.STREAM_KEY, "*", "event_id", String(id));
  res.json({ ok: true, enqueued: true });
});

app.post("/webhook/ml", async (req, res) => {
  const storeId = process.env.STORE_ID || "demo_store_001";
  const n = parseNotification(req.body || {});

  const event = {
    store_id: storeId,
    marketplace: "mercado_livre",
    direction: "inbound",
    topic: n.topic,
    action: n.action,
    entity_type: n.entityType,
    entity_id: n.entityId,
    resource: n.resource,
    payload_json: JSON.stringify(req.body || {}),
    status: "queued",
    attempts: 0,
    max_attempts: 8,
    next_run_at: nowIso(),
    created_at: nowIso(),
    updated_at: nowIso()
  };

  event.idempotency_key = buildIdempotencyKey(event);

  try {
    const stmt = db.prepare(`
      INSERT INTO integration_events
      (store_id, marketplace, direction, topic, action, entity_type, entity_id,
       idempotency_key, payload_json, status, attempts, max_attempts, next_run_at,
       created_at, updated_at)
      VALUES
      (@store_id, @marketplace, @direction, @topic, @action, @entity_type, @entity_id,
       @idempotency_key, @payload_json, @status, @attempts, @max_attempts, @next_run_at,
       @created_at, @updated_at)
    `);

    const info = stmt.run(event);
    const eventId = info.lastInsertRowid;

    logEvent(eventId, "info", "Webhook received and queued", { topic: n.topic, resource: n.resource });

    await redis.xadd(process.env.STREAM_KEY, "*", "event_id", String(eventId));

    return res.status(200).json({ ok: true, queued: true, event_id: eventId });
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes("UNIQUE") && msg.includes("idempotency_key")) {
      return res.status(200).json({ ok: true, queued: false, deduped: true });
    }
    return res.status(500).json({ ok: false, error: msg });
  }
});

app.get("/events/:id/logs", (req, res) => {
  const id = Number(req.params.id);
  const rows = db.prepare(
    "SELECT id, level, message, data_json, created_at FROM integration_event_logs WHERE event_id = ? ORDER BY id ASC"
  ).all(id);

  res.json({ items: rows });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`HTTP server on :${port}`);
  console.log(`Health: ${process.env.PUBLIC_BASE_URL}/health`);
  console.log(`Events: ${process.env.PUBLIC_BASE_URL}/events`);
});
