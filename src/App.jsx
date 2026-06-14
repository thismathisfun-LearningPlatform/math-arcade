import React, { useState, useEffect, useCallback, useRef } from "react";

/* ═══════════════════════════════════════════════════════════
   DESIGN TOKENS
═══════════════════════════════════════════════════════════ */
const C = {
  ink: "#1A1640", paper: "#FAF9FF",
  violet: "#6C4DF6", violetDark: "#5538D6",
  coral: "#FF6B7A", sunny: "#FFC53D",
  teal: "#1FC8A9", sky: "#4DA8F6",
  lavender: "#EDE9FF", mint: "#E2FAF4",
  blush: "#FFE9EC", cream: "#FFF6DF",
  pink: "#FFE8F2", pinkDark: "#F0569B",
  orange: "#E8960C", green: "#22A347",
};

const TEACHER_PIN = "1234"; // teacher changes this in the UI (stored in shared storage)

const TIME_LIMITS = { Easy: 60, Medium: 120, Hard: 180 };

/* ═══════════════════════════════════════════════════════════
   COURSE DEFINITIONS
═══════════════════════════════════════════════════════════ */
const COURSES = {
  prealgebra: {
    id: "prealgebra", label: "Pre-Algebra", emoji: "🔢",
    color: "#22A347", bg: "#E6F9EE", dark: "#1A7E38",
    tagline: "Build your math foundation",
    topics: [
      { name: "Integers & Order of Operations", icon: "➕", color: "#22A347", bg: "#E6F9EE" },
      { name: "Fractions & Decimals",           icon: "½",  color: "#E8960C", bg: C.cream },
      { name: "Ratios & Proportions",           icon: "⚖️", color: C.sky,    bg: "#E5F2FF" },
      { name: "Percents",                       icon: "%",  color: C.coral,  bg: C.blush },
      { name: "Variables & Expressions",        icon: "🔤", color: C.violet, bg: C.lavender },
      { name: "Geometry Basics",                icon: "📐", color: C.teal,   bg: C.mint },
    ],
    seeds: [
      { id:"pa1",  topic:"Integers & Order of Operations", difficulty:"Easy",   question:"Evaluate:  3 + 4 × 2 − 1",                                        choices:["10","13","6","14"],        answer:0 },
      { id:"pa2",  topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate:  (5 + 3)² ÷ 4 − 6",                                      choices:["10","22","7","−6"],        answer:0 },
      { id:"pa3",  topic:"Integers & Order of Operations", difficulty:"Hard",   question:"Evaluate:  −3 × (−2)² + 4(−1 + 6) ÷ 2",                           choices:["−2","10","−10","2"], answer:1 },
      { id:"pa4",  topic:"Fractions & Decimals",           difficulty:"Easy",   question:"What is  3/4 + 1/4 ?",                                              choices:["1","4/8","1/2","2"],       answer:0 },
      { id:"pa5",  topic:"Fractions & Decimals",           difficulty:"Medium", question:"Multiply:  2/3 × 3/8",                                              choices:["1/4","5/11","6/24","2/8"], answer:0 },
      { id:"pa6",  topic:"Ratios & Proportions",           difficulty:"Easy",   question:"A recipe uses 2 cups of sugar for 5 cups of flour. For 10 cups of flour, how many cups of sugar?", choices:["4","2","5","10"], answer:1 },
      { id:"pa7",  topic:"Percents",                       difficulty:"Easy",   question:"What is 25% of 80?",                                                choices:["20","25","40","15"],       answer:0 },
      { id:"pa8",  topic:"Percents",                       difficulty:"Hard",   question:"A shirt costs $40 and is marked up 35%. What is the new price?",    choices:["$54","$50","$48","$44"],   answer:0 },
      { id:"pa9",  topic:"Variables & Expressions",        difficulty:"Easy",   question:"Simplify:  4x + 3x − x",                                           choices:["6x","8x","7x","4x"],      answer:0 },
      { id:"pa10", topic:"Geometry Basics",                difficulty:"Medium", question:"Find the area of a rectangle with length 8 and width 5.",           choices:["40","26","13","80"],       answer:0 },
    ],
  },

  algebra1: {
    id: "algebra1", label: "Algebra 1", emoji: "📐",
    color: C.sky, bg: "#E5F2FF", dark: "#2B7FC7",
    tagline: "Equations, functions & beyond",
    topics: [
      { name: "Linear Equations",         icon: "📏", color: C.sky,     bg: "#E5F2FF" },
      { name: "Systems of Equations",     icon: "🔀", color: C.violet,  bg: C.lavender },
      { name: "Inequalities",             icon: "≤",  color: C.coral,   bg: C.blush },
      { name: "Slope & Linear Functions", icon: "📉", color: C.teal,    bg: C.mint },
      { name: "Exponents & Radicals",     icon: "√",  color: "#E8960C", bg: C.cream },
      { name: "Intro to Polynomials",     icon: "🧮", color: C.pinkDark,bg: C.pink },
    ],
    seeds: [
      { id:"a1_1",  topic:"Linear Equations",         difficulty:"Easy",   question:"Solve for x:  2x + 5 = 13",                               choices:["x = 4","x = 9","x = 3","x = 6"],           answer:0 },
      { id:"a1_2",  topic:"Linear Equations",         difficulty:"Medium", question:"Solve:  3(x − 2) = 4x + 1",                               choices:["x = −7","x = 7","x = 1","x = −1"],       answer:3 },
      { id:"a1_3",  topic:"Linear Equations",         difficulty:"Hard",   question:"Solve:  (x + 3)/4 − (x − 1)/2 = 1",                       choices:["x = −3","x = 5","x = 3","x = −5"],     answer:2 },
      { id:"a1_4",  topic:"Systems of Equations",     difficulty:"Easy",   question:"Solve:  y = 2x + 1  and  y = x + 4",                      choices:["(3, 7)","(2, 5)","(1, 3)","(4, 9)"],       answer:0 },
      { id:"a1_5",  topic:"Systems of Equations",     difficulty:"Hard",   question:"Solve:  3x + 2y = 12  and  x − y = 1",                    choices:["(2, 3)","(3, 2)","(4, 0)","(1, 4)"],       answer:0 },
      { id:"a1_6",  topic:"Inequalities",             difficulty:"Easy",   question:"Solve:  −3x < 9",                                          choices:["x > −3","x < −3","x > 3","x < 3"],      answer:0 },
      { id:"a1_7",  topic:"Slope & Linear Functions", difficulty:"Easy",   question:"What is the slope of the line through (1, 2) and (3, 8)?", choices:["3","2","6","1/3"],                          answer:0 },
      { id:"a1_8",  topic:"Slope & Linear Functions", difficulty:"Medium", question:"Write the equation of the line with slope 2 through (1, 5).",choices:["y = 2x + 3","y = 2x + 5","y = 2x − 3","y = 2x + 1"], answer:0 },
      { id:"a1_9",  topic:"Exponents & Radicals",     difficulty:"Medium", question:"Simplify:  x³ · x⁵",                                      choices:["x⁸","x¹⁵","2x⁸","x²"],             answer:0 },
      { id:"a1_10", topic:"Intro to Polynomials",     difficulty:"Medium", question:"Expand:  (x + 3)(x − 5)",                                  choices:["x² − 2x − 15","x² + 2x − 15","x² + 8x + 15","x² − 15"], answer:0 },
    ],
  },

  geometry: {
    id: "geometry", label: "Geometry", emoji: "🔷",
    color: "#C44DF6", bg: "#F7E9FF", dark: "#9B2FD6",
    tagline: "Shapes, proofs & spatial thinking",
    topics: [
      { name: "Angles & Lines",        icon: "📐", color: "#C44DF6", bg: "#F7E9FF" },
      { name: "Triangles",             icon: "△",  color: C.coral,   bg: C.blush },
      { name: "Circles",               icon: "⭕", color: C.teal,    bg: C.mint },
      { name: "Area & Perimeter",      icon: "📏", color: "#E8960C", bg: C.cream },
      { name: "Volume & Surface Area", icon: "🧊", color: C.sky,     bg: "#E5F2FF" },
      { name: "Coordinate Geometry",   icon: "🗺️", color: "#22A347", bg: "#E6F9EE" },
    ],
    seeds: [
      { id:"geo1",  topic:"Angles & Lines",        difficulty:"Easy",   question:"Two angles are supplementary. One measures 65°. What is the other?",                    choices:["115°","25°","90°","65°"], answer:0 },
      { id:"geo2",  topic:"Angles & Lines",        difficulty:"Medium", question:"Two parallel lines are cut by a transversal. One co-interior angle is 72°. Find the other.", choices:["108°","72°","72°","90°"], answer:0 },
      { id:"geo3",  topic:"Triangles",             difficulty:"Easy",   question:"A triangle has angles 45° and 80°. What is the third angle?",                           choices:["55°","45°","80°","35°"], answer:0 },
      { id:"geo4",  topic:"Triangles",             difficulty:"Hard",   question:"In a 30-60-90 triangle, the shortest side is 7. What is the hypotenuse?",               choices:["14","7√3","7√2","21"], answer:0 },
      { id:"geo5",  topic:"Circles",               difficulty:"Easy",   question:"What is the circumference of a circle with radius 6? (π ≈ 3.14)",                       choices:["37.68","18.84","12π","6π"], answer:0 },
      { id:"geo6",  topic:"Circles",               difficulty:"Hard",   question:"An arc subtends 120° in a circle of radius 9. What is the arc length? (leave in terms of π)", choices:["6π","3π","9π","2π"], answer:0 },
      { id:"geo7",  topic:"Area & Perimeter",      difficulty:"Easy",   question:"What is the area of a triangle with base 10 and height 6?",                             choices:["30","60","16","15"], answer:0 },
      { id:"geo8",  topic:"Area & Perimeter",      difficulty:"Medium", question:"A square has perimeter 36. What is its area?",                                           choices:["81","36","72","9"], answer:0 },
      { id:"geo9",  topic:"Volume & Surface Area", difficulty:"Medium", question:"Find the volume of a rectangular prism: length 5, width 3, height 4.",                  choices:["60","94","47","120"], answer:0 },
      { id:"geo10", topic:"Coordinate Geometry",   difficulty:"Medium", question:"What is the distance between (1, 2) and (4, 6)?",                                       choices:["5","7","√7","4"], answer:0 },
    ],
  },

  algebra2: {
    id: "algebra2", label: "Algebra 2", emoji: "ƒ",
    color: C.violet, bg: C.lavender, dark: C.violetDark,
    tagline: "Practice · Ask for help · Level up",
    topics: [
      { name: "Quadratics",                          icon: "📈", color: C.coral,    bg: C.blush },
      { name: "Polynomials",                         icon: "🧮", color: C.violet,   bg: C.lavender },
      { name: "Logarithms",                          icon: "🌿", color: C.teal,     bg: C.mint },
      { name: "Rational Expressions",                icon: "➗", color: "#E8960C",  bg: C.cream },
      { name: "Parent Functions & Transformations",  icon: "🎢", color: C.pinkDark, bg: C.pink },
      { name: "Radicals & Radical Equations",        icon: "√",  color: "#22A347",  bg: "#E6F9EE" },
      { name: "Exponential Functions",               icon: "🚀", color: C.sky,      bg: "#E5F2FF" },
      { name: "Sequences & Series",                  icon: "🔢", color: "#8B5CF6",  bg: "#EDE9FE" },
      { name: "Complex Numbers",                     icon: "✨", color: "#C44DF6",  bg: "#F7E9FF" },
    ],
    seeds: [
      { id:"p1",  topic:"Quadratics",                         difficulty:"Easy",   question:"Solve for x:  x² − 5x + 6 = 0",                                        choices:["x = 2 or x = 3","x = 1 or x = 6","x = -2 or x = -3","x = 0"], answer:0 },
      { id:"p2",  topic:"Quadratics",                         difficulty:"Medium", question:"What is the vertex of  y = 2(x − 3)² + 4 ?",                            choices:["(3, 4)","(−3, 4)","(3, −4)","(4, 3)"], answer:0 },
      { id:"p9",  topic:"Quadratics",                         difficulty:"Hard",   question:"For what values of k does  x² + kx + 9 = 0  have exactly one real solution?", choices:["k = 6 or k = −6","k = 3 or k = −3","k = 9","k = 0"], answer:0 },
      { id:"p3",  topic:"Polynomials",                        difficulty:"Medium", question:"What is the remainder when  x³ − 4x + 6  is divided by  (x − 2) ?",     choices:["6","0","2","10"],   answer:1 },
      { id:"p10", topic:"Polynomials",                        difficulty:"Hard",   question:"Given (x + 1) is a factor of  x³ + 2x² − 5x − 6,  what are all the roots?", choices:["x = −1, 2, 3","x = 1, −2, 3","x = −1, −2, 3","x = 1, 2, −3"], answer:0 },
      { id:"p16", topic:"Polynomials",                        difficulty:"Easy",   question:"What is the degree of  4x⁵ − 3x² + 7x − 1 ?",                           choices:["5","4","3","2"],  answer:0 },
      { id:"p4",  topic:"Logarithms",                         difficulty:"Easy",   question:"Evaluate:  log₂(32)",                                                    choices:["5","4","6","16"],     answer:0 },
      { id:"p5",  topic:"Logarithms",                         difficulty:"Medium", question:"Solve for x:  log(x) + log(x − 3) = 1",                                 choices:["x = 5","x = −2","x = 4","x = 3"], answer:0 },
      { id:"p11", topic:"Logarithms",                         difficulty:"Hard",   question:"Solve for x:  log₃(x) + log₃(x + 6) = 3",                              choices:["x = 3","x = −9","x = 0","x = 9"], answer:0 },
      { id:"p6",  topic:"Rational Expressions",               difficulty:"Medium", question:"Simplify:  (x² − 9) / (x² + 5x + 6)",                                   choices:["(x − 3)/(x + 2)","(x + 3)/(x + 2)","(x − 3)/(x − 2)","1"], answer:0 },
      { id:"p12", topic:"Rational Expressions",               difficulty:"Hard",   question:"Solve for x:  2/(x − 1) + 3/(x + 1) = 4/(x² − 1)",                     choices:["x = 3/5","x = 1","x = −1","x = 2"], answer:0 },
      { id:"p17", topic:"Parent Functions & Transformations", difficulty:"Easy",   question:"What is the parent function of  g(x) = (x − 2)² + 5 ?",                 choices:["y = x²","y = x","y = √x","y = |x|"], answer:0 },
      { id:"p18", topic:"Parent Functions & Transformations", difficulty:"Easy",   question:"The graph of  y = |x|  is shifted 3 units RIGHT. What is the new equation?", choices:["y = |x − 3|","y = |x + 3|","y = |x| − 3","y = |x| + 3"], answer:0 },
      { id:"p19", topic:"Parent Functions & Transformations", difficulty:"Medium", question:"How is  g(x) = −√x + 4  transformed from  y = √x ?",                    choices:["Reflected over x-axis, up 4","Shifted right 4","Reflected over y-axis","Compressed vertically"], answer:0 },
      { id:"p20", topic:"Parent Functions & Transformations", difficulty:"Medium", question:"Describe all transformations of  g(x) = 2|x + 1| − 3  from  y = |x|.",  choices:["Vert. stretch ×2, left 1, down 3","Right 1, down 3","Left 1, up 3","Vert. stretch ×2, right 1, up 3"], answer:0 },
      { id:"p21", topic:"Parent Functions & Transformations", difficulty:"Hard",   question:"Reflect y = x³ over the x-axis, shift 2 right, then 5 up. What's the equation?", choices:["y = −(x − 2)³ + 5","y = (x − 2)³ + 5","y = −(x + 2)³ − 5","y = −(x − 2)³ − 5"], answer:0 },
      { id:"p22", topic:"Parent Functions & Transformations", difficulty:"Hard",   question:"(4, −2) is on  y = f(x). What point MUST be on  y = f(x − 3) + 6 ?",    choices:["(7, 4)","(1, 4)","(7, −8)","(4, 4)"], answer:0 },
      { id:"r1",  topic:"Radicals & Radical Equations",       difficulty:"Easy",   question:"Simplify:  √72",                                                         choices:["6√2","8√2","3√8","12√1"], answer:0 },
      { id:"r2",  topic:"Radicals & Radical Equations",       difficulty:"Medium", question:"Solve:  √(2x + 1) = 5",                                                  choices:["x = 12","x = 24","x = 5","x = 6"], answer:0 },
      { id:"r3",  topic:"Radicals & Radical Equations",       difficulty:"Hard",   question:"Solve:  √(x + 3) = x − 3",                                               choices:["x = 6","x = 1 or x = 6","x = −3","x = 3"], answer:0 },
      { id:"e1",  topic:"Exponential Functions",              difficulty:"Easy",   question:"Which function represents exponential DECAY?",                           choices:["y = 3(0.5)ˣ","y = 0.5(3)ˣ","y = 3ˣ","y = (1/3)ˣ"], answer:0 },
      { id:"e2",  topic:"Exponential Functions",              difficulty:"Medium", question:"A population of 500 doubles every 4 years. What is it after 12 years?",  choices:["4000","6000","2000","1000"], answer:0 },
      { id:"e3",  topic:"Exponential Functions",              difficulty:"Hard",   question:"Solve for x:  4ˣ = 8",                                                   choices:["x = 3/2","x = 2","x = 4","x = 1"], answer:0 },
      { id:"p7",  topic:"Sequences & Series",                 difficulty:"Easy",   question:"What is the 10th term of  4, 7, 10, … ?",                               choices:["31","34","28","30"], answer:0 },
      { id:"p15", topic:"Sequences & Series",                 difficulty:"Medium", question:"What is the sum of the first 20 terms of  2 + 5 + 8 + … ?",             choices:["610","590","620","580"], answer:0 },
      { id:"p13", topic:"Sequences & Series",                 difficulty:"Hard",   question:"Sum of infinite geometric series:  18 − 6 + 2 − 2/3 + … ?",            choices:["27/2","12","24","36"], answer:0 },
      { id:"p8",  topic:"Complex Numbers",                    difficulty:"Medium", question:"Multiply:  (3 + 2i)(1 − 4i)",                                           choices:["11 − 10i","3 − 8i","-5 + 10i","..."], answer:0 },
      { id:"p14", topic:"Complex Numbers",                    difficulty:"Hard",   question:"Simplify:  (2 + i) / (3 − i)",                                          choices:["(1 + i)/2","(5 + 5i)/8","(2 + i)/(3 − i)","..."], answer:0 },
    ],
  },
};

/* ═══════════════════════════════════════════════════════════
   STORAGE KEYS
═══════════════════════════════════════════════════════════ */
const KEYS = {
  settings:  "mathplatform-settings",          // { teacherPin, courseSettings }
  students:  "mathplatform-students",          // { [studentId]: StudentProfile }
  course:    (id) => `mathplatform-v2-${id}`,  // { problems, flags }
};

/* ═══════════════════════════════════════════════════════════
   URL HELPERS
═══════════════════════════════════════════════════════════ */
function getCourseFromURL() {
  const p = new URLSearchParams(window.location.search);
  const id = p.get("course") || window.location.hash.replace("#",
"",
);
  return COURSES[id] ? id : null;
}
function setCourseURL(id) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("course", id); else url.searchParams.delete("course");
  window.history.replaceState({}, "", url.toString());
}
function buildCourseURL(id) {
  const url = new URL(window.location.href);
  url.searchParams.set("course", id);
  return url.toString();
}

