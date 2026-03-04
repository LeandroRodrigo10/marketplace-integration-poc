# ML POC Integrator

POC de um módulo integrador para marketplaces, simulando o núcleo arquitetural de um ERP com integração bidirecional.

## Objetivo da POC

Demonstrar domínio técnico sobre:

- Webhooks
- Fila com Redis Streams
- Worker desacoplado
- Idempotência
- Retry com backoff
- Persistência e auditoria
- Reprocessamento manual

## Arquitetura

Webhook (HTTP)
→ Persistência do evento (SQLite)
→ Enfileiramento no Redis Streams
→ Worker (consumer group)
→ Processamento
→ Logs e status final

## Componentes

- Express (HTTP Server)
- Redis Streams (Fila)
- Worker separado
- SQLite (Persistência)
- Endpoint de auditoria e reprocesso

## Endpoints

GET /health  
GET /events  
GET /events/:id/logs  
POST /webhook/ml  
POST /events/:id/reprocess  

## Conceitos aplicados

- Idempotency key por evento
- Retry controlado com limite de tentativas
- Backoff exponencial
- Separação entre entrada HTTP e processamento pesado
- Consumer Group no Redis
- Persistência do estado do evento

## Como executar

1. Subir Redis
2. Rodar migrations
3. Subir servidor
4. Subir worker
5. Testar webhook

---

Esta POC representa apenas o núcleo arquitetural.
Não integra com ERP real.