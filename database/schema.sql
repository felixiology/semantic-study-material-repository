-- =====================================================================
-- Semantic Study Material Repository  |  PostgreSQL (Neon) schema
-- Run this whole file once in the Neon SQL Editor.
-- Sample login password for every sample user: password123
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector (semantic search)
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- bcrypt hashing for sample users

-- ---------------------------------------------------------------------
-- 0. Clean slate (DROP) so the script can be re-run safely
-- ---------------------------------------------------------------------
DROP VIEW  IF EXISTS course_material_summary;
DROP TABLE IF EXISTS bookmarks, document_chunks, enrollments, documents,
                     courses, document_audit, users CASCADE;

-- ---------------------------------------------------------------------
-- 1. DDL: CREATE TABLE (PKs, FKs, constraints)
-- ---------------------------------------------------------------------
CREATE TABLE users (
    user_id        SERIAL PRIMARY KEY,
    name           VARCHAR(100) NOT NULL,
    email          VARCHAR(150) NOT NULL UNIQUE
                   CHECK (email LIKE '%_@_%._%'),
    password_hash  TEXT NOT NULL,
    role           VARCHAR(10) NOT NULL
                   CHECK (role IN ('admin', 'faculty', 'student')),
    created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE courses (
    course_id   SERIAL PRIMARY KEY,
    code        VARCHAR(20)  NOT NULL UNIQUE,
    name        VARCHAR(150) NOT NULL,
    faculty_id  INT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT
);

CREATE TABLE enrollments (
    student_id   INT NOT NULL REFERENCES users(user_id)     ON DELETE CASCADE,
    course_id    INT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    enrolled_on  DATE NOT NULL DEFAULT CURRENT_DATE,
    PRIMARY KEY (student_id, course_id)
);

CREATE TABLE documents (
    doc_id       SERIAL PRIMARY KEY,
    course_id    INT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    uploaded_by  INT NOT NULL REFERENCES users(user_id)     ON DELETE RESTRICT,
    title        VARCHAR(200) NOT NULL,
    file_type    VARCHAR(10)  NOT NULL CHECK (file_type IN ('pdf', 'docx', 'txt')),
    status       VARCHAR(12)  NOT NULL DEFAULT 'processing'
                 CHECK (status IN ('processing', 'ready', 'failed')),
    chunk_count  INT NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
    upload_date  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (course_id, title)            -- no duplicate uploads in a course
);

CREATE TABLE document_chunks (
    chunk_id     SERIAL PRIMARY KEY,
    doc_id       INT NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
    chunk_index  INT NOT NULL CHECK (chunk_index >= 0),
    page_no      INT CHECK (page_no > 0),
    content      TEXT NOT NULL CHECK (length(trim(content)) > 0),
    embedding    vector(384),            -- filled by the embedding step
    content_tsv  tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
    UNIQUE (doc_id, chunk_index)
);

CREATE TABLE bookmarks (
    user_id     INT NOT NULL REFERENCES users(user_id)           ON DELETE CASCADE,
    chunk_id    INT NOT NULL REFERENCES document_chunks(chunk_id) ON DELETE CASCADE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, chunk_id)
);

