import { useState, useRef } from "react";
import { uploadForAnalysis } from "../../api/uploadApi";
import "./Upload.css";
import Sidebar from "../../components/Layout/Sidebar"; // adjust path to wherever you save it
import "../../components/Layout/Sidebar.css";

const ACCEPTED_TYPES = [".pdf", ".docx"];

export default function UploadPage() {
  const [mode, setMode] = useState("both"); // "resume" | "both"
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeText, setResumeText] = useState("");
  const [jdText, setJdText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [parsedPreview, setParsedPreview] = useState(null);

  const fileInputRef = useRef(null);

  function handleModeChange(next) {
    setMode(next);
    setError("");
  }

  function handleFileChosen(file) {
    if (!file) return;
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (!ACCEPTED_TYPES.includes(ext)) {
      setError("Please attach a PDF or DOCX file.");
      return;
    }
    setResumeFile(file);
    setResumeText(""); // file and pasted text are mutually exclusive
    setError("");
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    handleFileChosen(e.dataTransfer.files?.[0]);
  }

  function handleResumeTextChange(value) {
    setResumeText(value);
    if (value.trim()) setResumeFile(null); // pasted text and file are mutually exclusive
  }

  function validate() {
    if (!resumeFile && !resumeText.trim()) {
      return "Attach a resume file or paste your resume text.";
    }
    if (mode === "both" && !jdText.trim()) {
      return "Paste a job description, or switch to Resume only.";
    }
    return "";
  }

  async function handleSubmit() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setIsSubmitting(true);
    setParsedPreview(null);

    try {
      const result = await uploadForAnalysis({
        resumeFile,
        resumeText,
        jdText: mode === "both" ? jdText : "",
      });
      setParsedPreview(result);
      // TODO (Phase 3): once the Supervisor/ATS/Matching agents exist,
      // navigate(mode === "resume" ? "/ats-report" : "/match-report")
      // with this parsed data instead of just previewing it here.
    } catch (err) {
      setError(err.message || "Something went wrong while parsing. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="shell">
      <Sidebar />
      <main>
    <section className="upload-page">
      <div className="page-head">
        <div>
          <span className="kicker"></span>
          <h1>Start an analysis</h1>
        </div>
      </div>

      <div className="toggle-pair">
        <button
          type="button"
          className={mode === "resume" ? "on" : ""}
          onClick={() => handleModeChange("resume")}
        >
          Resume only
        </button>
        <button
          type="button"
          className={mode === "both" ? "on" : ""}
          onClick={() => handleModeChange("both")}
        >
          Resume + job description
        </button>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h3>Resume</h3>

          <div className="field">
            <div
              className={`dropzone${resumeFile ? " filled" : ""}${isDragging ? " dragging" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              {resumeFile ? `${resumeFile.name} — attached` : "Drop a PDF or DOCX here, or click to attach"}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              hidden
              onChange={(e) => handleFileChosen(e.target.files?.[0])}
            />
          </div>

          <div className="field">
            <label htmlFor="resume-text">Or paste resume text</label>
            <textarea
              id="resume-text"
              placeholder="Paste your resume content here…"
              value={resumeText}
              onChange={(e) => handleResumeTextChange(e.target.value)}
            />
          </div>
        </div>

        {mode === "both" && (
          <div className="panel" id="jd-field">
            <h3>Job description</h3>
            <div className="field">
              <label htmlFor="jd-text">Paste the JD you're targeting</label>
              <textarea
                id="jd-text"
                placeholder="Paste the job description here…"
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
              />
            </div>
            <div className="callout">
              <p>
                To only check the ATS score of your resume, just switch it to the 'Resume Only' option.
              </p>
            </div>
          </div>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="submit-row">
        <button type="button" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? "Parsing…" : "Run analysis"}
        </button>
        
      </div>

      {parsedPreview && (
        <div className="panel preview-panel">
          <h3>Parsed text (Phase 2 check)</h3>
          <p>
            Confirms the backend extracted your resume{mode === "both" ? " and JD" : ""} cleanly
            before Phase 3 wires this into real analysis.
          </p>
          <pre className="parsed-text">{parsedPreview.resumeText}</pre>
        </div>
      )}
    </section>
    </main>
    </div>
  );
}