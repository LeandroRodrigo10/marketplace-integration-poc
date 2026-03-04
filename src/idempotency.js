const crypto = require("crypto");

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function buildIdempotencyKey(evt) {
  const base = [
    evt.store_id,
    evt.marketplace,
    evt.topic,
    evt.action,
    evt.entity_type,
    evt.entity_id,
    evt.resource || ""
  ].join("|");
  return sha256(base);
}

module.exports = { buildIdempotencyKey };
