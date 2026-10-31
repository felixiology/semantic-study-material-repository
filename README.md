# Semantic Study Material Repository

DBMS Level 3 Project, PES University.
Team: Poorvi Rangaswamy (PES1UG24AM193), Rhea Menon (PES1UG24AM222)

A web app where faculty upload course notes and students search them. Notes are split into chunks and stored in PostgreSQL. Every search is logged to MongoDB, and an aggregation report shows faculty which topics students could not find.

## Tech stack
- Frontend and API: Next.js (App Router, TypeScript, Tailwind)
- SQL: PostgreSQL on Neon (pgvector extension enabled)
- NoSQL: MongoDB Atlas
- Auth: bcrypt password hashes, JWT in an httpOnly cookie, roles: admin, faculty, student

## Database design
- PostgreSQL (7 tables): users, courses, enrollments, documents, document_chunks, bookmarks, document_audit
- MongoDB: `search_logs` collection (flexible, write-heavy search events)
- ER diagram: `docs/er-diagram.png` (source: `docs/er-diagram.dbml`)
- Advanced features: transaction (`upload_document()`), triggers (chunk count sync, audit log), view (`course_material_summary`), full-text search (GIN index on tsvector), MongoDB aggregation pipelines
- Vector search: the `embedding vector(384)` column and HNSW index are in the schema; generating embeddings is planned future work

## Setup
1. Create a free PostgreSQL project on neon.tech and a free cluster on MongoDB Atlas (allow network access from 0.0.0.0/0).
2. In the Neon SQL Editor, run `database/schema.sql` (creates tables, triggers, view, functions and sample data).
3. Create `webapp/.env.local` using `.env.example` as a template.
4. Run:
   ```
   cd webapp
   npm install
   npm run dev
   ```
5. Open http://localhost:3000

## Demo accounts (password: password123)
- admin@pes.edu (admin)
- rao@pes.edu (faculty)
- poorvi@pes.edu (student)

## Project structure
- `database/schema.sql`: DDL, constraints, indexes, view, triggers, functions, sample data
- `database/reports.sql`: report queries and advanced-feature demos
- `webapp/app/api`: backend route handlers (auth, courses, documents, search, reports)
- `webapp/lib`: database, MongoDB, auth and chunking helpers
- `docs/`: ER diagram