/* ═══════════════════════════════════════════════════════════
   SMALL UI HELPERS
═══════════════════════════════════════════════════════════ */
const HELP_REASONS = [
  "I don't know where to start",
  "I got it wrong and don't understand why",
  "I don't understand what the question is asking",
  "I think the answer might be wrong",
  "Something else",
];

function Chip({ label, active, color, bg, icon, onClick, small }) {
  return (
    <button onClick={onClick}
      className={`${small?"px-2.5 py-1 text-xs":"px-3 py-1.5 text-sm"} rounded-full font-bold transition-all whitespace-nowrap`}
      style={{ background: active ? color : bg, color: active ? "#fff" : color, border: `2px solid ${active ? color : "transparent"}` }}>
      {icon && <span className="mr-1">{icon}</span>}{label}
    </button>
  );
}

function DiffBadge({ level }) {
  const m = { Easy:{ c:C.teal,b:C.mint }, Medium:{ c:C.orange,b:C.cream }, Hard:{ c:C.coral,b:C.blush } };
  const s = m[level] || m.Medium;
  return <span className="text-xs font-extrabold px-2 py-0.5 rounded-full" style={{ color:s.c, background:s.b }}>{level}</span>;
}

function topicStyleFor(course, name) {
  return course.topics.find(t => t.name === name) || { color: C.violet, bg: C.lavender, icon: "📘" };
}

