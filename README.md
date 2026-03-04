# Marketplace Integration Core (POC)

Event-driven marketplace integration prototype designed to demonstrate the architectural core of an ERP integration module.

This project simulates how an ERP can integrate with marketplaces such as Mercado Livre using a resilient event-driven architecture.

## Key Concepts Demonstrated

• Webhook ingestion  
• Idempotent event processing  
• Redis Streams queue  
• Worker-based processing  
• Retry with backoff  
• Event audit logs  
• Manual event reprocessing

## Architecture Overview

Webhook → Event Persistence → Redis Streams → Worker → Marketplace API → Event Logs

Key architectural decisions:

• Webhook performs no heavy processing  
• Events are persisted before queueing  
• Redis Streams ensures reliable delivery  
• Worker processes events asynchronously  
• Retry and backoff mechanisms prevent event loss  
• All events are auditable and reprocessable  

## Endpoints

GET /health  
GET /events  
GET /events/:id/logs  
POST /webhook/ml  
POST /events/:id/reprocess  

## Running Locally

1. Install dependencies

npm install

2. Start Redis

docker run --name redis-poc -p 6379:6379 -d redis:7

3. Run migrations

node src/migrate.js

4. Start the HTTP server

node src/server.js

5. Start the worker

node src/worker.js

## Notes

This project represents the architectural core of a marketplace integration module.

It is a proof of concept and does not integrate with a real ERP system.