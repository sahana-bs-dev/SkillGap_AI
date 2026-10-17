// Word-level text diff for the resume rewrite page. No libraries needed.
//
// diffText(original, rewritten) -> [{ type: "same" | "add" | "del", text: token }]
// buildSegments(ops, mode)      -> [{ type, text }] ready to render
//      mode "inline": rewritten layout, deleted words shown in place
//      mode "left":   the original resume (unchanged + removed words)
//      mode "right":  the rewritten resume (unchanged + added words)
// diffStats(ops)                -> { added, removed, unchanged }

const TOKEN = /\n|[^\s]+/g; // a token is a word or a line break
const MAX_CELLS = 4000000; // above this, skip the exact diff so the page never freezes

function tokenize(text) {
  return (text || "").replace(/\r\n?/g, "\n").match(TOKEN) || [];
}

export function diffText(original, rewritten) {
  const a = tokenize(original);
  const b = tokenize(rewritten);

  // Trim the parts that are identical at the start and end
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const ops = [];
  for (let i = 0; i < start; i++) ops.push({ type: "same", text: a[i] });

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;

  if (n === 0 || m === 0 || (n + 1) * (m + 1) > MAX_CELLS) {
    // Nothing to match, or too big: show the middle as one removed + one added block
    for (let i = 0; i < n; i++) ops.push({ type: "del", text: midA[i] });
    for (let j = 0; j < m; j++) ops.push({ type: "add", text: midB[j] });
  } else {
    // Longest common subsequence table (suffix form so we can walk forward)
    const w = m + 1;
    const table = new Uint16Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        if (midA[i] === midB[j]) {
          table[i * w + j] = table[(i + 1) * w + j + 1] + 1;
        } else {
          const down = table[(i + 1) * w + j];
          const right = table[i * w + j + 1];
          table[i * w + j] = down >= right ? down : right;
        }
      }
    }

    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        ops.push({ type: "same", text: midA[i] });
        i++;
        j++;
      } else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) {
        ops.push({ type: "del", text: midA[i] });
        i++;
      } else {
        ops.push({ type: "add", text: midB[j] });
        j++;
      }
    }
    while (i < n) ops.push({ type: "del", text: midA[i++] });
    while (j < m) ops.push({ type: "add", text: midB[j++] });
  }

  for (let i = endA; i < a.length; i++) ops.push({ type: "same", text: a[i] });
  return ops;
}

function joinTokens(tokens) {
  let out = "";
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "\n") {
      out += "\n";
    } else {
      if (out !== "" && !out.endsWith("\n")) out += " ";
      out += token;
    }
  }
  return out;
}

export function buildSegments(ops, mode) {
  const segments = [];
  let currentType = null;
  let tokens = [];

  function flush() {
    if (tokens.length === 0) return;
    const text = joinTokens(tokens);
    if (text !== "") segments.push({ type: currentType, text: text });
    tokens = [];
  }

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (mode === "left" && op.type === "add") continue;
    if (mode === "right" && op.type === "del") continue;
    // Inline view follows the rewritten layout, so removed line breaks are dropped
    if (mode === "inline" && op.type === "del" && op.text === "\n") continue;

    if (op.type !== currentType) {
      flush();
      currentType = op.type;
    }
    tokens.push(op.text);
  }
  flush();
  return segments;
}

export function diffStats(ops) {
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].text === "\n") continue;
    if (ops[i].type === "add") added++;
    else if (ops[i].type === "del") removed++;
    else unchanged++;
  }
  return { added: added, removed: removed, unchanged: unchanged };
}