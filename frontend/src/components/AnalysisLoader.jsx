import { useEffect, useState } from "react";
import "./AnalysisLoader.css";

const MESSAGES = [
  "Reading your resume",
  "Understanding the job description",
  "Comparing your skills",
  "Putting your report together",
];

export default function AnalysisLoader({
  title = "Analysing your resume",
  messages = MESSAGES,
  hint = "This usually takes under a minute. Please keep this page open.",
}) {
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % messages.length), 2800);
    return () => clearInterval(t);
  }, [messages.length]);

  return (
    <div className="al-wrap" role="status" aria-live="polite">
      <div className="al-spinner" aria-hidden="true" />
      <h2 className="al-title">{title}</h2>
      <p className="al-msg" key={i}>{messages[i]}…</p>
      <p className="al-hint">{hint}</p>
    </div>
  );
}