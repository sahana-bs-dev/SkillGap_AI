import { useLocation } from "react-router-dom";
import Sidebar from "../../components/Layout/Sidebar";

export default function ATSReport() {
  const { state } = useLocation();
  const resumeText = state?.resumeText;

  return (
    <div className="shell">
      <Sidebar />
      <main style={{ padding: "3rem" }}>
        <h1>ATS Report</h1>
        <p>Placeholder — ATS FRONTEND IS IMPLEMENTED IN PHASE 04  .</p>
        {resumeText ? (
          <p>Received parsed resume text ({resumeText.length} characters) from Upload.</p>
        ) : (
          <p style={{ color: "#b00" }}>No resume text received — try running an analysis from Upload first.</p>
        )}
      </main>
    </div>
  );
}