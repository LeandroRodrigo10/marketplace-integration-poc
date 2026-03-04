const axios = require("axios");
require("dotenv").config();

const ML_API_BASE = process.env.ML_API_BASE || "https://api.mercadolibre.com";

async function fetchOrder(orderId) {
  const token = process.env.ML_ACCESS_TOKEN;
  if (!token) {
    throw new Error("ML_ACCESS_TOKEN vazio. Preencha no .env para buscar pedido real.");
  }

  const url = `${ML_API_BASE}/orders/${encodeURIComponent(orderId)}`;
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000
  });
  return res.data;
}

module.exports = { fetchOrder };