-- No foreign key on purpose: audit rows must survive after a document is deleted
CREATE TABLE document_audit (
    audit_id      SERIAL PRIMARY KEY,
    doc_id        INT,
    title         VARCHAR(200),
    action        VARCHAR(10) NOT NULL CHECK (action IN ('INSERT', 'DELETE')),
    performed_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 2. DDL: ALTER and indexes
-- ---------------------------------------------------------------------
ALTER TABLE users ADD COLUMN last_login TIMESTAMP;
ALTER TABLE documents ADD COLUMN description TEXT;

CREATE INDEX idx_documents_course   ON documents(course_id);
CREATE INDEX idx_documents_uploaded ON documents(upload_date);
CREATE INDEX idx_chunks_doc         ON document_chunks(doc_id);
CREATE INDEX idx_chunks_fts         ON document_chunks USING GIN (content_tsv);       -- full-text search
CREATE INDEX idx_chunks_embedding   ON document_chunks USING hnsw (embedding vector_cosine_ops); -- vector search

-- DROP example (a throwaway index, just to demonstrate DROP)
CREATE INDEX idx_temp_demo ON users(name);
DROP INDEX idx_temp_demo;

-- ---------------------------------------------------------------------
-- 3. VIEW
-- ---------------------------------------------------------------------
CREATE VIEW course_material_summary AS
SELECT c.course_id,
       c.code,
       c.name                      AS course_name,
       u.name                      AS faculty_name,
       COUNT(DISTINCT d.doc_id)    AS total_documents,
       COALESCE(SUM(d.chunk_count), 0) AS total_chunks,
       MAX(d.upload_date)          AS last_upload
FROM courses c
JOIN users u ON u.user_id = c.faculty_id
LEFT JOIN documents d ON d.course_id = c.course_id
GROUP BY c.course_id, c.code, c.name, u.name;

-- ---------------------------------------------------------------------
-- 4. TRIGGERS
-- ---------------------------------------------------------------------
-- Trigger 1: keep documents.chunk_count in sync with document_chunks
CREATE OR REPLACE FUNCTION trg_update_chunk_count() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE documents SET chunk_count = chunk_count + 1 WHERE doc_id = NEW.doc_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE documents SET chunk_count = GREATEST(chunk_count - 1, 0) WHERE doc_id = OLD.doc_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chunk_count_sync
AFTER INSERT OR DELETE ON document_chunks
FOR EACH ROW EXECUTE FUNCTION trg_update_chunk_count();

-- Trigger 2: audit log of uploads and deletions
CREATE OR REPLACE FUNCTION trg_audit_documents() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO document_audit(doc_id, title, action) VALUES (NEW.doc_id, NEW.title, 'INSERT');
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO document_audit(doc_id, title, action) VALUES (OLD.doc_id, OLD.title, 'DELETE');
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER documents_audit
AFTER INSERT OR DELETE ON documents
FOR EACH ROW EXECUTE FUNCTION trg_audit_documents();

-- ---------------------------------------------------------------------
-- 5. STORED FUNCTIONS
-- ---------------------------------------------------------------------
-- Upload a document and all its chunks atomically.
-- A function runs as ONE transaction: if any chunk fails (bad data, duplicate,
-- constraint violation), the document row and all chunks roll back together.
CREATE OR REPLACE FUNCTION upload_document(
    p_course_id INT, p_user_id INT, p_title VARCHAR, p_file_type VARCHAR, p_chunks TEXT[]
) RETURNS INT AS $$
DECLARE
    v_doc_id INT;
    i INT;
BEGIN
    INSERT INTO documents(course_id, uploaded_by, title, file_type)
    VALUES (p_course_id, p_user_id, p_title, p_file_type)
    RETURNING doc_id INTO v_doc_id;

    FOR i IN 1 .. COALESCE(array_length(p_chunks, 1), 0) LOOP
        INSERT INTO document_chunks(doc_id, chunk_index, page_no, content)
        VALUES (v_doc_id, i - 1, i, p_chunks[i]);
    END LOOP;

    UPDATE documents SET status = 'ready' WHERE doc_id = v_doc_id;
    RETURN v_doc_id;
END;
$$ LANGUAGE plpgsql;

-- Full-text search inside one course (keyword search; vector search runs from the app)
CREATE OR REPLACE FUNCTION search_chunks_fulltext(p_query TEXT, p_course_id INT)
RETURNS TABLE (chunk_id INT, doc_title VARCHAR, page_no INT, content TEXT, rank REAL) AS $$
    SELECT ch.chunk_id, d.title, ch.page_no, ch.content,
           ts_rank(ch.content_tsv, websearch_to_tsquery('english', p_query))
    FROM document_chunks ch
    JOIN documents d ON d.doc_id = ch.doc_id
    WHERE d.course_id = p_course_id
      AND ch.content_tsv @@ websearch_to_tsquery('english', p_query)
    ORDER BY 5 DESC;
$$ LANGUAGE sql;

-- ---------------------------------------------------------------------
-- 6. SAMPLE DATA (DML: INSERT)
-- ---------------------------------------------------------------------
INSERT INTO users (name, email, password_hash, role) VALUES
 ('Admin User',   'admin@pes.edu',   crypt('password123', gen_salt('bf')), 'admin'),
 ('Dr. Rao',      'rao@pes.edu',     crypt('password123', gen_salt('bf')), 'faculty'),
 ('Dr. Iyer',     'iyer@pes.edu',    crypt('password123', gen_salt('bf')), 'faculty'),
 ('Poorvi',       'poorvi@pes.edu',  crypt('password123', gen_salt('bf')), 'student'),
 ('Teammate',     'mate@pes.edu',    crypt('password123', gen_salt('bf')), 'student'),
 ('Aarav',        'aarav@pes.edu',   crypt('password123', gen_salt('bf')), 'student');

INSERT INTO courses (code, name, faculty_id) VALUES
 ('CS201', 'Data Structures and Algorithms', 2),
 ('CS301', 'Operating Systems',              3),
 ('CS305', 'Database Management Systems',    2);

INSERT INTO enrollments (student_id, course_id) VALUES
 (4,1),(4,2),(4,3),(5,1),(5,3),(6,2),(6,3);

SELECT upload_document(1, 2, 'Sorting Algorithms Notes', 'pdf', ARRAY[
  'Merge sort divides the array into halves, sorts each half recursively and merges them. Its time complexity is O(n log n) in the best, average and worst cases.',
  'Quick sort picks a pivot and partitions the array around it. The average time complexity is O(n log n) but the worst case is O(n^2) when the pivot is poorly chosen.',
  'Space complexity measures the extra memory an algorithm needs. Merge sort needs O(n) auxiliary space while heap sort sorts in place with O(1) extra space.'
]);

SELECT upload_document(1, 2, 'Trees and Graphs', 'pdf', ARRAY[
  'A binary search tree keeps smaller keys in the left subtree and larger keys in the right subtree. Search, insert and delete take O(h) time where h is the height.',
  'Breadth first search explores a graph level by level using a queue. Depth first search goes as deep as possible using a stack or recursion.'
]);

SELECT upload_document(2, 3, 'Memory Management', 'pdf', ARRAY[
  'Paging divides physical memory into fixed size frames and logical memory into pages. The page table maps each page to a frame and removes external fragmentation.',
  'Virtual memory lets a process run even if it is not fully in main memory. A page fault occurs when a needed page is not present and the OS must load it from disk.',
  'Page replacement algorithms such as FIFO, LRU and Optimal decide which page to evict when no free frame is available. LRU approximates optimal behaviour.'
]);

SELECT upload_document(2, 3, 'Process Scheduling', 'docx', ARRAY[
  'Round robin scheduling gives each process a fixed time quantum. A very large quantum makes it behave like FCFS, while a very small quantum increases context switch overhead.',
  'Deadlock requires four conditions: mutual exclusion, hold and wait, no preemption and circular wait. Breaking any one of them prevents deadlock.'
]);

SELECT upload_document(3, 2, 'Normalization and Transactions', 'pdf', ARRAY[
  'Normalization removes redundancy. A relation is in 3NF if every non-key attribute depends only on the key. BCNF is a stricter form of 3NF.',
  'A transaction is a unit of work with ACID properties: atomicity, consistency, isolation and durability. A rollback undoes all changes made by the transaction.',
  'Indexes speed up lookups by avoiding full table scans. A B-tree index supports range queries, while a hash index supports only equality.'
]);

INSERT INTO bookmarks (user_id, chunk_id) VALUES (4,1),(4,6),(5,1),(6,6);

-- ---------------------------------------------------------------------
-- 7. QUICK CHECKS (results of the last SELECT show in Neon)
-- ---------------------------------------------------------------------
SELECT * FROM course_material_summary;
