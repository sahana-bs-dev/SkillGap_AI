// api/uploadApi.js
// Talks to the Phase 2 backend endpoint that parses the resume (and JD, if
// present) into plain text. Analysis (ATS / matching) is a Phase 3 concern —
// this call only needs to come back with clean parsed text.

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

/**
 * @param {Object} params
 * @param {File|null} params.resumeFile   - attached PDF/DOCX, or null if pasted text was used
 * @param {string} params.resumeText      - pasted resume text, or "" if a file was used
 * @param {string} params.jdText          - job description text, or "" in resume-only mode
 * @returns {Promise<{ resumeText: string, jdText?: string }>}
 */
export async function uploadForAnalysis({ resumeFile, resumeText, jdText }) {
  const formData = new FormData();

  if (resumeFile) {
    formData.append("resume_file", resumeFile);
  } else {
    formData.append("resume_text", resumeText);
  }

  if (jdText) {
    formData.append("jd_text", jdText);
  }

  const response = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    body: formData,
    // Auth header goes here once this page is wired up behind login (Phase 1 JWT).
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail || "Upload failed. Check the file and try again.");
  }

  return response.json();
}