function avatarColor(name) {
  const colors = [C.violet, C.coral, C.teal, C.sky, C.pinkDark, "#22A347", "#E8960C", "#C44DF6"];
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % colors.length;
  return colors[h];
}

function Avatar({ name, size = 36 }) {
  const initials = name.trim().split(" ").slice(0,2).map(w => w[0]?.toUpperCase()).join("");
  const color = avatarColor(name);
  return (
    <div className="rounded-full flex items-center justify-center font-extrabold text-white shrink-0"
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}>
      {initials}
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "#241F4Ecc" }} onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <label className="text-sm font-bold block">
      {label}
      <input {...props} className="mt-1 w-full rounded-xl px-4 py-2.5 font-semibold outline-none block"
        style={{ background: "#F4F2FC", border: `2px solid ${C.lavender}` }} />
    </label>
  );
}

/* ═══════════════════════════════════════════════════════════
   TEACHER PIN GATE
═══════════════════════════════════════════════════════════ */
function TeacherPinGate({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [storedPin, setStoredPin] = useState(TEACHER_PIN);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(KEYS.settings, true);
        const s = JSON.parse(r.value);
        if (s.teacherPin) setStoredPin(s.teacherPin);
      } catch {}
    })();
  }, []);

  const attempt = () => {
    if (pin === storedPin) { setErr(""); onUnlock(); }
    else { setErr("Incorrect PIN — try again."); setPin(""); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: C.paper, backgroundImage: `linear-gradient(${C.lavender}66 1px,transparent 1px),linear-gradient(90deg,${C.lavender}66 1px,transparent 1px)`, backgroundSize: "28px 28px" }}>
      <div className="bg-white rounded-3xl p-8 shadow-xl w-full max-w-sm text-center">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-3xl"
          style={{ background: C.cream }}>🔐</div>
        <h2 className="text-xl font-extrabold mb-1" style={{ color: C.ink }}>Teacher Access</h2>
        <p className="text-sm opacity-60 mb-5">Enter your teacher PIN to continue.</p>
        <input type="password" value={pin} onChange={e => setPin(e.target.value)}
          onKeyDown={e => e.key === "Enter" && attempt()}
          placeholder="PIN" maxLength={8}
          className="w-full rounded-xl px-4 py-3 text-center text-2xl tracking-widest font-extrabold outline-none mb-3"
          style={{ background: "#F4F2FC", border: `2px solid ${err ? C.coral : C.lavender}` }} />
        {err && <p className="text-xs font-bold mb-3" style={{ color: C.coral }}>{err}</p>}
        <button onClick={attempt}
          className="w-full py-3 rounded-full font-extrabold text-white"
          style={{ background: `linear-gradient(135deg, ${C.violet}, ${C.violetDark})` }}>
          Unlock →
        </button>
        <p className="text-xs opacity-40 mt-4">Default PIN: 1234 (change it in Settings)</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   STUDENT REGISTRATION / LOGIN
