// Diagrams that are the same in every version: per-member data flow and the sign-in and
// curve-edit sequences (none of them depend on where the API runs or which samples exist).
import { box, chip, edge, label, sequence, svg, type Line } from "./draw";

/* ---------- runtime: what each member receives ---------- */
export function runtime() {
  const id = "rt";
  let b = "";
  b += box(20, 70, 190, 150, "Postgres", [
    "memberships (role)",
    "applications (cap)",
    "curves (isShared, v)",
    { t: "trust (weights)", cls: "amb" },
    "audit_event",
  ]);
  b += box(270, 70, 200, 150, "compute(round)", ["once per change"]);
  b += chip(284, 116, 172, "official scenario", "shared curves only");
  b += chip(284, 164, 172, "engine · both methods", "pools per recommender", "acc");
  b += box(530, 70, 190, 150, "viewFor(member)", ["once per socket", "", "curves: can(curve:view)", { t: "trust: can(trust:view)", cls: "amb" }, "pools + grants: all"]);
  b += edge(id, [[210, 145], [270, 145]]);
  b += label(240, 137, "load");
  b += edge(id, [[470, 145], [530, 145]]);
  b += `<line x1="770" y1="30" x2="770" y2="440" class="eg dash"/>`;
  b += `<text x="762" y="44" text-anchor="end" class="tz">API</text><text x="778" y="44" class="tz">browsers</text>`;
  const members: [string, Line[]][] = [
    ["Owner", ["shared curves", { t: "every funder's trust", cls: "amb" }]],
    ["Funder", ["shared curves", { t: "own trust only", cls: "amb" }]],
    ["Recommender", ["own drafts + shared", "pools, no weights"]],
    ["Observer", ["grants + pools", "no curves"]],
  ];
  members.forEach(([name, subs], i) => {
    const y = 60 + i * 96;
    b += box(820, y, 180, 80, name, subs);
    b += edge(id, [[720, 145], [800, 145], [800, y + 40], [820, y + 40]]);
  });
  b += label(760, 137, "round:state");
  b += box(270, 280, 460, 96, "In the browser: scenarioFromView", [
    "one synthetic funder per recommender, holding pool P_r",
    "grants depend on trust only through P_r → same result",
    "dragging a curve reruns the engine locally",
  ], "acc");
  b += edge(id, [[820, 328], [730, 328]], { cls: "acc" });
  b += label(760, 320, "pools", "middle", "acc");
  return svg(id, 1020, 450, "Runtime data flow: the server computes the official result once per change, then viewFor filters it for each member. Trust weights reach only the owner and their own funder; everyone gets per-recommender pools, which are enough to preview grants exactly in the browser.", b);
}

export const signIn = () =>
  sequence(
    "s1",
    [
      { key: "B", label: "Browser", sub: "Next.js app" },
      { key: "A", label: "Express API", sub: "api.calebweeks.com" },
      { key: "S", label: "Socket.IO", sub: "same Node process" },
      { key: "D", label: "Postgres", sub: "via Prisma" },
    ],
    [
      { msg: ["B", "A"], label: "1. POST /auth/demo {email}" },
      { self: "A", lines: ["checkOrigin: must be the web app's origin", "demo persona → its user"] },
      { msg: ["A", "D"], label: "2. INSERT session id = sha256(token)" },
      { msg: ["A", "B"], reply: true, label: ["3. 200 + Set-Cookie sid", "HttpOnly · Secure · Lax · host-only"] },
      { msg: ["B", "A"], label: ["4. GET /rounds, then", "GET /rounds/:id (cookie)"] },
      { msg: ["A", "D"], label: "membership + round + trust" },
      { self: "A", lines: ["authorize(round:view): non-member → 404", "compute → viewFor(this member)"] },
      { msg: ["A", "B"], reply: true, label: "5. RoundView for this role" },
      { msg: ["B", "S"], label: "6. connect wss:// (cookie in handshake)" },
      { msg: ["S", "D"], label: "session lookup" },
      { msg: ["B", "S"], label: "7. round:join(roundId)" },
      { self: "S", lines: ["membership + can(round:view)", "join room round:<id>"] },
      { msg: ["S", "B"], reply: true, label: "8. ack {ok} → header shows ● Live", cls: "acc" },
      { msg: ["S", "B"], reply: true, label: "9. round:state · presence to the room" },
    ],
    "Sign-in sequence: the demo login sets a host-only session cookie; the page loads its role-filtered view over REST, then opens a WebSocket that authenticates with the same cookie and joins the round's room.",
  );

export const editCurve = () =>
  sequence(
    "s2",
    [
      { key: "R", label: "Recommender", sub: "browser" },
      { key: "A", label: "Express API", sub: "rounds router" },
      { key: "D", label: "Postgres", sub: "one transaction" },
      { key: "S", label: "Socket.IO", sub: "publish()" },
      { key: "O", label: "Other members", sub: "everyone else" },
    ],
    [
      { self: "R", cls: "acc", lines: ["1. drag a point → draftCurve", "engine reruns in the browser", "no request while dragging"] },
      { msg: ["R", "A"], label: ["2. PUT /curves/:app", "{points, expectedVersion}"] },
      { self: "A", lines: ["checkOrigin · loadUser", "authorize(curve:edit, author = me)", "zod shape + validateCurve"] },
      { msg: ["A", "D"], label: "3. BEGIN · read curve" },
      { frame: "alt", label: "[version ≠ expectedVersion]", span: ["R", "D"], extra: 200 },
      { msg: ["A", "R"], reply: true, cls: "amb", label: "409 {currentVersion}" },
      { frame: "else", label: "[versions match]" },
      { msg: ["A", "D"], label: ["4. UPDATE curve, version + 1", "INSERT audit_event · COMMIT"] },
      { self: "D", lines: ["CHECK curve_points_valid", "rejects bad shapes even here"] },
      { msg: ["A", "R"], reply: true, label: "5. 200 {version}" },
      { frame: "end" },
      { msg: ["A", "S"], label: "6. notifyRoundChanged(roundId)" },
      { msg: ["S", "D"], label: "7. loadRound + trust" },
      { self: "S", lines: ["compute once: round-robin + pooled"] },
      { frame: "loop", label: "[each socket in round:<id>]", span: ["R", "O"] },
      { self: "S", lines: ["re-check membership", "removed → round:removed", "viewFor(member)"] },
      { msg: ["S", "R"], reply: true, label: "8. round:state" },
      { msg: ["S", "O"], reply: true, label: "8. round:state (each their own)" },
      { frame: "end" },
    ],
    "Curve edit sequence: dragging previews locally; on release the browser PUTs the curve with its expected version. The API authorizes and validates, then updates the curve and writes an audit event in one transaction, or returns 409 on a version conflict. Socket.IO recomputes once and pushes each member their own filtered view.",
  );
