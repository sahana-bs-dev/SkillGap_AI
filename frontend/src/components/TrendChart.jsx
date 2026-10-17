import "./TrendChart.css";

// Small line chart drawn with plain SVG (no chart library), scores 0 to 100.
//
//   <TrendChart
//     labels={["12 Oct", "14 Oct"]}
//     series={[{ name: "Match score", color: "var(--match)", values: [52, 70] }]}
//   />
//
// A null/undefined value is skipped: the line simply joins the points on either side.

const WIDTH = 720;
const PAD_LEFT = 38;
const PAD_RIGHT = 20;
const PAD_TOP = 22;
const PAD_BOTTOM = 34;
const GRID = [0, 25, 50, 75, 100];

function isNumber(v) {
  return typeof v === "number" && !isNaN(v);
}

export default function TrendChart({ labels, series, height = 260, ariaLabel }) {
  const count = labels.length;
  const innerW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const innerH = height - PAD_TOP - PAD_BOTTOM;

  const x = (i) => PAD_LEFT + (count <= 1 ? innerW / 2 : (i * innerW) / (count - 1));
  const y = (v) => PAD_TOP + innerH - (Math.max(0, Math.min(100, v)) / 100) * innerH;

  const step = Math.max(1, Math.ceil(count / 8)); // keep the date labels readable
  const showValues = count <= 8;

  const grid = [];
  for (let g = 0; g < GRID.length; g++) {
    grid.push(
      <g key={"grid-" + GRID[g]}>
        <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y(GRID[g])} y2={y(GRID[g])} className="tc-grid" />
        <text x={PAD_LEFT - 8} y={y(GRID[g]) + 4} textAnchor="end" className="tc-axis">
          {GRID[g]}
        </text>
      </g>
    );
  }

  const xLabels = [];
  for (let i = 0; i < count; i++) {
    if (i % step !== 0 && i !== count - 1) continue;
    xLabels.push(
      <text key={"x-" + i} x={x(i)} y={height - 10} textAnchor="middle" className="tc-axis">
        {labels[i]}
      </text>
    );
  }

  const lines = [];
  for (let s = 0; s < series.length; s++) {
    const one = series[s];
    let path = "";
    const dots = [];

    for (let i = 0; i < count; i++) {
      const v = one.values[i];
      if (!isNumber(v)) continue;
      path += (path ? " L " : " M ") + x(i) + " " + y(v);

      // two lines close together: the higher one labels above its dot, the lower one below
      let above = true;
      for (let o = 0; o < series.length; o++) {
        if (o === s || !isNumber(series[o].values[i])) continue;
        const other = series[o].values[i];
        if (v < other || (v === other && s > o)) above = false;
      }

      dots.push(
        <g key={"dot-" + s + "-" + i}>
          <circle cx={x(i)} cy={y(v)} r="4.5" className="tc-dot" style={{ stroke: one.color }}>
            <title>{one.name + ", " + labels[i] + ": " + v}</title>
          </circle>
          {showValues ? (
            <text x={x(i)} y={above ? y(v) - 10 : y(v) + 17} textAnchor="middle" className="tc-value" style={{ fill: one.color }}>
              {v}
            </text>
          ) : null}
        </g>
      );
    }

    lines.push(
      <g key={"series-" + s}>
        {path ? <path d={path.trim()} className="tc-line" style={{ stroke: one.color }} /> : null}
        {dots}
      </g>
    );
  }

  const legend = [];
  for (let s = 0; s < series.length; s++) {
    legend.push(
      <span className="tc-legend-item" key={"legend-" + s}>
        <span className="tc-swatch" style={{ background: series[s].color }} />
        {series[s].name}
      </span>
    );
  }

  return (
    <div className="tc-wrap">
      <svg viewBox={"0 0 " + WIDTH + " " + height} className="tc-chart" role="img" aria-label={ariaLabel || "Score chart"}>
        {grid}
        {lines}
        {xLabels}
      </svg>
      {series.length > 1 || (series[0] && series[0].name) ? <div className="tc-legend">{legend}</div> : null}
    </div>
  );
}