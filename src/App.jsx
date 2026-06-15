import { useState, useEffect, useCallback } from "react";
import { db } from "./firebase";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from "firebase/firestore";

/* ═══════════════════════════════════════════════════════════
   STORAGE SHIM → Firebase Firestore
   The app talks to window.storage (built for Claude artifacts).
   This maps those calls to Firestore so data is SHARED across
   all devices: every student the teacher sees, everywhere.

   Each storage key becomes one document in the "appdata"
   collection. Firestore keys can't contain "/", so we replace
   it. Values are stored as a JSON string in the `value` field
   to exactly match what the app already expects.
═══════════════════════════════════════════════════════════ */
const safeKey = (k) => k.replace(/\//g, "__");
if (typeof window !== "undefined") {
  window.storage = {
    async get(key) {
      const snap = await getDoc(doc(db, "appdata", safeKey(key)));
      if (!snap.exists()) throw new Error("not found");
      return { key, value: snap.data().value };
    },
    async set(key, value) {
      await setDoc(doc(db, "appdata", safeKey(key)), { value });
      return { key, value };
    },
    async delete(key) {
      await deleteDoc(doc(db, "appdata", safeKey(key)));
      return { key, deleted: true };
    },
    async list(prefix = "") {
      const snap = await getDocs(collection(db, "appdata"));
      const keys = [];
      snap.forEach((d) => { if (d.id.startsWith(safeKey(prefix))) keys.push(d.id); });
      return { keys, prefix };
    },
  };
}

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
      { id:"pa1",  topic:"Integers & Order of Operations", difficulty:"Easy",   question:"Evaluate:  3 + 4 × 2 − 1",                                        choices:["10","13","6","14"],        answer:0, hint:"Multiplication comes before addition. Do 4 × 2 first." },
      { id:"pa2",  topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate:  (5 + 3)² ÷ 4 − 6",                                      choices:["10","22","7","−6"],        answer:0, hint:"Parentheses first, then the exponent, then divide, then subtract." },
      { id:"pa3",  topic:"Integers & Order of Operations", difficulty:"Hard",   question:"Evaluate:  −3 × (−2)² + 4(−1 + 6) ÷ 2",                           choices:["−2","10","−10","2"],       answer:0, hint:"(−2)² = 4 (positive!). Then −3 × 4 = −12." },
      { id:"pa4",  topic:"Fractions & Decimals",           difficulty:"Easy",   question:"What is  3/4 + 1/4 ?",                                              choices:["1","4/8","1/2","2"],       answer:0, hint:"Same denominator — just add the numerators." },
      { id:"pa5",  topic:"Fractions & Decimals",           difficulty:"Medium", question:"Multiply:  2/3 × 3/8",                                              choices:["1/4","5/11","6/24","2/8"], answer:0, hint:"Multiply numerators, multiply denominators, then simplify." },
      { id:"pa6",  topic:"Ratios & Proportions",           difficulty:"Easy",   question:"A recipe uses 2 cups of sugar for 5 cups of flour. For 10 cups of flour, how many cups of sugar?", choices:["4","5","3","2"], answer:0, hint:"Set up a proportion: 2/5 = ?/10." },
      { id:"pa7",  topic:"Percents",                       difficulty:"Easy",   question:"What is 25% of 80?",                                                choices:["20","25","40","15"],       answer:0, hint:"25% = 0.25. Multiply 0.25 × 80." },
      { id:"pa8",  topic:"Percents",                       difficulty:"Hard",   question:"A shirt costs $40 and is marked up 35%. What is the new price?",    choices:["$54","$50","$48","$44"],   answer:0, hint:"Markup = 0.35 × 40 = $14. Add that to the original." },
      { id:"pa9",  topic:"Variables & Expressions",        difficulty:"Easy",   question:"Simplify:  4x + 3x − x",                                           choices:["6x","8x","7x","4x"],      answer:0, hint:"Combine like terms: 4 + 3 − 1 = ?" },
      { id:"pa10", topic:"Geometry Basics",                difficulty:"Medium", question:"Find the area of a rectangle with length 8 and width 5.",           choices:["40","26","13","80"],       answer:0, hint:"Area = length × width." },
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
      { id:"a1_1",  topic:"Linear Equations",         difficulty:"Easy",   question:"Solve for x:  2x + 5 = 13",                               choices:["x = 4","x = 9","x = 3","x = 6"],           answer:0, hint:"Subtract 5 from both sides, then divide by 2." },
      { id:"a1_2",  topic:"Linear Equations",         difficulty:"Medium", question:"Solve:  3(x − 2) = 4x + 1",                               choices:["x = −7","x = 7","x = 1","x = −1"],         answer:0, hint:"Distribute the 3 first, then collect x-terms on one side." },
      { id:"a1_3",  topic:"Linear Equations",         difficulty:"Hard",   question:"Solve:  (x + 3)/4 − (x − 1)/2 = 1",                       choices:["x = −3","x = 5","x = 3","x = −5"],         answer:0, hint:"Multiply every term by 4 to clear the denominators." },
      { id:"a1_4",  topic:"Systems of Equations",     difficulty:"Easy",   question:"Solve:  y = 2x + 1  and  y = x + 4",                      choices:["(3, 7)","(2, 5)","(1, 3)","(4, 9)"],       answer:0, hint:"Set the right sides equal and solve for x." },
      { id:"a1_5",  topic:"Systems of Equations",     difficulty:"Hard",   question:"Solve:  3x + 2y = 12  and  x − y = 1",                    choices:["(2, 3)","(3, 2)","(4, 0)","(1, 4)"],       answer:0, hint:"From the second equation, x = y + 1. Substitute." },
      { id:"a1_6",  topic:"Inequalities",             difficulty:"Easy",   question:"Solve:  −3x < 9",                                          choices:["x > −3","x < −3","x > 3","x < 3"],         answer:0, hint:"Dividing by a NEGATIVE flips the inequality sign." },
      { id:"a1_7",  topic:"Slope & Linear Functions", difficulty:"Easy",   question:"What is the slope of the line through (1, 2) and (3, 8)?", choices:["3","2","6","1/3"],                          answer:0, hint:"Slope = (y₂ − y₁)/(x₂ − x₁) = (8 − 2)/(3 − 1)." },
      { id:"a1_8",  topic:"Slope & Linear Functions", difficulty:"Medium", question:"Write the equation of the line with slope 2 through (1, 5).",choices:["y = 2x + 3","y = 2x + 5","y = 2x − 3","y = x + 3"], answer:0, hint:"Use point-slope form: y − y₁ = m(x − x₁)." },
      { id:"a1_9",  topic:"Exponents & Radicals",     difficulty:"Medium", question:"Simplify:  x³ · x⁵",                                      choices:["x⁸","x¹⁵","2x⁸","x²"],                    answer:0, hint:"When multiplying same bases, add the exponents." },
      { id:"a1_10", topic:"Intro to Polynomials",     difficulty:"Medium", question:"Expand:  (x + 3)(x − 5)",                                  choices:["x² − 2x − 15","x² + 2x − 15","x² − 15","x² − 2x + 15"], answer:0, hint:"FOIL: First, Outer, Inner, Last." },
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
      { id:"geo1",  topic:"Angles & Lines",        difficulty:"Easy",   question:"Two angles are supplementary. One measures 65°. What is the other?",                    choices:["115°","25°","90°","35°"],    answer:0, hint:"Supplementary angles add up to 180°." },
      { id:"geo2",  topic:"Angles & Lines",        difficulty:"Medium", question:"Two parallel lines are cut by a transversal. One co-interior angle is 72°. Find the other.", choices:["108°","72°","18°","90°"],    answer:0, hint:"Co-interior angles are supplementary: they add to 180°." },
      { id:"geo3",  topic:"Triangles",             difficulty:"Easy",   question:"A triangle has angles 45° and 80°. What is the third angle?",                           choices:["55°","45°","80°","35°"],     answer:0, hint:"All three angles add up to 180°." },
      { id:"geo4",  topic:"Triangles",             difficulty:"Hard",   question:"In a 30-60-90 triangle, the shortest side is 7. What is the hypotenuse?",               choices:["14","7√3","7√2","21"],       answer:0, hint:"The hypotenuse is exactly twice the shortest side." },
      { id:"geo5",  topic:"Circles",               difficulty:"Easy",   question:"What is the circumference of a circle with radius 6? (π ≈ 3.14)",                       choices:["37.68","18.84","113.04","28.26"], answer:0, hint:"C = 2πr" },
      { id:"geo6",  topic:"Circles",               difficulty:"Hard",   question:"An arc subtends 120° in a circle of radius 9. What is the arc length? (leave in terms of π)", choices:["6π","3π","9π","18π"],    answer:0, hint:"Arc length = (θ/360°) × 2πr." },
      { id:"geo7",  topic:"Area & Perimeter",      difficulty:"Easy",   question:"What is the area of a triangle with base 10 and height 6?",                             choices:["30","60","16","15"],         answer:0, hint:"A = ½ × base × height" },
      { id:"geo8",  topic:"Area & Perimeter",      difficulty:"Medium", question:"A square has perimeter 36. What is its area?",                                           choices:["81","36","72","9"],          answer:0, hint:"Find the side length first: 36 ÷ 4 = 9. Then square it." },
      { id:"geo9",  topic:"Volume & Surface Area", difficulty:"Medium", question:"Find the volume of a rectangular prism: length 5, width 3, height 4.",                  choices:["60","94","47","120"],        answer:0, hint:"V = l × w × h" },
      { id:"geo10", topic:"Coordinate Geometry",   difficulty:"Medium", question:"What is the distance between (1, 2) and (4, 6)?",                                       choices:["5","7","√7","4"],            answer:0, hint:"Distance = √((x₂−x₁)² + (y₂−y₁)²) = √(9 + 16)." },
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
      { id:"p1",  topic:"Quadratics",                         difficulty:"Easy",   question:"Solve for x:  x² − 5x + 6 = 0",                                        choices:["x = 2 or x = 3","x = −2 or x = −3","x = 1 or x = 6","x = −1 or x = −6"],    answer:0, hint:"Find two numbers that multiply to 6 and add to −5." },
      { id:"p2",  topic:"Quadratics",                         difficulty:"Medium", question:"What is the vertex of  y = 2(x − 3)² + 4 ?",                            choices:["(3, 4)","(−3, 4)","(3, −4)","(2, 3)"],                                       answer:0, hint:"Vertex form y = a(x − h)² + k has vertex (h, k)." },
      { id:"p9",  topic:"Quadratics",                         difficulty:"Hard",   question:"For what values of k does  x² + kx + 9 = 0  have exactly one real solution?", choices:["k = 6 or k = −6","k = 3 or k = −3","k = 9 only","k = 0 only"],        answer:0, hint:"Exactly one real solution ⟹ discriminant b² − 4ac = 0." },
      { id:"p3",  topic:"Polynomials",                        difficulty:"Medium", question:"What is the remainder when  x³ − 4x + 6  is divided by  (x − 2) ?",     choices:["6","0","2","10"],                                                             answer:0, hint:"Use the Remainder Theorem: plug in x = 2." },
      { id:"p10", topic:"Polynomials",                        difficulty:"Hard",   question:"Given (x + 1) is a factor of  x³ + 2x² − 5x − 6,  what are all the roots?", choices:["x = −1, 2, −3","x = 1, −2, 3","x = −1, −2, 3","x = −1 only"],        answer:0, hint:"Divide by (x + 1), then factor the resulting quadratic." },
      { id:"p16", topic:"Polynomials",                        difficulty:"Easy",   question:"What is the degree of  4x⁵ − 3x² + 7x − 1 ?",                           choices:["5","4","3","2"],                                                              answer:0, hint:"The degree is the highest exponent on x." },
      { id:"p4",  topic:"Logarithms",                         difficulty:"Easy",   question:"Evaluate:  log₂(32)",                                                    choices:["5","4","6","16"],                                                             answer:0, hint:"2 raised to what power gives 32?" },
      { id:"p5",  topic:"Logarithms",                         difficulty:"Medium", question:"Solve for x:  log(x) + log(x − 3) = 1",                                 choices:["x = 5","x = −2","x = 2","x = 10"],                                          answer:0, hint:"Combine the logs, then rewrite as a power of 10." },
      { id:"p11", topic:"Logarithms",                         difficulty:"Hard",   question:"Solve for x:  log₃(x) + log₃(x + 6) = 3",                              choices:["x = 3","x = −9","x = 9","x = 3 or x = −9"],                                answer:0, hint:"Combine into log₃(x(x + 6)) = 3, then check for extraneous solutions." },
      { id:"p6",  topic:"Rational Expressions",               difficulty:"Medium", question:"Simplify:  (x² − 9) / (x² + 5x + 6)",                                   choices:["(x − 3)/(x + 2)","(x + 3)/(x + 2)","(x − 3)/(x − 2)","(x − 9)/(x + 6)"], answer:0, hint:"Factor the top and bottom, then cancel." },
      { id:"p12", topic:"Rational Expressions",               difficulty:"Hard",   question:"Solve for x:  2/(x − 1) + 3/(x + 1) = 4/(x² − 1)",                     choices:["x = 3/5","x = 1","x = −1","x = 5/3"],                                       answer:0, hint:"x² − 1 = (x − 1)(x + 1). Multiply everything by that LCD." },
      { id:"p17", topic:"Parent Functions & Transformations", difficulty:"Easy",   question:"What is the parent function of  g(x) = (x − 2)² + 5 ?",                 choices:["y = x²","y = x","y = |x|","y = √x"],                                        answer:0, hint:"Strip away the shifts — what basic shape is left?" },
      { id:"p18", topic:"Parent Functions & Transformations", difficulty:"Easy",   question:"The graph of  y = |x|  is shifted 3 units RIGHT. What is the new equation?", choices:["y = |x − 3|","y = |x + 3|","y = |x| − 3","y = |x| + 3"],             answer:0, hint:"Horizontal shifts go inside — sign is opposite of what you'd expect." },
      { id:"p19", topic:"Parent Functions & Transformations", difficulty:"Medium", question:"How is  g(x) = −√x + 4  transformed from  y = √x ?",                    choices:["Reflected over x-axis, shifted up 4","Reflected over y-axis, shifted up 4","Reflected over x-axis, shifted right 4","Shifted down 4 only"], answer:0, hint:"The negative sign is OUTSIDE the radical, and so is the +4." },
      { id:"p20", topic:"Parent Functions & Transformations", difficulty:"Medium", question:"Describe all transformations of  g(x) = 2|x + 1| − 3  from  y = |x|.",  choices:["Vert. stretch ×2, left 1, down 3","Vert. stretch ×2, right 1, down 3","Vert. shrink ×½, left 1, down 3","Vert. stretch ×2, left 1, up 3"], answer:0, hint:"2 stretches, +1 inside moves left, −3 outside moves down." },
      { id:"p21", topic:"Parent Functions & Transformations", difficulty:"Hard",   question:"Reflect y = x³ over the x-axis, shift 2 right, then 5 up. What's the equation?", choices:["y = −(x − 2)³ + 5","y = (−x − 2)³ + 5","y = −(x + 2)³ + 5","y = −(x − 2)³ − 5"], answer:0, hint:"Reflection: − out front. Right 2: (x − 2). Up 5: +5 at end." },
      { id:"p22", topic:"Parent Functions & Transformations", difficulty:"Hard",   question:"(4, −2) is on  y = f(x). What point MUST be on  y = f(x − 3) + 6 ?",    choices:["(7, 4)","(1, 4)","(7, −8)","(1, −8)"],                                      answer:0, hint:"x − 3 shifts right 3 (x: 4→7) and +6 shifts up 6 (y: −2→4)." },
      { id:"r1",  topic:"Radicals & Radical Equations",       difficulty:"Easy",   question:"Simplify:  √72",                                                         choices:["6√2","8√2","3√8","36√2"],                                                    answer:0, hint:"72 = 36 × 2. Pull out the perfect square." },
      { id:"r2",  topic:"Radicals & Radical Equations",       difficulty:"Medium", question:"Solve:  √(2x + 1) = 5",                                                  choices:["x = 12","x = 24","x = 2","x = 13"],                                         answer:0, hint:"Square both sides: 2x + 1 = 25." },
      { id:"r3",  topic:"Radicals & Radical Equations",       difficulty:"Hard",   question:"Solve:  √(x + 3) = x − 3",                                               choices:["x = 6","x = 1 or x = 6","x = 1","No solution"],                            answer:0, hint:"Square both sides, then check for extraneous solutions." },
      { id:"e1",  topic:"Exponential Functions",              difficulty:"Easy",   question:"Which function represents exponential DECAY?",                           choices:["y = 3(0.5)ˣ","y = 0.5(3)ˣ","y = 3x²","y = 3ˣ"],                          answer:0, hint:"Decay means the base b satisfies 0 < b < 1." },
      { id:"e2",  topic:"Exponential Functions",              difficulty:"Medium", question:"A population of 500 doubles every 4 years. What is it after 12 years?",  choices:["4000","6000","2000","8000"],                                                 answer:0, hint:"Doubles 3 times: 500 × 2³." },
      { id:"e3",  topic:"Exponential Functions",              difficulty:"Hard",   question:"Solve for x:  4ˣ = 8",                                                   choices:["x = 3/2","x = 2","x = 4/8","x = 2/3"],                                     answer:0, hint:"Write both as powers of 2: (2²)ˣ = 2³, so 2x = 3." },
      { id:"p7",  topic:"Sequences & Series",                 difficulty:"Easy",   question:"What is the 10th term of  4, 7, 10, … ?",                               choices:["31","34","28","30"],                                                         answer:0, hint:"aₙ = a₁ + (n − 1)d, with d = 3." },
      { id:"p15", topic:"Sequences & Series",                 difficulty:"Medium", question:"What is the sum of the first 20 terms of  2 + 5 + 8 + … ?",             choices:["610","590","620","580"],                                                     answer:0, hint:"Sₙ = n/2 · (2a₁ + (n − 1)d)." },
      { id:"p13", topic:"Sequences & Series",                 difficulty:"Hard",   question:"Sum of infinite geometric series:  18 − 6 + 2 − 2/3 + … ?",            choices:["27/2","12","24","36"],                                                       answer:0, hint:"S = a₁/(1 − r). Here r = −1/3." },
      { id:"p8",  topic:"Complex Numbers",                    difficulty:"Medium", question:"Multiply:  (3 + 2i)(1 − 4i)",                                           choices:["11 − 10i","3 − 8i","11 + 10i","−5 − 10i"],                                  answer:0, hint:"FOIL it out and remember i² = −1." },
      { id:"p14", topic:"Complex Numbers",                    difficulty:"Hard",   question:"Simplify:  (2 + i) / (3 − i)",                                          choices:["(1 + i)/2","(5 + 5i)/8","(7 + i)/10","(1 − i)/2"],                         answer:0, hint:"Multiply top and bottom by the conjugate (3 + i)." },
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
  const id = p.get("course") || window.location.hash.replace("#","");
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
          {["login","register"].map(m => (
            <button key={m} onClick={() => { setMode(m); setErr(""); }}
              className="flex-1 py-1.5 rounded-full text-sm font-bold capitalize transition-all"
              style={{ background: mode === m ? course.color : "transparent", color: mode === m ? "#fff" : C.ink }}>
              {m === "login" ? "🔑 Log in" : "📝 Sign up"}
            </button>
          ))}
        </div>

        <div className="grid gap-3 mb-4">
          {mode === "register" && (
            <>
              <Input label="First Name" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Maria" />
              <Input label="Last Name" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Garcia" />
            </>
          )}
          <Input label="Username" value={username} onChange={e => setUsername(e.target.value)} placeholder="maria_garcia" />
          <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && action()} placeholder="••••" />
        </div>

        {err && <p className="text-xs font-bold mb-3 px-1" style={{ color: C.coral }}>⚠️ {err}</p>}

        <button onClick={action}
          className="w-full py-3 rounded-full font-extrabold text-white"
          style={{ background: `linear-gradient(135deg, ${course.color}, ${course.dark})` }}>
          {mode === "register" ? "Create account →" : "Log in →"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   STUDENT PRACTICE VIEW
═══════════════════════════════════════════════════════════ */
function StudentView({ course, student, problems, flags, onHelp, onPersistScore }) {
  const [topicFilter, setTopicFilter] = useState("All");
  const [diffFilter, setDiffFilter] = useState("All");
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [score, setScore] = useState(() => student.scores?.[course.id] || { right: 0, tried: 0, streak: 0 });
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpReason, setHelpReason] = useState(HELP_REASONS[0]);
  const [helpNote, setHelpNote] = useState("");
  const [helpSent, setHelpSent] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [scratchpadText, setScratchpadText] = useState("");
  const [timeRemaining, setTimeRemaining] = useState(null);
  const timerIntervalRef = useRef(null);

  const visible = problems.filter(
    p => (topicFilter === "All" || p.topic === topicFilter) && (diffFilter === "All" || p.difficulty === diffFilter)
  );
  const current = visible[Math.min(idx, Math.max(visible.length - 1, 0))];

  // Timer effect
  useEffect(() => {
    if (!current || picked !== null) return;
    const timeLimit = TIME_LIMITS[current.difficulty];
    setTimeRemaining(timeLimit);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) { clearInterval(timerIntervalRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [current?.id, picked]);

  const pick = (i) => {
    if (picked !== null) return;
    setPicked(i);
    const correct = i === current.answer;
    const next = { right: score.right + (correct?1:0), tried: score.tried + 1, streak: correct ? score.streak+1 : 0 };
    setScore(next);
    onPersistScore(next);
  };

  const next = () => { setPicked(null); setShowHint(false); setHelpSent(false); setIdx(i => (i+1) % Math.max(visible.length,1)); };

  const submitHelp = () => {
    onHelp({ problemId: current.id, reason: helpReason, note: helpNote.trim(), studentName: `${student.firstName} ${student.lastName}`, studentId: student.id });
    setHelpOpen(false); setHelpNote(""); setHelpReason(HELP_REASONS[0]); setHelpSent(true);
  };

  const ts = current ? topicStyleFor(course, current.topic) : {};
  const correctPct = score.tried > 0 ? Math.round((score.right / score.tried) * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Top bar: avatar + profile */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-3 items-center">
          {[
            { label: "Correct", value: score.right, color: C.teal, bg: C.mint },
            { label: "Tried",   value: score.tried, color: C.sky,  bg: "#E5F2FF" },
            { label: "Streak",  value: score.streak + (score.streak >= 3 ? " 🔥" : ""), color: C.coral, bg: C.blush },
          ].map(s => (
            <div key={s.label} className="rounded-2xl px-3 py-2 text-center" style={{ background: s.bg, minWidth: 64 }}>
              <div className="text-xl font-extrabold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs font-bold opacity-70">{s.label}</div>
            </div>
          ))}
        </div>
        <button onClick={() => setShowProfile(true)} className="flex items-center gap-2 rounded-2xl px-3 py-2"
          style={{ background: "#fff", boxShadow: "0 2px 8px #241F4E14" }}>
          <Avatar name={`${student.firstName} ${student.lastName}`} size={32} />
          <div className="text-left hidden sm:block">
            <div className="text-xs font-extrabold" style={{ color: C.ink }}>{student.firstName}</div>
            <div className="text-xs opacity-50">{correctPct}% accuracy</div>
          </div>
        </button>
      </div>

      {/* Topic chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
        <Chip label="All" icon="🌈" active={topicFilter === "All"} color={course.color} bg={course.bg}
          onClick={() => { setTopicFilter("All"); setIdx(0); setPicked(null); setShowHint(false); }} />
        {course.topics.map(t => (
          <Chip key={t.name} label={t.name} icon={t.icon} active={topicFilter === t.name} color={t.color} bg={t.bg}
            onClick={() => { setTopicFilter(t.name); setIdx(0); setPicked(null); setShowHint(false); }} />
        ))}
      </div>

      {/* Diff chips */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs font-extrabold opacity-40 uppercase tracking-wide">Level:</span>
        <Chip small label="Any" icon="🎲" active={diffFilter === "All"} color={C.ink} bg="#ECEAF6"
          onClick={() => { setDiffFilter("All"); setIdx(0); setPicked(null); setShowHint(false); }} />
        {[{d:"Easy",icon:"🌱",color:C.teal,bg:C.mint},{d:"Medium",icon:"⚡",color:C.orange,bg:C.cream},{d:"Hard",icon:"🌶️",color:C.coral,bg:C.blush}].map(x => (
          <Chip small key={x.d} label={x.d} icon={x.icon} active={diffFilter === x.d} color={x.color} bg={x.bg}
            onClick={() => { setDiffFilter(x.d); setIdx(0); setPicked(null); setShowHint(false); }} />
        ))}
      </div>

      {!current ? (
        <div className="rounded-3xl p-10 text-center bg-white shadow-lg">
          <div className="text-5xl mb-3">🪐</div>
          <p className="font-bold text-lg">No problems match these filters.</p>
          <p className="text-sm opacity-60 mt-1">Try another topic or level.</p>
        </div>
      ) : (
        <div className="rounded-3xl bg-white shadow-lg overflow-hidden" style={{ border:`3px solid ${ts.color}22` }}>
          <div className="px-5 py-3 flex items-center justify-between flex-wrap gap-2" style={{ background: ts.bg }}>
            <div className="flex items-center gap-2">
              <span className="text-lg">{ts.icon}</span>
              <span className="font-extrabold text-sm" style={{ color: ts.color }}>{current.topic}</span>
              <DiffBadge level={current.difficulty} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold opacity-60">Problem {visible.indexOf(current)+1} of {visible.length}</span>
              {timeRemaining !== null && (
                <div className="text-sm font-extrabold px-3 py-1 rounded-full" style={{background:timeRemaining<=10?C.blush:C.cream,color:timeRemaining<=10?C.coral:"#7A5C08"}}>
                  ⏱️ {timeRemaining}s
                </div>
              )}
            </div>
          </div>
          <div className="p-5 sm:p-7">
            <p className="text-lg sm:text-xl font-bold leading-relaxed mb-5">{current.question}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {current.choices.map((c, i) => {
                const isPicked = picked === i, isRight = i === current.answer;
                let bg = "#F4F2FC", border = "transparent", col = C.ink;
                if (picked !== null) {
                  if (isRight)  { bg = C.mint;  border = C.teal;  col = "#0E7E69"; }
                  else if (isPicked) { bg = C.blush; border = C.coral; col = "#C2374B"; }
                  else { bg = "#F7F6FB"; col = "#9A95B8"; }
                }
                return (
                  <button key={i} onClick={() => pick(i)}
                    className="rounded-2xl px-4 py-3.5 text-left font-semibold transition-all"
                    style={{ background:bg, border:`2.5px solid ${border}`, color:col, cursor:picked===null?"pointer":"default" }}>
                    <span className="inline-flex w-6 h-6 rounded-full items-center justify-center text-xs font-extrabold mr-2 align-middle"
                      style={{ background: picked!==null&&isRight ? C.teal : course.color, color:"#fff" }}>
                      {String.fromCharCode(65+i)}
                    </span>
                    {c}{picked!==null&&isRight&&" ✓"}{picked!==null&&isPicked&&!isRight&&" ✗"}
                  </button>
                );
              })}
            </div>
            {picked !== null && (
              <div className="mt-4 rounded-2xl px-4 py-3 font-bold text-center"
                style={picked===current.answer ? {background:C.mint,color:"#0E7E69"} : {background:C.blush,color:"#C2374B"}}>
                {picked===current.answer ? ["Nailed it! 🎉","You're on fire! 🔥","Correct — nice work! ⭐"][score.right%3] : "Not quite — check the green answer above."}
              </div>
            )}
            {current.hint && (
              <div className="mt-4">
                {!showHint
                  ? <button onClick={() => setShowHint(true)} className="text-sm font-bold px-3 py-1.5 rounded-full" style={{background:C.cream,color:"#B07407"}}>💡 Show hint</button>
                  : <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{background:C.cream,color:"#8A5E06"}}>💡 {current.hint}</div>
                }
              </div>
            )}
            <div className="mt-4 flex gap-2 flex-wrap">
              <button onClick={() => setShowScratchpad(true)} className="text-sm font-bold px-3 py-1.5 rounded-full" style={{background:"#E2FAF4",color:C.teal}}>📝 Scratchpad</button>
            </div>
            <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
              <div>
                {helpSent
                  ? <span className="text-sm font-bold" style={{color:C.teal}}>✓ Help request sent!</span>
                  : <button onClick={() => setHelpOpen(true)} className="text-sm font-bold px-3 py-2 rounded-full" style={{background:"#E5F2FF",color:C.sky}}>🙋 Ask my teacher for help</button>
                }
              </div>
              <button onClick={next} className="px-6 py-2.5 rounded-full font-extrabold text-white shadow-md active:scale-95 transition-transform"
                style={{background:`linear-gradient(135deg, ${course.color}, ${course.dark})`}}>Next →</button>
            </div>
          </div>
        </div>
      )}

      {/* Help modal */}
      {helpOpen && current && (
        <Modal onClose={() => setHelpOpen(false)}>
          <h3 className="text-lg font-extrabold mb-1">🙋 Ask for help</h3>
          <p className="text-sm opacity-60 mb-4">What's tripping you up? Your teacher will see this question and your message.</p>
          <div className="grid gap-2 mb-4">
            {HELP_REASONS.map(r => (
              <button key={r} onClick={() => setHelpReason(r)}
                className="rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition-all"
                style={{background:helpReason===r?"#E5F2FF":"#F4F2FC",border:`2px solid ${helpReason===r?C.sky:"transparent"}`,color:helpReason===r?C.sky:C.ink}}>
                {r}
              </button>
            ))}
          </div>
          <textarea value={helpNote} onChange={e => setHelpNote(e.target.value)}
            placeholder="Tell your teacher what you tried (optional)…" rows={2}
            className="w-full rounded-xl px-4 py-3 text-sm font-medium mb-4 outline-none"
            style={{background:"#F4F2FC",border:`2px solid ${C.lavender}`}} />
          <div className="flex gap-3">
            <button onClick={() => setHelpOpen(false)} className="flex-1 py-2.5 rounded-full font-bold" style={{background:"#F4F2FC"}}>Cancel</button>
            <button onClick={submitHelp} className="flex-1 py-2.5 rounded-full font-extrabold text-white" style={{background:C.sky}}>Send to teacher</button>
          </div>
        </Modal>
      )}

      {/* Profile modal */}
      {showProfile && (
        <Modal onClose={() => setShowProfile(false)}>
          <div className="text-center mb-4">
            <Avatar name={`${student.firstName} ${student.lastName}`} size={64} />
            <h3 className="text-xl font-extrabold mt-3">{student.firstName} {student.lastName}</h3>
            <p className="text-sm opacity-50">@{student.username} · joined {student.joinedAt}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: "Correct", value: score.right, color: C.teal, bg: C.mint },
              { label: "Tried",   value: score.tried, color: C.sky,  bg: "#E5F2FF" },
              { label: "Accuracy",value: score.tried > 0 ? correctPct + "%" : "—", color: C.violet, bg: C.lavender },
            ].map(s => (
              <div key={s.label} className="rounded-2xl p-3 text-center" style={{background:s.bg}}>
                <div className="text-2xl font-extrabold" style={{color:s.color}}>{s.value}</div>
                <div className="text-xs font-bold opacity-60">{s.label}</div>
              </div>
            ))}
          </div>
          <button onClick={() => setShowProfile(false)} className="w-full py-2.5 rounded-full font-bold" style={{background:"#F4F2FC"}}>Close</button>
        </Modal>
      )}

      {/* Scratchpad modal */}
      {showScratchpad && (
        <Modal onClose={() => setShowScratchpad(false)}>
          <h3 className="text-lg font-extrabold mb-1">📝 Scratch Pad</h3>
          <p className="text-sm opacity-60 mb-3">Show your work here. Your teacher can see what you write.</p>
          <textarea value={scratchpadText} onChange={e => setScratchpadText(e.target.value)}
            placeholder="Write your calculations, notes, and working here..." rows={6}
            className="w-full rounded-xl px-4 py-3 text-sm font-medium mb-3 outline-none"
            style={{background:"#F4F2FC",border:`2px solid ${C.lavender}`}} />
          <div className="flex gap-2">
            <button onClick={() => { setScratchpadText(""); setShowScratchpad(false); }} className="flex-1 py-2.5 rounded-full font-bold text-sm" style={{background:C.blush,color:C.coral}}>Clear</button>
            <button onClick={() => setShowScratchpad(false)} className="flex-1 py-2.5 rounded-full font-extrabold text-white text-sm" style={{background:C.teal}}>Done</button>
          </div>
          <p className="text-xs opacity-50 text-center mt-3">Your work is saved on this question.</p>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TEACHER DASHBOARD
═══════════════════════════════════════════════════════════ */
function TeacherDashboard({ courseId, problems, flags, onAddProblem, onDeleteProblem, onResolveFlag, onBack }) {
  const course = COURSES[courseId];
  const openFlags = flags.filter(f => !f.resolved);
  const [tab, setTab] = useState("students");
  const [students, setStudents] = useState({});
  const [form, setForm] = useState({ topic: course.topics[0].name, difficulty: "Easy", question: "", choices:["","","",""], answer:0, hint:"" });
  const [formMsg, setFormMsg] = useState("");
  const [settings, setSettings] = useState({ teacherPin: TEACHER_PIN });
  const [pinInput, setPinInput] = useState("");
  const [pinMsg, setPinMsg] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try { const r = await window.storage.get(KEYS.students, true); setStudents(JSON.parse(r.value)); } catch {}
      try { const r = await window.storage.get(KEYS.settings, true); setSettings(JSON.parse(r.value)); } catch {}
    })();
  }, []);

  const persistStudents = async (s) => {
    await window.storage.set(KEYS.students, JSON.stringify(s), true);
    setStudents(s);
  };

  const toggleAccess = async (studentId) => {
    const s = { ...students };
    const profile = { ...s[studentId] };
    const revoked = profile.accessRevoked || [];
    if (revoked.includes(courseId)) {
      profile.accessRevoked = revoked.filter(c => c !== courseId);
    } else {
      profile.accessRevoked = [...revoked, courseId];
    }
    s[studentId] = profile;
    await persistStudents(s);
  };

  const savePin = async () => {
    if (pinInput.length < 4) return setPinMsg("PIN must be at least 4 characters.");
    const next = { ...settings, teacherPin: pinInput };
    await window.storage.set(KEYS.settings, JSON.stringify(next), true);
    setSettings(next); setPinInput(""); setPinMsg("PIN updated! ✅");
  };

  const enrolledStudents = Object.values(students).filter(s => s.enrolledCourses?.includes(courseId));

  const addProblem = () => {
    if (!form.question.trim() || form.choices.some(c => !c.trim())) { setFormMsg("Fill in the question and all four choices."); return; }
    onAddProblem({ ...form, id: "t" + Date.now(), question: form.question.trim(), choices: form.choices.map(c => c.trim()), hint: form.hint.trim() });
    setForm({ topic: course.topics[0].name, difficulty: "Easy", question: "", choices:["","","",""], answer:0, hint:"" });
    setFormMsg("Problem published! ✅");
  };

  const courseURL = buildCourseURL(courseId);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Tab bar */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { id:"students", label:`👩‍🎓 Students (${enrolledStudents.length})` },
          { id:"problems", label:`📚 Problems (${problems.length})` },
          { id:"add",      label:"➕ Add problem" },
          { id:"help",     label:`🙋 Help${openFlags.length ? ` (${openFlags.length})` : ""}` },
          { id:"settings", label:"⚙️ Settings" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="px-4 py-2 rounded-full text-sm font-bold transition-all"
            style={{background:tab===t.id?C.ink:"#fff", color:tab===t.id?"#fff":C.ink, boxShadow:"0 2px 8px #241F4E14"}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Students ── */}
      {tab === "students" && (
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-base font-extrabold">Enrolled Students</h2>
            <button onClick={() => { navigator.clipboard.writeText(courseURL); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="text-xs font-extrabold px-3 py-1.5 rounded-full transition-all"
              style={{background:copied?C.mint:course.bg, color:copied?"#0E7E69":course.color}}>
              {copied ? "✓ Link copied!" : "📋 Copy student link"}
            </button>
          </div>
          {enrolledStudents.length === 0 && (
            <div className="rounded-3xl p-10 text-center bg-white shadow-lg">
              <div className="text-5xl mb-3">👋</div>
              <p className="font-bold">No students yet.</p>
              <p className="text-sm opacity-60 mt-1">Share the student link and they'll appear here after signing up.</p>
            </div>
          )}
          <div className="grid gap-3">
            {enrolledStudents.map(s => {
              const revoked = s.accessRevoked?.includes(courseId);
              const sc = s.scores?.[courseId] || { right:0, tried:0 };
              const pct = sc.tried > 0 ? Math.round((sc.right/sc.tried)*100) : null;
              return (
                <div key={s.id} className="bg-white rounded-2xl p-4 shadow-md flex items-center gap-3"
                  style={{borderLeft:`5px solid ${revoked ? C.coral : course.color}`, opacity: revoked ? 0.7 : 1}}>
                  <Avatar name={`${s.firstName} ${s.lastName}`} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-sm flex items-center gap-2 flex-wrap">
                      {s.firstName} {s.lastName}
                      {revoked && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:C.blush,color:C.coral}}>Access revoked</span>}
                    </div>
                    <div className="text-xs opacity-50">@{s.username} · joined {s.joinedAt}</div>
                    <div className="flex gap-3 mt-1 text-xs font-bold">
                      <span style={{color:C.teal}}>{sc.right} correct</span>
                      <span style={{color:C.sky}}>{sc.tried} tried</span>
                      {pct !== null && <span style={{color:C.violet}}>{pct}% accuracy</span>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button onClick={() => setSelectedStudent(s)}
                      className="text-xs font-bold px-3 py-1.5 rounded-full"
                      style={{background:course.bg, color:course.color}}>
                      Profile
                    </button>
                    <button onClick={() => toggleAccess(s.id)}
                      className="text-xs font-bold px-3 py-1.5 rounded-full"
                      style={{background:revoked?C.mint:C.blush, color:revoked?"#0E7E69":C.coral}}>
                      {revoked ? "✓ Restore" : "Revoke"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Problems ── */}
      {tab === "problems" && (
        <div className="grid gap-3">
          {problems.length === 0 && <div className="rounded-3xl p-10 text-center bg-white shadow-lg"><div className="text-5xl mb-3">📝</div><p className="font-bold">No problems yet.</p></div>}
          {problems.map(p => {
            const ts = topicStyleFor(course, p.topic);
            const fc = flags.filter(f => f.problemId === p.id && !f.resolved).length;
            return (
              <div key={p.id} className="bg-white rounded-2xl p-4 shadow-md flex items-start gap-3" style={{borderLeft:`5px solid ${ts.color}`}}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-extrabold" style={{color:ts.color}}>{ts.icon} {p.topic}</span>
                    <DiffBadge level={p.difficulty} />
                    {fc > 0 && <span className="text-xs font-extrabold px-2 py-0.5 rounded-full" style={{background:"#E5F2FF",color:C.sky}}>🙋 {fc} asking for help</span>}
                  </div>
                  <p className="font-semibold text-sm">{p.question}</p>
                  <p className="text-xs mt-1" style={{color:C.teal}}>✓ {p.choices[p.answer]}</p>
                </div>
                <button onClick={() => onDeleteProblem(p.id)} className="text-xs font-bold px-3 py-1.5 rounded-full shrink-0" style={{background:C.blush,color:C.coral}}>Delete</button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add problem ── */}
      {tab === "add" && (
        <div className="bg-white rounded-3xl p-6 shadow-lg">
          <h2 className="text-lg font-extrabold mb-4">New problem ✏️</h2>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <label className="text-sm font-bold">Topic
              <select value={form.topic} onChange={e => setForm({...form,topic:e.target.value})}
                className="mt-1 w-full rounded-xl px-3 py-2.5 font-semibold outline-none"
                style={{background:"#F4F2FC",border:`2px solid ${C.lavender}`}}>
                {course.topics.map(t => <option key={t.name}>{t.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-bold">Difficulty
              <select value={form.difficulty} onChange={e => setForm({...form,difficulty:e.target.value})}
                className="mt-1 w-full rounded-xl px-3 py-2.5 font-semibold outline-none"
                style={{background:"#F4F2FC",border:`2px solid ${C.lavender}`}}>
                <option>Easy</option><option>Medium</option><option>Hard</option>
              </select>
            </label>
          </div>
          <label className="text-sm font-bold block mb-3">Question
            <textarea value={form.question} onChange={e => setForm({...form,question:e.target.value})} rows={2}
              placeholder="Type your question here…"
              className="mt-1 w-full rounded-xl px-4 py-3 font-semibold outline-none"
              style={{background:"#F4F2FC",border:`2px solid ${C.lavender}`}} />
          </label>
          <p className="text-sm font-bold mb-1">Choices <span className="font-normal opacity-50">— tap a letter to mark it correct</span></p>
          <div className="grid gap-2 mb-3">
            {form.choices.map((c,i) => (
              <div key={i} className="flex items-center gap-2">
                <button onClick={() => setForm({...form,answer:i})}
                  className="w-8 h-8 rounded-full font-extrabold text-sm shrink-0 transition-all"
                  style={{background:form.answer===i?course.color:"#F4F2FC",color:form.answer===i?"#fff":C.ink,border:`2px solid ${form.answer===i?course.color:C.lavender}`}}>
                  {String.fromCharCode(65+i)}
                </button>
                <input value={c} onChange={e => { const ch=[...form.choices]; ch[i]=e.target.value; setForm({...form,choices:ch}); }}
                  placeholder={`Choice ${String.fromCharCode(65+i)}`}
                  className="flex-1 rounded-xl px-4 py-2.5 font-semibold outline-none"
                  style={{background:"#F4F2FC",border:`2px solid ${C.lavender}`}} />
              </div>
            ))}
          </div>
          <label className="text-sm font-bold block mb-4">Hint <span className="font-normal opacity-50">(optional)</span>
            <input value={form.hint} onChange={e => setForm({...form,hint:e.target.value})} placeholder="A nudge in the right direction…"
              className="mt-1 w-full rounded-xl px-4 py-2.5 font-semibold outline-none"
              style={{background:"#F4F2FC",border:`2px solid ${C.lavender}`}} />
          </label>
          <button onClick={addProblem}
            className="w-full py-3 rounded-full font-extrabold text-white shadow-md active:scale-95 transition-transform"
            style={{background:`linear-gradient(135deg, ${course.color}, ${course.dark})`}}>
            Publish 🚀
          </button>
          {formMsg && <p className="mt-3 text-sm font-bold text-center" style={{color:formMsg.includes("✅")?C.teal:C.coral}}>{formMsg}</p>}
        </div>
      )}

      {/* ── Help requests ── */}
      {tab === "help" && (
        <div className="grid gap-3">
          {openFlags.length === 0 && <div className="rounded-3xl p-10 text-center bg-white shadow-lg"><div className="text-5xl mb-3">🎉</div><p className="font-bold">No open help requests!</p></div>}
          {openFlags.map(f => {
            const p = problems.find(x => x.id === f.problemId);
            return (
              <div key={f.id} className="bg-white rounded-2xl p-4 shadow-md" style={{borderLeft:`5px solid ${C.sky}`}}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {f.studentName && (
                    <div className="flex items-center gap-1.5">
                      <Avatar name={f.studentName} size={22} />
                      <span className="text-xs font-extrabold" style={{color:C.ink}}>{f.studentName}</span>
                    </div>
                  )}
                  <span className="text-xs font-extrabold px-2 py-0.5 rounded-full" style={{background:"#E5F2FF",color:C.sky}}>🙋 {f.reason}</span>
                  <span className="text-xs opacity-50 font-semibold">{f.date}</span>
                </div>
                <p className="font-semibold text-sm mb-1">{p ? p.question : "(problem was deleted)"}</p>
                {f.note && <p className="text-sm italic opacity-70 mb-2">"{f.note}"</p>}
                <div className="flex gap-2 mt-2">
                  <button onClick={() => onResolveFlag(f.id)} className="text-xs font-extrabold px-3 py-1.5 rounded-full" style={{background:C.mint,color:"#0E7E69"}}>✓ Mark as helped</button>
                  {p && <button onClick={() => onDeleteProblem(p.id)} className="text-xs font-extrabold px-3 py-1.5 rounded-full" style={{background:C.blush,color:C.coral}}>Delete problem</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Settings ── */}
      {tab === "settings" && (
        <div className="grid gap-4">
          <div className="bg-white rounded-2xl p-5 shadow-md">
            <h3 className="font-extrabold mb-3">🔐 Change Teacher PIN</h3>
            <p className="text-sm opacity-60 mb-3">Current PIN is hidden. Enter a new one to replace it.</p>
            <div className="flex gap-2">
              <input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)} placeholder="New PIN (min 4 chars)"
                className="flex-1 rounded-xl px-4 py-2.5 font-semibold outline-none"
                style={{background:"#F4F2FC",border:`2px solid ${C.lavender}`}} />
              <button onClick={savePin} className="px-4 py-2.5 rounded-xl font-extrabold text-white"
                style={{background:C.violet}}>Save</button>
            </div>
            {pinMsg && <p className="text-xs font-bold mt-2" style={{color:pinMsg.includes("✅")?C.teal:C.coral}}>{pinMsg}</p>}
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-md">
            <h3 className="font-extrabold mb-1">📋 Student Link</h3>
            <p className="text-sm opacity-60 mb-3">Share this link with students enrolled in {course.label}.</p>
            <div className="rounded-xl px-4 py-3 text-xs font-bold break-all mb-3" style={{background:"#F4F2FC",color:C.violet}}>
              {buildCourseURL(courseId)}
            </div>
            <button onClick={() => { navigator.clipboard.writeText(buildCourseURL(courseId)); setCopied(true); setTimeout(()=>setCopied(false),2000); }}
              className="text-sm font-extrabold px-4 py-2 rounded-full"
              style={{background:copied?C.mint:course.bg, color:copied?"#0E7E69":course.color}}>
              {copied ? "✓ Copied!" : "📋 Copy link"}
            </button>
          </div>
        </div>
      )}

      {/* Student profile modal */}
      {selectedStudent && (
        <Modal onClose={() => setSelectedStudent(null)}>
          <div className="text-center mb-4">
            <Avatar name={`${selectedStudent.firstName} ${selectedStudent.lastName}`} size={64} />
            <h3 className="text-xl font-extrabold mt-3">{selectedStudent.firstName} {selectedStudent.lastName}</h3>
            <p className="text-sm opacity-50 mb-1">@{selectedStudent.username}</p>
            <p className="text-xs opacity-40">Joined {selectedStudent.joinedAt}</p>
          </div>
          {(() => {
            const sc = selectedStudent.scores?.[courseId] || {right:0,tried:0,streak:0};
            const pct = sc.tried > 0 ? Math.round((sc.right/sc.tried)*100) : null;
            const revoked = selectedStudent.accessRevoked?.includes(courseId);
            return (
              <>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    {label:"Correct",value:sc.right,color:C.teal,bg:C.mint},
                    {label:"Tried",value:sc.tried,color:C.sky,bg:"#E5F2FF"},
                    {label:"Accuracy",value:pct!==null?pct+"%":"—",color:C.violet,bg:C.lavender},
                  ].map(s => (
                    <div key={s.label} className="rounded-2xl p-3 text-center" style={{background:s.bg}}>
                      <div className="text-2xl font-extrabold" style={{color:s.color}}>{s.value}</div>
                      <div className="text-xs font-bold opacity-60">{s.label}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 mb-2">
                  <button onClick={() => { toggleAccess(selectedStudent.id); setSelectedStudent(prev => ({ ...prev, accessRevoked: revoked ? (prev.accessRevoked||[]).filter(c=>c!==courseId) : [...(prev.accessRevoked||[]),courseId] })); }}
                    className="flex-1 py-2.5 rounded-full font-extrabold"
                    style={{background:revoked?C.mint:C.blush, color:revoked?"#0E7E69":C.coral}}>
                    {revoked ? "✓ Restore Access" : "🚫 Revoke Access"}
                  </button>
                  <button onClick={() => setSelectedStudent(null)} className="flex-1 py-2.5 rounded-full font-bold" style={{background:"#F4F2FC"}}>Close</button>
                </div>
                {revoked && <p className="text-xs text-center opacity-60">This student cannot log in until access is restored.</p>}
              </>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   COURSE PLATFORM  (orchestrates student/teacher views)
═══════════════════════════════════════════════════════════ */
function CoursePlatform({ courseId, onBack }) {
  const course = COURSES[courseId];
  const STORE = KEYS.course(courseId);

  const [role, setRole] = useState(null);            // null = choose, student, teacher
  const [teacherUnlocked, setTeacherUnlocked] = useState(false);
  const [student, setStudent] = useState(null);

  const [problems, setProblems] = useState([]);
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORE, true);
        const data = JSON.parse(r.value);
        const stored = data.problems || [];
        const have = new Set(stored.map(p => p.id));
        const merged = [...stored, ...course.seeds.filter(p => !have.has(p.id))];
        setProblems(merged); setFlags(data.flags || []);
        if (merged.length !== stored.length)
          await window.storage.set(STORE, JSON.stringify({problems:merged,flags:data.flags||[]}), true);
      } catch {
        setProblems(course.seeds); setFlags([]);
        try { await window.storage.set(STORE, JSON.stringify({problems:course.seeds,flags:[]}), true); } catch {}
      } finally { setLoading(false); }
    })();
  }, [courseId]);

  const persist = useCallback(async (np, nf) => {
    try { setSaveError(false); await window.storage.set(STORE, JSON.stringify({problems:np,flags:nf}), true); }
    catch { setSaveError(true); }
  }, [STORE]);

  const addProblem = (p) => { const np = [...problems, p]; setProblems(np); persist(np, flags); };
  const deleteProblem = (pid) => {
    const np = problems.filter(p => p.id !== pid);
    const nf = flags.filter(f => f.problemId !== pid);
    setProblems(np); setFlags(nf); persist(np, nf);
  };
  const resolveFlag = (fid) => {
    const nf = flags.map(f => f.id===fid ? {...f,resolved:true} : f);
    setFlags(nf); persist(problems, nf);
  };
  const addHelp = (helpData) => {
    const f = { id:"f"+Date.now(), ...helpData, date: new Date().toLocaleDateString(), resolved: false };
    const nf = [...flags, f];
    setFlags(nf); persist(problems, nf);
    // Also increment helpRequests on student
    (async () => {
      try {
        const r = await window.storage.get(KEYS.students, true);
        const all = JSON.parse(r.value);
        if (all[helpData.studentId]) {
          all[helpData.studentId].helpRequests = (all[helpData.studentId].helpRequests || 0) + 1;
          await window.storage.set(KEYS.students, JSON.stringify(all), true);
        }
      } catch {}
    })();
  };
  const persistScore = useCallback(async (studentId, sc) => {
    try {
      const r = await window.storage.get(KEYS.students, true);
      const all = JSON.parse(r.value);
      if (all[studentId]) {
        all[studentId].scores = { ...(all[studentId].scores||{}), [courseId]: sc };
        await window.storage.set(KEYS.students, JSON.stringify(all), true);
      }
    } catch {}
  }, [courseId]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{background:C.paper}}>
      <div className="text-center"><div className="text-5xl mb-3 animate-bounce">{course.emoji}</div>
        <p className="font-bold" style={{color:course.color}}>Loading {course.label}…</p></div>
    </div>
  );

  // Role picker
  if (!role) return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{background:course.bg, backgroundImage:`linear-gradient(${C.lavender}55 1px,transparent 1px),linear-gradient(90deg,${C.lavender}55 1px,transparent 1px)`, backgroundSize:"28px 28px"}}>
      <div className="bg-white rounded-3xl p-8 shadow-xl w-full max-w-sm text-center">
        {onBack && <button onClick={onBack} className="text-xs font-bold mb-4 block mx-auto px-3 py-1 rounded-full" style={{background:"#F4F2FC"}}>← All courses</button>}
        <div className="w-16 h-16 rounded-2xl mx-auto mb-3 flex items-center justify-center text-3xl font-black" style={{background:course.bg,color:course.color}}>{course.emoji}</div>
        <h2 className="text-xl font-extrabold mb-1" style={{color:course.color}}>{course.label}</h2>
        <p className="text-sm opacity-60 mb-6">Who are you?</p>
        <div className="grid gap-3">
          <button onClick={() => setRole("student")}
            className="w-full py-3.5 rounded-2xl font-extrabold text-white text-base"
            style={{background:`linear-gradient(135deg, ${course.color}, ${course.dark})`}}>
            🎓 I'm a Student
          </button>
          <button onClick={() => setRole("teacher")}
            className="w-full py-3.5 rounded-2xl font-extrabold text-base"
            style={{background:C.cream, color:"#7A5C08"}}>
            🍎 I'm the Teacher
          </button>
        </div>
      </div>
    </div>
  );

  // Teacher PIN gate
  if (role === "teacher" && !teacherUnlocked)
    return <TeacherPinGate onUnlock={() => setTeacherUnlocked(true)} />;

  // Student auth
  if (role === "student" && !student)
    return <StudentAuth courseId={courseId} onLogin={setStudent} />;

  return (
    <div className="min-h-screen" style={{backgroundImage:`linear-gradient(${C.lavender}66 1px,transparent 1px),linear-gradient(90deg,${C.lavender}66 1px,transparent 1px)`,backgroundSize:"28px 28px",backgroundColor:C.paper,fontFamily:"'Trebuchet MS', system-ui, sans-serif",color:C.ink}}>
      {/* Header */}
      <header className="px-4 py-3 sm:px-8 flex flex-wrap items-center gap-3 justify-between" style={{background:C.ink}}>
        <div className="flex items-center gap-3">
          <button onClick={() => { setRole(null); setTeacherUnlocked(false); setStudent(null); }}
            className="text-xs font-bold px-2 py-1 rounded-lg" style={{background:"#ffffff22",color:"#fff"}}>←</button>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-xl"
            style={{background:`linear-gradient(135deg,${course.color},${course.dark})`,color:"#fff"}}>
            {course.emoji}
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-white leading-tight">{course.label}</h1>
            <p className="text-xs" style={{color:C.sunny}}>{role === "teacher" ? "Teacher Dashboard" : `Welcome, ${student?.firstName}!`}</p>
          </div>
        </div>
        {role === "student" && student && (
          <div className="flex items-center gap-2">
            <Avatar name={`${student.firstName} ${student.lastName}`} size={32} />
            <span className="text-sm font-bold text-white hidden sm:block">{student.firstName}</span>
          </div>
        )}
        {role === "teacher" && (
          <span className="text-xs font-bold px-3 py-1 rounded-full" style={{background:"#ffffff22",color:C.sunny}}>🍎 Teacher</span>
        )}
      </header>

      {saveError && <div className="px-4 py-2 text-sm font-semibold text-center" style={{background:C.blush,color:C.coral}}>Couldn't save — please try again.</div>}

      {role === "student" && student && (
        <StudentView
          course={course} student={student} problems={problems} flags={flags}
          onHelp={addHelp}
          onPersistScore={(sc) => persistScore(student.id, sc)}
        />
      )}
      {role === "teacher" && (
        <TeacherDashboard
          courseId={courseId} problems={problems} flags={flags}
          onAddProblem={addProblem} onDeleteProblem={deleteProblem} onResolveFlag={resolveFlag}
          onBack={() => setRole(null)}
        />
      )}

      <footer className="text-center text-xs font-semibold pb-6 opacity-40 pt-4">
        {course.label} · Math Arcade 🎓
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   COURSE LANDING  (teacher portal)
═══════════════════════════════════════════════════════════ */
function CourseLanding({ onSelect }) {
  const [copied, setCopied] = useState(null);
  return (
    <div className="min-h-screen" style={{backgroundColor:C.paper,backgroundImage:`linear-gradient(${C.lavender}66 1px,transparent 1px),linear-gradient(90deg,${C.lavender}66 1px,transparent 1px)`,backgroundSize:"28px 28px"}}>
      <header className="px-6 py-5 flex items-center gap-3" style={{background:C.ink}}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl font-black text-white" style={{background:`linear-gradient(135deg,${C.violet},${C.coral})`}}>M</div>
        <div>
          <h1 className="text-xl font-extrabold text-white">Math Arcade</h1>
          <p className="text-xs" style={{color:C.sunny}}>Teacher hub — open a course or share its link with students</p>
        </div>
      </header>
      <main className="max-w-2xl mx-auto w-full px-4 py-8">
        <h2 className="text-2xl font-extrabold mb-2" style={{color:C.ink}}>Your Courses</h2>
        <p className="text-sm opacity-60 mb-6">Each course has its own student link. Students who open that link sign up and only see that course.</p>
        <div className="grid gap-4">
          {Object.values(COURSES).map(course => {
            const url = buildCourseURL(course.id);
            const key = `c-${course.id}`;
            return (
              <div key={course.id} className="bg-white rounded-2xl p-5 shadow-md flex items-center gap-4" style={{borderLeft:`5px solid ${course.color}`}}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-black shrink-0" style={{background:course.bg,color:course.color}}>{course.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-base" style={{color:course.color}}>{course.label}</div>
                  <div className="text-xs opacity-50 font-semibold truncate">{url}</div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button onClick={() => { navigator.clipboard.writeText(url); setCopied(key); setTimeout(()=>setCopied(null),2000); }}
                    className="text-xs font-extrabold px-3 py-1.5 rounded-full transition-all"
                    style={{background:copied===key?C.mint:course.bg, color:copied===key?"#0E7E69":course.color}}>
                    {copied===key ? "✓ Copied!" : "📋 Copy link"}
                  </button>
                  <button onClick={() => onSelect(course.id)} className="text-xs font-extrabold px-3 py-1.5 rounded-full text-white" style={{background:course.color}}>Open →</button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-8 rounded-2xl p-5 text-sm font-semibold" style={{background:C.cream,color:"#7A5C08"}}>
          <strong>How it works:</strong> copy a course link → share it in Google Classroom or email → students sign up with a username & password and land directly in that course. You can grant or revoke access per student from the Teacher Dashboard.
        </div>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   APP ROOT
═══════════════════════════════════════════════════════════ */
export default function App() {
  const [courseId, setCourseId] = useState(() => getCourseFromURL());

  const selectCourse = (id) => { setCourseId(id); setCourseURL(id); };
  const goBack = () => { setCourseId(null); setCourseURL(null); };

  if (courseId) return <CoursePlatform courseId={courseId} onBack={getCourseFromURL() ? null : goBack} />;
  return <CourseLanding onSelect={selectCourse} />;
}
