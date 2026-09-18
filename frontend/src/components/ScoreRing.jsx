// Big number + progress bar score display, per the reference blueprint's
// .score-block. Named ScoreRing to match the roadmap's folder structure,
// but visually it's the number-and-bar treatment from the blueprint, not
// a literal ring — kept consistent with what's already designed.
//
// variant: 'ats' (gold fill) | 'match' (green fill)

export default function ScoreRing({ score, variant = "ats", caption }) {
  const fillClass = variant === "match" ? "score-bar-fill match-fill" : "score-bar-fill";

  return (
    <div className="panel">
      <div className="score-block">
        <div className="score-num">
          {score}
          <sup>/100</sup>
        </div>
        <div style={{ flex: 1 }}>
          <div className="score-bar-track">
            <div className={fillClass} style={{ width: `${score}%` }} />
          </div>
          {caption && <p style={{ marginTop: ".6rem" }}>{caption}</p>}
        </div>
      </div>
    </div>
  );
}