═══════════════════════════════════════════════════════════ */
function StudentAuth({ courseId, onLogin }) {
  const course = COURSES[courseId];
  const [mode, setMode] = useState("login"); // login | register
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [students, setStudents] = useState({});

  useEffect(() => {
    (async () => {
      try { const r = await window.storage.get(KEYS.students, true); setStudents(JSON.parse(r.value)); } catch {}
    })();
  }, []);

  const persist = async (s) => {
    await window.storage.set(KEYS.students, JSON.stringify(s), true);
    setStudents(s);
  };

  const register = async () => {
    if (!firstName.trim() || !lastName.trim()) return setErr("Please enter your first and last name.");
    if (username.trim().length < 3) return setErr("Username must be at least 3 characters.");
    if (password.length < 4) return setErr("Password must be at least 4 characters.");
    if (students[username.toLowerCase()]) return setErr("That username is already taken.");
    const id = username.toLowerCase().trim();
    const profile = {
      id, username: id, firstName: firstName.trim(), lastName: lastName.trim(),
      password, // stored as-is (demo app — no real security needed)
      enrolledCourses: [courseId],
      accessRevoked: [],
      joinedAt: new Date().toLocaleDateString(),
      scores: {},  // { [courseId]: { right, tried, streak } }
      helpRequests: 0,
    };
    const next = { ...students, [id]: profile };
    await persist(next);
    onLogin(profile);
  };

  const login = async () => {
    const id = username.toLowerCase().trim();
    const s = students[id];
    if (!s) return setErr("Username not found.");
    if (s.password !== password) return setErr("Incorrect password.");
    if (s.accessRevoked?.includes(courseId)) return setErr("Your access to this course has been revoked. Please contact your teacher.");
    onLogin(s);
  };

  const action = mode === "register" ? register : login;

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: course.bg, backgroundImage: `linear-gradient(${C.lavender}55 1px,transparent 1px),linear-gradient(90deg,${C.lavender}55 1px,transparent 1px)`, backgroundSize: "28px 28px" }}>
      <div className="bg-white rounded-3xl p-8 shadow-xl w-full max-w-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-black"
            style={{ background: course.bg, color: course.color }}>{course.emoji}</div>
          <div>
            <div className="font-extrabold text-lg" style={{ color: course.color }}>{course.label}</div>
            <div className="text-xs opacity-60">Student Portal</div>
          </div>
        </div>

        <div className="flex rounded-full p-1 mb-5" style={{ background: "#F4F2FC" }}>
          {[