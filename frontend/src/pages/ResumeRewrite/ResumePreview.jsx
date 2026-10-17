import { useMemo } from "react";
import { parseResume } from "../../utils/resumeFormat";

// On-screen version of the downloadable resume (same parser as the PDF/Word files).

function Runs({ runs }) {
  const nodes = [];
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    let node = r.text;
    if (r.bold) node = <strong>{node}</strong>;
    if (r.italic) node = <em>{node}</em>;
    nodes.push(<span key={i}>{node}</span>);
  }
  return <>{nodes}</>;
}

function SectionBlocks({ blocks }) {
  const out = [];
  let bullets = [];

  function flushBullets(key) {
    if (!bullets.length) return;
    const items = [];
    for (let i = 0; i < bullets.length; i++) {
      items.push(
        <li key={i}>
          <Runs runs={bullets[i]} />
        </li>
      );
    }
    out.push(
      <ul className="rv-bullets" key={"ul-" + key}>
        {items}
      </ul>
    );
    bullets = [];
  }

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === "bullet") {
      bullets.push(b.runs);
      continue;
    }
    flushBullets(i);

    if (b.type === "entry") {
      out.push(
        <div className="rv-entry" key={i}>
          <strong>{b.text}</strong>
          {b.date ? <em className="rv-date">{b.date}</em> : null}
        </div>
      );
    } else if (b.type === "kv") {
      out.push(
        <p className="rv-para" key={i}>
          <strong>{b.label}</strong> {b.text}
        </p>
      );
    } else {
      out.push(
        <p className="rv-para" key={i}>
          <Runs runs={b.runs} />
        </p>
      );
    }
  }
  flushBullets("end");
  return <>{out}</>;
}

export default function ResumePreview({ text }) {
  const model = useMemo(() => parseResume(text), [text]);
  const hasHeader = model.name || model.taglines.length || model.contact.length;

  const sections = [];
  for (let s = 0; s < model.sections.length; s++) {
    const section = model.sections[s];
    sections.push(
      <section className="rv-section" key={s}>
        {section.title ? <h4 className="rv-section-title">{section.title}</h4> : null}
        <SectionBlocks blocks={section.blocks} />
      </section>
    );
  }

  return (
    <div className="rv-paper">
      {hasHeader && (
        <header className="rv-header">
          {model.name ? <h3 className="rv-name">{model.name}</h3> : null}
          {model.taglines.map((t, i) => (
            <p className="rv-tagline" key={i}>{t}</p>
          ))}
          {model.contact.length > 0 && <p className="rv-contact">{model.contact.join("  |  ")}</p>}
        </header>
      )}
      {sections}
    </div>
  );
}