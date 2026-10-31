-- =====================================================================
-- Report and demo queries. Run them one at a time in the Neon SQL Editor
-- (select one query, then click Run).
-- =====================================================================

-- REPORT 1: Documents and chunks per course  (JOIN, GROUP BY, ORDER BY, aggregates)
SELECT c.code, c.name,
       COUNT(d.doc_id)  AS documents,
       SUM(d.chunk_count) AS chunks
FROM courses c
LEFT JOIN documents d ON d.course_id = c.course_id
GROUP BY c.code, c.name
ORDER BY documents DESC;

-- REPORT 2: Faculty ranked by uploads  (JOIN, GROUP BY, ORDER BY)
SELECT u.name AS faculty, COUNT(d.doc_id) AS uploads
FROM users u
JOIN documents d ON d.uploaded_by = u.user_id
WHERE u.role = 'faculty'
GROUP BY u.name
ORDER BY uploads DESC;

-- REPORT 3: Courses with at least 2 documents  (HAVING)
SELECT c.code, COUNT(d.doc_id) AS documents
FROM courses c
JOIN documents d ON d.course_id = c.course_id
GROUP BY c.code
HAVING COUNT(d.doc_id) >= 2;

-- REPORT 4: Documents with more chunks than the average  (subquery)
SELECT title, chunk_count
FROM documents
WHERE chunk_count > (SELECT AVG(chunk_count) FROM documents)
ORDER BY chunk_count DESC;

-- REPORT 5: Students and number of courses they are enrolled in  (JOIN, GROUP BY)
SELECT u.name AS student, COUNT(e.course_id) AS courses_enrolled
FROM users u
LEFT JOIN enrollments e ON e.student_id = u.user_id
WHERE u.role = 'student'
GROUP BY u.name
ORDER BY courses_enrolled DESC;

-- REPORT 6: Most bookmarked chunks  (multi-table JOIN)
SELECT d.title, ch.page_no, LEFT(ch.content, 70) AS preview, COUNT(*) AS bookmarks
FROM bookmarks b
JOIN document_chunks ch ON ch.chunk_id = b.chunk_id
JOIN documents d        ON d.doc_id = ch.doc_id
GROUP BY d.title, ch.page_no, ch.content
ORDER BY bookmarks DESC;

-- ---------------------------------------------------------------------
-- ADVANCED FEATURES DEMO
-- ---------------------------------------------------------------------

-- Full-text search (GIN index): search inside DBMS course (course_id = 3)
SELECT * FROM search_chunks_fulltext('transaction rollback', 3);

-- View
SELECT * FROM course_material_summary;

-- Trigger demo: chunk_count is maintained automatically
SELECT doc_id, title, chunk_count FROM documents;

-- Trigger demo: audit log (delete a doc, then look at the audit table)
DELETE FROM documents WHERE title = 'Process Scheduling';
SELECT * FROM document_audit ORDER BY audit_id;

-- Transaction / atomicity demo: this MUST fail and leave nothing behind,
-- because the second chunk is empty and violates the CHECK constraint.
SELECT upload_document(1, 2, 'Broken Upload', 'pdf', ARRAY['valid text', '   ']);
SELECT * FROM documents WHERE title = 'Broken Upload';   -- returns 0 rows (rolled back)

-- Explicit transaction demo
BEGIN;
UPDATE documents SET status = 'failed' WHERE doc_id = 1;
ROLLBACK;
SELECT status FROM documents WHERE doc_id = 1;           -- still 'ready'

-- Constraint demos (each of these should be rejected by the database)
-- INSERT INTO users(name,email,password_hash,role) VALUES ('X','bad-email','h','student');
-- INSERT INTO users(name,email,password_hash,role) VALUES ('X','x@y.com','h','hacker');
-- INSERT INTO documents(course_id,uploaded_by,title,file_type) VALUES (1,2,'Sorting Algorithms Notes','pdf');

-- Vector search (works once the embedding column is filled; $1 is the query vector)
-- SELECT chunk_id, content, 1 - (embedding <=> $1) AS similarity
-- FROM document_chunks WHERE embedding IS NOT NULL
-- ORDER BY embedding <=> $1 LIMIT 5;
