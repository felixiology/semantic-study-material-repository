-- =====================================================================
-- Test cases for the Semantic Study Material Repository (PostgreSQL)
--
-- HOW TO RUN: paste this whole file into the Neon SQL Editor and click Run.
-- A notice appears with one line per test (PASS or FAIL) and a total.
-- If the notice is hard to read, zoom out or run it again and screenshot it.
--
-- SAFE TO RUN ANY TIME: every test that writes data is rolled back, so no
-- rows are left behind. (Auto-increment counters do skip a few numbers,
-- which is harmless.) Tests T12-T15 only read the existing sample data
-- and assume schema.sql was run unchanged.
-- =====================================================================
DO $test$
DECLARE
    report  TEXT := '';
    v_id    INT;
    v_count INT;
    v_pass  INT;
BEGIN

    -- T1: duplicate title in the same course is rejected (UNIQUE)
    BEGIN
        INSERT INTO documents(course_id, uploaded_by, title, file_type)
        VALUES (1, 2, 'Sorting Algorithms Notes', 'pdf');
        report := report || E'T1  FAIL: duplicate title was accepted\n';
        RAISE EXCEPTION USING MESSAGE = 'rollback', ERRCODE = '99999';
    EXCEPTION
        WHEN unique_violation THEN report := report || E'T1  PASS: duplicate title rejected (UNIQUE)\n';
        WHEN SQLSTATE '99999' THEN NULL;
        WHEN OTHERS THEN report := report || E'T1  FAIL: unexpected error: ' || SQLERRM || E'\n';
    END;

    -- T2: malformed email is rejected (CHECK)
    BEGIN
        INSERT INTO users(name, email, password_hash, role)
        VALUES ('T2 User', 'bad-email', 'x', 'student');
        report := report || E'T2  FAIL: bad email was accepted\n';
        RAISE EXCEPTION USING MESSAGE = 'rollback', ERRCODE = '99999';
    EXCEPTION
        WHEN check_violation THEN report := report || E'T2  PASS: malformed email rejected (CHECK)\n';
        WHEN SQLSTATE '99999' THEN NULL;
        WHEN OTHERS THEN report := report || E'T2  FAIL: unexpected error: ' || SQLERRM || E'\n';
    END;

    -- T3: unknown role is rejected (CHECK)
    BEGIN
        INSERT INTO users(name, email, password_hash, role)
        VALUES ('T3 User', 't3@pes.edu', 'x', 'hacker');
        report := report || E'T3  FAIL: invalid role was accepted\n';
        RAISE EXCEPTION USING MESSAGE = 'rollback', ERRCODE = '99999';
    EXCEPTION
        WHEN check_violation THEN report := report || E'T3  PASS: invalid role rejected (CHECK)\n';
        WHEN SQLSTATE '99999' THEN NULL;
        WHEN OTHERS THEN report := report || E'T3  FAIL: unexpected error: ' || SQLERRM || E'\n';
    END;

    -- T4: unsupported file type is rejected (CHECK)
    BEGIN
        INSERT INTO documents(course_id, uploaded_by, title, file_type)
        VALUES (1, 2, 'T4 Doc', 'exe');
        report := report || E'T4  FAIL: invalid file type was accepted\n';
        RAISE EXCEPTION USING MESSAGE = 'rollback', ERRCODE = '99999';
    EXCEPTION
        WHEN check_violation THEN report := report || E'T4  PASS: invalid file type rejected (CHECK)\n';
        WHEN SQLSTATE '99999' THEN NULL;
        WHEN OTHERS THEN report := report || E'T4  FAIL: unexpected error: ' || SQLERRM || E'\n';
    END;

    -- T5: document for a course that does not exist is rejected (FOREIGN KEY)
    BEGIN
        INSERT INTO documents(course_id, uploaded_by, title, file_type)
        VALUES (9999, 2, 'T5 Doc', 'pdf');
        report := report || E'T5  FAIL: nonexistent course was accepted\n';
        RAISE EXCEPTION USING MESSAGE = 'rollback', ERRCODE = '99999';
    EXCEPTION
        WHEN foreign_key_violation THEN report := report || E'T5  PASS: nonexistent course rejected (FOREIGN KEY)\n';
        WHEN SQLSTATE '99999' THEN NULL;
        WHEN OTHERS THEN report := report || E'T5  FAIL: unexpected error: ' || SQLERRM || E'\n';
    END;

    -- T6: negative chunk_count is rejected (CHECK)
    BEGIN
        INSERT INTO documents(course_id, uploaded_by, title, file_type, chunk_count)
        VALUES (1, 2, 'T6 Doc', 'pdf', -1);
        report := report || E'T6  FAIL: negative chunk_count was accepted\n';
        RAISE EXCEPTION USING MESSAGE = 'rollback', ERRCODE = '99999';
    EXCEPTION
        WHEN check_violation THEN report := report || E'T6  PASS: negative chunk_count rejected (CHECK)\n';
        WHEN SQLSTATE '99999' THEN NULL;
        WHEN OTHERS THEN report := report || E'T6  FAIL: unexpected error: ' || SQLERRM || E'\n';
    END;

    -- T7: blank chunk text is rejected (CHECK)
    BEGIN
        INSERT INTO document_chunks(doc_id, chunk_index, content)
        VALUES ((SELECT MIN(doc_id) FROM documents), 999, '   ');
        report := report || E'T7  FAIL: blank chunk was accepted\n';
        RAISE EXCEPTION USING MESSAGE = 'rollback', ERRCODE = '99999';
    EXCEPTION
        WHEN check_violation THEN report := report || E'T7  PASS: blank chunk text rejected (CHECK)\n';
        WHEN SQLSTATE '99999' THEN NULL;
        WHEN OTHERS THEN report := report || E'T7  FAIL: unexpected error: ' || SQLERRM || E'\n';
    END;

    -- T8: a failed upload is rolled back completely (transaction / atomicity)
    BEGIN
        PERFORM upload_document(1, 2, 'T8 Atomic Doc', 'pdf', ARRAY['valid text', '   ']);
        report := report || E'T8  FAIL: upload with a blank chunk succeeded\n';
        RAISE EXCEPTION USING MESSAGE = 'rollback', ERRCODE = '99999';
    EXCEPTION
        WHEN check_violation THEN
            IF EXISTS (SELECT 1 FROM documents WHERE title = 'T8 Atomic Doc') THEN
                report := report || E'T8  FAIL: document row survived the failed upload\n';
            ELSE
                report := report || E'T8  PASS: failed upload left nothing behind (atomic)\n';
            END IF;
        WHEN SQLSTATE '99999' THEN NULL;
        WHEN OTHERS THEN report := report || E'T8  FAIL: unexpected error: ' || SQLERRM || E'\n';
    END;

    -- T9: trigger keeps documents.chunk_count in sync
    BEGIN
        v_id := upload_document(1, 2, 'T9 Trigger Doc', 'txt', ARRAY['first chunk', 'second chunk']);
        SELECT chunk_count INTO v_count FROM documents WHERE doc_id = v_id;
        IF v_count = 2 THEN
            report := report || E'T9  PASS: trigger set chunk_count to 2\n';
        ELSE
            report := report || E'T9  FAIL: chunk_count is ' || v_count || E', expected 2\n';
        END IF;
        RAISE EXCEPTION USING MESSAGE = 'rollback', ERRCODE = '99999';
    EXCEPTION
        WHEN SQLSTATE '99999' THEN NULL;
        WHEN OTHERS THEN report := report || E'T9  FAIL: unexpected error: ' || SQLERRM || E'\n';
    END;

    -- T10: audit trigger logs an INSERT and a DELETE
    BEGIN
        v_id := upload_document(1, 2, 'T10 Audit Doc', 'txt', ARRAY['audit chunk']);
        DELETE FROM documents WHERE doc_id = v_id;
        SELECT COUNT(*) INTO v_count FROM document_audit WHERE title = 'T10 Audit Doc';
        IF v_count = 2 THEN
            report := report || E'T10 PASS: audit trigger logged INSERT and DELETE\n';
        ELSE
            report := report || E'T10 FAIL: found ' || v_count || E' audit rows, expected 2\n';
        END IF;
        RAISE EXCEPTION USING MESSAGE = 'rollback', ERRCODE = '99999';
    EXCEPTION
        WHEN SQLSTATE '99999' THEN NULL;
        WHEN OTHERS THEN report := report || E'T10 FAIL: unexpected error: ' || SQLERRM || E'\n';
    END;

    -- T11: deleting a document also deletes its chunks (ON DELETE CASCADE)
    BEGIN
        v_id := upload_document(1, 2, 'T11 Cascade Doc', 'txt', ARRAY['chunk one', 'chunk two']);
        DELETE FROM documents WHERE doc_id = v_id;
        SELECT COUNT(*) INTO v_count FROM document_chunks WHERE doc_id = v_id;
        IF v_count = 0 THEN
            report := report || E'T11 PASS: chunks deleted with their document (CASCADE)\n';
        ELSE
            report := report || E'T11 FAIL: ' || v_count || E' orphan chunks remain\n';
        END IF;
        RAISE EXCEPTION USING MESSAGE = 'rollback', ERRCODE = '99999';
    EXCEPTION
        WHEN SQLSTATE '99999' THEN NULL;
        WHEN OTHERS THEN report := report || E'T11 FAIL: unexpected error: ' || SQLERRM || E'\n';
    END;

    -- T12: no password is stored in plain text (all are bcrypt hashes, which start with $2)
    SELECT COUNT(*) INTO v_count FROM users WHERE password_hash NOT LIKE '$2%';
    IF v_count = 0 THEN
        report := report || E'T12 PASS: all passwords are bcrypt hashes\n';
    ELSE
        report := report || E'T12 FAIL: ' || v_count || E' users have a non-bcrypt password\n';
    END IF;

    -- T13: full-text search finds the transactions chunk in the DBMS course
    SELECT COUNT(*) INTO v_count FROM search_chunks_fulltext('transaction rollback', 3);
    IF v_count >= 1 THEN
        report := report || E'T13 PASS: full-text search returned ' || v_count || E' result(s)\n';
    ELSE
        report := report || E'T13 FAIL: full-text search returned nothing\n';
    END IF;

    -- T14: embeddings exist and are all 384-dimensional (pgvector)
    SELECT COUNT(*) INTO v_count FROM document_chunks
    WHERE embedding IS NOT NULL AND vector_dims(embedding) <> 384;
    IF v_count = 0 AND EXISTS (SELECT 1 FROM document_chunks WHERE embedding IS NOT NULL) THEN
        report := report || E'T14 PASS: stored embeddings are 384-dimensional\n';
    ELSE
        report := report || E'T14 FAIL: missing embeddings or wrong dimension\n';
    END IF;

    -- T15: a student only has the courses they are enrolled in (role-based data)
    SELECT COUNT(*) INTO v_count FROM enrollments e
    JOIN users u ON u.user_id = e.student_id WHERE u.email = 'poorvi@pes.edu';
    IF v_count = 3 THEN
        report := report || E'T15 PASS: sample student is enrolled in exactly 3 courses\n';
    ELSE
        report := report || E'T15 FAIL: sample student has ' || v_count || E' enrollments, expected 3\n';
    END IF;

    v_pass := (length(report) - length(replace(report, 'PASS', ''))) / 4;
    RAISE NOTICE E'TEST RESULTS\n%\n% of 15 tests passed', report, v_pass;
END
$test$;
