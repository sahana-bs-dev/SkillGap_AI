import { useLocation } from "react-router-dom";
import Sidebar from "../../components/Layout/Sidebar";

export default function MatchReport() {
  const { state } = useLocation();
  const resumeText = state?.resumeText;
  const jdText = state?.jdText;

  return (
    <div className="shell">
      <Sidebar />
      <main style={{ padding: "3rem" }}>
        <h1>Match Report</h1>
        <p>Placeholder — Phase 5 wires in the real Frontend here.</p>
        {resumeText && jdText ? (
          <p>Received resume ({resumeText.length} chars) and JD ({jdText.length} chars) from Upload.</p>
        ) : (
          <p style={{ color: "#b00" }}>Missing resume or JD text — try running an analysis from Upload first.</p>
        )}
      </main>
    </div>
  );
}