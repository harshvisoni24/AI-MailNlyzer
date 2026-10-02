# pgvector Setup

AI-MailNlyzer uses PostgreSQL's `pgvector` extension for embeddings-based
semantic search (RAG, similar-case lookup, campaign similarity). The
platform is designed to **run without it** — if pgvector isn't enabled, the
AI service automatically falls back to keyword-based retrieval and clearly
labels results as such (see `ai-service/app/rag/retrieval.py`).

## Enabling pgvector

### Option A: Debian/Ubuntu (PostgreSQL 15/16)

```bash
sudo apt-get install postgresql-16-pgvector
```

### Option B: Docker

Use the `pgvector/pgvector` image instead of plain `postgres`, e.g.:

```yaml
image: pgvector/pgvector:pg16
```

### Option C: Managed cloud Postgres (Supabase, Neon, RDS, etc.)

Most managed providers let you enable it with a single SQL command (Step 2
below) once the extension binary is available on the instance — check your
provider's documentation if the `CREATE EXTENSION` command fails.

## Enable the extension in your database

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Run this against the same database referenced by `DATABASE_URL`.

## Adding a native vector column

Prisma does not natively model the `vector` type, so the `Embedding` table
defined in `schema.prisma` stores a `Float[]` shadow column. To add a true
`vector` column for fast ANN search, run this raw SQL migration after your
initial Prisma migration:

```sql
ALTER TABLE "Embedding" ADD COLUMN embedding_vec vector(1536);
CREATE INDEX embedding_vec_idx ON "Embedding" USING ivfflat (embedding_vec vector_cosine_ops) WITH (lists = 100);
```

(Adjust `1536` to match whatever embedding model dimension you choose to
integrate — e.g. via Gemini's embedding API.)

## Verifying it's enabled

The AI service probes for pgvector automatically on each RAG request:

```python
SELECT 1 FROM pg_extension WHERE extname = 'vector';
```

If this query fails or returns no rows, the app logs and returns
`"mode": "KEYWORD_FALLBACK"` in RAG responses instead of crashing.
