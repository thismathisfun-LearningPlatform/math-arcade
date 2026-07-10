import { useState, useEffect, useCallback, useRef } from "react";
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
   ANSWER MATCHING (typed answers)
   Forgiving comparison: ignores case, spaces, and common
   formatting so "x = 4", "X=4", and "4" all match; fractions
   and decimals are compared by value where possible.
═══════════════════════════════════════════════════════════ */
function normalizeAnswer(raw) {
  if (raw == null) return "";
  let s = String(raw).toLowerCase().trim();
  // strip spaces, common wrappers, and trailing punctuation
  s = s.replace(/\s+/g, "");
  s = s.replace(/[$°]/g, "");          // money / degree signs
  s = s.replace(/[.,](?=$)/g, "");      // trailing period/comma
  s = s.replace(/^x=|^y=|^n=/,"");      // leading "x=", "y=", "n="
  s = s.replace(/units?$/,"");          // trailing "unit"/"units"
  s = s.replace(/−/g, "-");             // unicode minus → ascii
  s = s.replace(/,/g, "");              // thousands separators (1,160 → 1160)
  return s;
}
// Try to read a value from a string like "5/8", "0.625", "1 1/2", "12"
function answerValue(raw) {
  const s = normalizeAnswer(raw);
  if (/^-?\d+\/\d+$/.test(s)) {          // simple fraction
    const [a, b] = s.split("/").map(Number);
    if (b !== 0) return a / b;
  }
  if (/^-?\d*\.?\d+$/.test(s)) return parseFloat(s);
  return null;
}
function answersMatch(typed, correct) {
  if (normalizeAnswer(typed) === normalizeAnswer(correct)) return true;
  const a = answerValue(typed), b = answerValue(correct);
  if (a !== null && b !== null) return Math.abs(a - b) < 1e-9;
  return false;
}

/* ═══════════════════════════════════════════════════════════
   COURSE DEFINITIONS
═══════════════════════════════════════════════════════════ */
const COURSES = {
  prealgebra: {
    id: "prealgebra", label: "Pre-Algebra", emoji: "PA",
    color: "#22A347", bg: "#E6F9EE", dark: "#1A7E38",
    tagline: "Build your math foundation",
    topics: [
      { name: "Integers & Order of Operations", icon: "", color: "#22A347", bg: "#E6F9EE" },
      { name: "Fractions & Decimals", icon: "½", color: "#E8960C", bg: C.cream },
      { name: "Ratios & Proportions", icon: "", color: C.sky, bg: "#E5F2FF" },
      { name: "Percents", icon: "%", color: C.coral, bg: C.blush },
      { name: "Probability", icon: "", color: "#0EA5A0", bg: "#DFF7F3" },
      { name: "Variables & Expressions", icon: "", color: C.violet, bg: C.lavender },
      { name: "Geometry Basics", icon: "", color: C.teal, bg: C.mint },
    ],
    seeds: [
      { id:"pa1", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: 3 + 4 × 2 − 1", choices:["6","13","14","10"], answer:3, hint:"Multiplication comes before addition. Do 4 × 2 first." },
      { id:"pa2", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: (5 + 3)² ÷ 4 − 6", choices:["−6","7","10","22"], answer:2, hint:"Parentheses first, then the exponent, then divide, then subtract." },
      { id:"pa3", topic:"Integers & Order of Operations", difficulty:"Hard", question:"Evaluate: −3 × (−2)² + 4(−1 + 6) ÷ 2", choices:["10","2","−10","−2"], answer:3, hint:"(−2)² = 4 (positive!). Then −3 × 4 = −12." },
      { id:"pa4", topic:"Fractions & Decimals", difficulty:"Easy", question:"What is 3/4 + 1/4 ?", choices:["4/8","1/2","1","2"], answer:2, hint:"Same denominator — just add the numerators." },
      { id:"pa5", topic:"Fractions & Decimals", difficulty:"Medium", question:"Multiply: 2/3 × 3/8", choices:["5/11","6/24","2/8","1/4"], answer:3, hint:"Multiply numerators, multiply denominators, then simplify." },
      { id:"pa6", topic:"Ratios & Proportions", difficulty:"Easy", question:"A recipe uses 2 cups of sugar for 5 cups of flour. For 10 cups of flour, how many cups of sugar?", choices:["5","2","3","4"], answer:3, hint:"Set up a proportion: 2/5 = ?/10." },
      { id:"pa7", topic:"Percents", difficulty:"Easy", question:"What is 25% of 80?", choices:["40","25","20","15"], answer:2, hint:"25% = 0.25. Multiply 0.25 × 80." },
      { id:"pa8", topic:"Percents", difficulty:"Hard", question:"A shirt costs $40 and is marked up 35%. What is the new price?", choices:["$50","$44","$54","$48"], answer:2, hint:"Markup = 0.35 × 40 = $14. Add that to the original." },
      { id:"pa9", topic:"Variables & Expressions", difficulty:"Easy", question:"Simplify: 4x + 3x − x", choices:["8x","4x","6x","7x"], answer:2, hint:"Combine like terms: 4 + 3 − 1 = ?" },
      { id:"pa10", topic:"Geometry Basics", difficulty:"Medium", question:"Find the area of a rectangle with length 8 and width 5.", choices:["13","26","80","40"], answer:3, hint:"Area = length × width." },
      { id:"pa_ext_1", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: 6 + 2 × 5", choices:["13","20","40","16"], answer:3, hint:"Multiply before adding: 2 × 5 = 10, then add 6." },
      { id:"pa_ext_2", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: 20 − 12 ÷ 4", choices:["16","2","17","8"], answer:2, hint:"Divide first: 12 ÷ 4 = 3, then subtract from 20." },
      { id:"pa_ext_3", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: (8 − 3) × 2", choices:["16","5","13","10"], answer:3, hint:"Parentheses first: 8 − 3 = 5, then × 2." },
      { id:"pa_ext_4", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: 3² + 4", choices:["14","13","25","10"], answer:1, hint:"Exponent first: 3² = 9, then add 4." },
      { id:"pa_ext_5", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: 18 ÷ (3 + 3)", choices:["6","12","9","3"], answer:3, hint:"Parentheses first: 3 + 3 = 6, then 18 ÷ 6." },
      { id:"pa_ext_6", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: 10 + 6 ÷ 2 − 1", choices:["7","9","12","4"], answer:2, hint:"Divide first: 6 ÷ 2 = 3. Then 10 + 3 − 1." },
      { id:"pa_ext_7", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: 4 × 3 + 2 × 5", choices:["17","50","70","22"], answer:3, hint:"Do both multiplications first: 12 + 10." },
      { id:"pa_ext_8", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: 2 × (4 + 1)²", choices:["100","26","20","50"], answer:3, hint:"Parentheses: 5. Exponent: 25. Then × 2." },
      { id:"pa_ext_9", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: 24 ÷ 2³ + 5", choices:["17","11","8","13"], answer:2, hint:"Exponent: 2³ = 8. Then 24 ÷ 8 = 3, plus 5." },
      { id:"pa_ext_10", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: (6 + 4) × 3 − 2²", choices:["36","26","30","24"], answer:1, hint:"Parens 10, ×3 = 30; 2² = 4; 30 − 4." },
      { id:"pa_ext_11", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: 50 − 3 × (2 + 4)", choices:["282","288","32","44"], answer:2, hint:"Parens 6, × 3 = 18, then 50 − 18." },
      { id:"pa_ext_12", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: (12 ÷ 4 + 1)² ", choices:["13","9","10","16"], answer:3, hint:"Inside: 3 + 1 = 4, then 4²." },
      { id:"pa_ext_13", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: 100 ÷ 5² × 2", choices:["2","40","8","200"], answer:2, hint:"Exponent 25; left-to-right: 100 ÷ 25 = 4, × 2." },
      { id:"pa_ext_14", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: 7 + 3 × (10 − 2³)", choices:["17","30","13","26"], answer:2, hint:"2³ = 8; 10 − 8 = 2; 3 × 2 = 6; 7 + 6." },
      { id:"pa_ext_15", topic:"Integers & Order of Operations", difficulty:"Hard", question:"Evaluate: [4 + (3 × 2²)] ÷ 2", choices:["16","8","7","11"], answer:1, hint:"2² = 4, × 3 = 12, + 4 = 16, ÷ 2 = 8." },
      { id:"pa_ext_16", topic:"Integers & Order of Operations", difficulty:"Hard", question:"Evaluate: 6² ÷ (4 + 2) × 3 − 5", choices:["31","1","13","23"], answer:2, hint:"36 ÷ 6 = 6, × 3 = 18, − 5 = 13." },
      { id:"pa_ext_17", topic:"Integers & Order of Operations", difficulty:"Hard", question:"Evaluate: 2 × [15 − (2 + 3)²]", choices:["20","−10","−20","40"], answer:2, hint:"Inner 5, squared 25; 15 − 25 = −10; × 2." },
      { id:"pa_ext_18", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: −7 + 12", choices:["−5","19","−19","5"], answer:3, hint:"Start at −7 and move 12 to the right." },
      { id:"pa_ext_19", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: −4 − 9", choices:["5","−13","−5","13"], answer:1, hint:"Subtracting makes it more negative." },
      { id:"pa_ext_20", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: −6 × 3", choices:["−9","−18","9","18"], answer:1, hint:"Negative times positive is negative." },
      { id:"pa_ext_21", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: −20 ÷ (−5)", choices:["−15","−4","15","4"], answer:3, hint:"Negative divided by negative is positive." },
      { id:"pa_ext_22", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: 8 + (−15)", choices:["−23","7","−7","23"], answer:2, hint:"Adding a negative is the same as subtracting." },
      { id:"pa_ext_23", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: −3 − (−10)", choices:["−7","−13","7","13"], answer:2, hint:"Subtracting a negative flips to addition: −3 + 10." },
      { id:"pa_ext_24", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: (−2)(−6)", choices:["−8","−12","8","12"], answer:3, hint:"Two negatives multiply to a positive." },
      { id:"pa_ext_25", topic:"Integers & Order of Operations", difficulty:"Easy", question:"What is the absolute value |−9| ?", choices:["18","9","0","−9"], answer:1, hint:"Absolute value is distance from zero — always non-negative." },
      { id:"pa_ext_26", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: −5 + 8 − 12", choices:["9","−9","1","−25"], answer:1, hint:"Left to right: −5 + 8 = 3, then 3 − 12." },
      { id:"pa_ext_27", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: −4 × (−3) × 2", choices:["−10","24","10","−24"], answer:1, hint:"(−4)(−3) = 12, then × 2." },
      { id:"pa_ext_28", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: −36 ÷ 4 + 5", choices:["14","−14","4","−4"], answer:3, hint:"−36 ÷ 4 = −9, then + 5." },
      { id:"pa_ext_29", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: (−2)³", choices:["8","−6","−8","6"], answer:2, hint:"(−2)(−2)(−2) = 4 × (−2)." },
      { id:"pa_ext_30", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: −15 − (−7) + (−3)", choices:["11","−11","−25","−5"], answer:1, hint:"−15 + 7 − 3." },
      { id:"pa_ext_31", topic:"Integers & Order of Operations", difficulty:"Medium", question:"A diver is at −18 m and rises 7 m. What is the new depth?", choices:["−25 m","11 m","25 m","−11 m"], answer:3, hint:"Rising adds: −18 + 7." },
      { id:"pa_ext_32", topic:"Integers & Order of Operations", difficulty:"Hard", question:"Evaluate: −2 × 5 − (−8) ÷ 4", choices:["8","−12","−10","−8"], answer:3, hint:"−10 minus (−2): −10 + 2 = −8." },
      { id:"pa_ext_33", topic:"Integers & Order of Operations", difficulty:"Hard", question:"The temperature was −6°F, dropped 4°, then rose 9°. Final temp?", choices:["−19°F","1°F","7°F","−1°F"], answer:3, hint:"−6 − 4 + 9 = −1." },
      { id:"pa_ext_34", topic:"Integers & Order of Operations", difficulty:"Hard", question:"Evaluate: (−3)² − (−3) × 2", choices:["12","15","3","−3"], answer:1, hint:"9 − (−6) = 9 + 6." },
      { id:"pa_ext_35", topic:"Variables & Expressions", difficulty:"Easy", question:"Simplify: 5x + 2x", choices:["7","10x","3x","7x"], answer:3, hint:"Combine like terms: 5 + 2 = 7." },
      { id:"pa_ext_36", topic:"Variables & Expressions", difficulty:"Easy", question:"Simplify: 9a − 4a", choices:["5","36a","13a","5a"], answer:3, hint:"9 − 4 = 5, keep the a." },
      { id:"pa_ext_37", topic:"Variables & Expressions", difficulty:"Easy", question:"Evaluate 3x + 1 when x = 4.", choices:["9","13","7","12"], answer:1, hint:"3 × 4 = 12, then + 1." },
      { id:"pa_ext_38", topic:"Variables & Expressions", difficulty:"Easy", question:"Write an expression: 'a number n increased by 6'.", choices:["6n","n − 6","6 − n","n + 6"], answer:3, hint:"'Increased by' means add." },
      { id:"pa_ext_39", topic:"Variables & Expressions", difficulty:"Easy", question:"Simplify: 2x + 3 + 4x", choices:["5x + 4","6x + 7","6x + 3","9x"], answer:2, hint:"Add the x-terms: 2x + 4x = 6x." },
      { id:"pa_ext_40", topic:"Variables & Expressions", difficulty:"Easy", question:"What is the coefficient in 7y ?", choices:["y","0","7","1"], answer:2, hint:"The coefficient is the number multiplying the variable." },
      { id:"pa_ext_41", topic:"Variables & Expressions", difficulty:"Easy", question:"Evaluate 2a + 3b when a = 5, b = 2.", choices:["20","16","10","13"], answer:1, hint:"2(5) + 3(2) = 10 + 6." },
      { id:"pa_ext_42", topic:"Variables & Expressions", difficulty:"Easy", question:"Write an expression: 'twice a number x'.", choices:["x/2","x + 2","2x","x − 2"], answer:2, hint:"'Twice' means multiply by 2." },
      { id:"pa_ext_43", topic:"Variables & Expressions", difficulty:"Medium", question:"Simplify: 3(x + 4)", choices:["3x + 4","x + 12","3x + 12","3x + 7"], answer:2, hint:"Distribute the 3 to both terms." },
      { id:"pa_ext_44", topic:"Variables & Expressions", difficulty:"Medium", question:"Simplify: 2(3x − 1) + 5", choices:["5x + 4","6x − 3","6x + 4","6x + 3"], answer:3, hint:"Distribute: 6x − 2, then + 5." },
      { id:"pa_ext_45", topic:"Variables & Expressions", difficulty:"Medium", question:"Simplify: 8y − 3 + 2y + 7", choices:["10y − 4","10y + 4","6y + 4","10y + 10"], answer:1, hint:"Combine y-terms and constants separately." },
      { id:"pa_ext_46", topic:"Variables & Expressions", difficulty:"Medium", question:"Evaluate x² − 2x when x = 5.", choices:["20","35","5","15"], answer:3, hint:"25 − 10." },
      { id:"pa_ext_47", topic:"Variables & Expressions", difficulty:"Medium", question:"Write an expression: '5 less than 3 times a number n'.", choices:["5 − 3n","3n + 5","3n − 5","3(n − 5)"], answer:2, hint:"'Less than' subtracts from the 3n." },
      { id:"pa_ext_48", topic:"Variables & Expressions", difficulty:"Medium", question:"Simplify: 4(2x + 3) − 2x", choices:["6x + 3","8x + 12","6x + 12","10x + 12"], answer:2, hint:"8x + 12 − 2x." },
      { id:"pa_ext_49", topic:"Variables & Expressions", difficulty:"Hard", question:"Simplify: 3(2x − 4) − 2(x + 1)", choices:["4x − 10","4x − 14","4x − 12","8x − 10"], answer:1, hint:"6x − 12 − 2x − 2." },
      { id:"pa_ext_50", topic:"Variables & Expressions", difficulty:"Hard", question:"Evaluate 2a² + 3a − 1 when a = −2.", choices:["9","1","13","−3"], answer:1, hint:"2(4) + 3(−2) − 1 = 8 − 6 − 1." },
      { id:"pa_ext_51", topic:"Variables & Expressions", difficulty:"Hard", question:"Simplify: 5x + 2(3 − x) + 4x", choices:["7x + 3","9x + 6","11x + 6","7x + 6"], answer:3, hint:"5x + 6 − 2x + 4x." },
      { id:"paprob_1", topic:"Probability", difficulty:"Easy", question:"A fair coin is flipped once. P(heads)?", choices:["1","1/2","1/4","2"], answer:1, hint:"" },
      { id:"paprob_2", topic:"Probability", difficulty:"Easy", question:"A standard die is rolled. P(rolling a 4)?", choices:["1/4","1/2","1/6","4/6"], answer:2, hint:"" },
      { id:"paprob_3", topic:"Probability", difficulty:"Medium", question:"A die is rolled. P(even number)?", choices:["2/3","1/3","1/2","1/6"], answer:2, hint:"" },
      { id:"paprob_4", topic:"Probability", difficulty:"Hard", question:"A bag has 4 red and 6 blue marbles. P(red)?", choices:["4/6","2/5","6/10","1/4"], answer:1, hint:"" },
      { id:"paprob_5", topic:"Probability", difficulty:"Hard", question:"Two coins are flipped. P(both heads)?", choices:["1/2","1/4","1/3","3/4"], answer:1, hint:"" },
      { id:"paprob_6", topic:"Probability", difficulty:"Hard", question:"A die is rolled twice. P(two 6's)?", choices:["1/12","2/6","1/36","1/6"], answer:2, hint:"" },
      { id:"paprob_7", topic:"Probability", difficulty:"Hard", question:"A bag has 3 red, 5 green, 2 yellow. P(NOT green)?", choices:["5/10","2/5","1/2","1/3"], answer:2, hint:"" },
      { id:"paprob_8", topic:"Probability", difficulty:"Hard", question:"Drawing one card from 52, P(a heart)?", choices:["1/2","13/52 simplified to 1/3","1/13","1/4"], answer:3, hint:"" },
      { id:"paprob_9", topic:"Probability", difficulty:"Hard", question:"A spinner has 8 equal sections numbered 1–8. P(prime number)?", choices:["5/8","1/4","3/8","1/2"], answer:3, hint:"" },
      { id:"paprob_10", topic:"Probability", difficulty:"Hard", question:"Bag: 5 red, 3 blue. Draw one, keep it, draw again. P(both red)?", choices:["10/16","1/2","5/14","25/64"], answer:2, hint:"" },
      { id:"pafi_1", topic:"Fractions & Decimals", difficulty:"Easy", question:"Multiply: 1/2 × 1/3", choices:["2/5","2/6","1/6","1/5"], answer:2, hint:"" },
      { id:"pafi_2", topic:"Fractions & Decimals", difficulty:"Easy", question:"Multiply: 2/3 × 3/4", choices:["5/7","6/7","6/12 not simplified","1/2"], answer:3, hint:"" },
      { id:"pafi_3", topic:"Fractions & Decimals", difficulty:"Easy", question:"Multiply: 1/4 × 8", choices:["4","8/4 not simplified","2","12"], answer:2, hint:"" },
      { id:"pafi_4", topic:"Fractions & Decimals", difficulty:"Easy", question:"Multiply: 3/5 × 10", choices:["30/5 not simplified","13","5","6"], answer:3, hint:"" },
      { id:"pafi_5", topic:"Fractions & Decimals", difficulty:"Medium", question:"Multiply: 2/3 × 5/8", choices:["7/11","5/12","10/24 not simplified","10/11"], answer:1, hint:"" },
      { id:"pafi_6", topic:"Fractions & Decimals", difficulty:"Medium", question:"Multiply: 4/9 × 3/8", choices:["12/72","7/17","1/3","1/6"], answer:3, hint:"" },
      { id:"pafi_7", topic:"Fractions & Decimals", difficulty:"Medium", question:"Multiply: 2 1/2 × 1 1/3 (mixed numbers)", choices:["2 1/6","3 1/3","3","2 1/2"], answer:1, hint:"" },
      { id:"pafi_8", topic:"Fractions & Decimals", difficulty:"Medium", question:"Multiply: 3/4 × 2/9 × 6", choices:["3/4","1","18/36","9"], answer:1, hint:"" },
      { id:"pafi_9", topic:"Fractions & Decimals", difficulty:"Hard", question:"Multiply: 5/6 × 3/10 × 4", choices:["60/60","1","2","3/5"], answer:1, hint:"" },
      { id:"pafi_10", topic:"Fractions & Decimals", difficulty:"Hard", question:"A recipe needs 3/4 cup sugar. You make 2 1/2 batches. Total sugar?", choices:["2 cups","1 3/4 cups","1 1/2 cups","1 7/8 cups"], answer:3, hint:"" },
      { id:"pafi_11", topic:"Fractions & Decimals", difficulty:"Easy", question:"Divide: 1/2 ÷ 1/4", choices:["4/2 not simplified","2","1/8","2/6"], answer:1, hint:"" },
      { id:"pafi_12", topic:"Fractions & Decimals", difficulty:"Easy", question:"Divide: 3/4 ÷ 1/2", choices:["6/4 not simplified","2/3","3/8","3/2"], answer:3, hint:"" },
      { id:"pafi_13", topic:"Fractions & Decimals", difficulty:"Easy", question:"Divide: 6 ÷ 1/3", choices:["6/3","2","18","9"], answer:2, hint:"" },
      { id:"pafi_14", topic:"Fractions & Decimals", difficulty:"Medium", question:"Divide: 2/3 ÷ 4/9", choices:["2/3","3/2","6/12","8/27"], answer:1, hint:"" },
      { id:"pafi_15", topic:"Fractions & Decimals", difficulty:"Medium", question:"Divide: 5/8 ÷ 5/8", choices:["0","1","5/8","25/64"], answer:1, hint:"" },
      { id:"pafi_16", topic:"Fractions & Decimals", difficulty:"Medium", question:"Divide: 3/5 ÷ 6", choices:["18/5","2","1/10","3/30 not simplified"], answer:2, hint:"" },
      { id:"pafi_17", topic:"Fractions & Decimals", difficulty:"Medium", question:"Divide: 2 1/2 ÷ 1/2", choices:["2","5","1 1/4","5/4"], answer:1, hint:"" },
      { id:"pafi_18", topic:"Fractions & Decimals", difficulty:"Hard", question:"Divide: 3 1/3 ÷ 2 1/2", choices:["6/5","5/6","1 1/3","4/3 not as mixed"], answer:2, hint:"" },
      { id:"pafi_19", topic:"Fractions & Decimals", difficulty:"Hard", question:"A board 7 1/2 ft long is cut into 1 1/4 ft pieces. How many pieces?", choices:["5","6","8","7"], answer:1, hint:"" },
      { id:"pafi_20", topic:"Fractions & Decimals", difficulty:"Hard", question:"How many 2/3 cup servings are in 8 cups?", choices:["10 2/3","16/3","6","12"], answer:3, hint:"" },
      { id:"pafi_21", topic:"Fractions & Decimals", difficulty:"Medium", question:"Evaluate: (2/3 × 3/4) ÷ 1/2", choices:["3/8","1/2","1/4","1"], answer:3, hint:"" },
      { id:"pafi_22", topic:"Fractions & Decimals", difficulty:"Hard", question:"Evaluate: (4/5 ÷ 2/5) × 3/8", choices:["2","3/40","6/8","3/4"], answer:3, hint:"" },
      { id:"pafi_23", topic:"Fractions & Decimals", difficulty:"Hard", question:"Evaluate: 1/2 × (3/4 ÷ 1/8)", choices:["6/4","3/4","3","1/16"], answer:2, hint:"" },
      { id:"pafi_24", topic:"Fractions & Decimals", difficulty:"Hard", question:"Evaluate: (5/6 × 2/5) ÷ (1/3)", choices:["2/6","5/18","1","1/3"], answer:2, hint:"" },
      { id:"pafi_25", topic:"Fractions & Decimals", difficulty:"Medium", question:"Evaluate: 2/7 × 7", choices:["9","14/7 not simplified","2/49","2"], answer:3, hint:"" },
      { id:"pafi_26", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Multiply: -6 × 4", choices:["-10","24","-2","-24"], answer:3, hint:"" },
      { id:"pafi_27", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Multiply: -5 × -7", choices:["12","-12","35","-35"], answer:2, hint:"" },
      { id:"pafi_28", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Multiply: 8 × -3", choices:["24","5","-24","-11"], answer:2, hint:"" },
      { id:"pafi_29", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Multiply: -1 × -1 × -1", choices:["3","-3","1","-1"], answer:3, hint:"" },
      { id:"pafi_30", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Multiply: -2 × 3 × -4", choices:["9","-24","-9","24"], answer:3, hint:"" },
      { id:"pafi_31", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Multiply: (-5)(2)(-3)", choices:["-10","10","30","-30"], answer:2, hint:"" },
      { id:"pafi_32", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Multiply: -4 × -2 × -2 × -1", choices:["-9","-16","16","9"], answer:2, hint:"" },
      { id:"pafi_33", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Divide: -20 ÷ 5", choices:["4","-4","-15","-100"], answer:1, hint:"" },
      { id:"pafi_34", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Divide: -36 ÷ -6", choices:["-6","42","-30","6"], answer:3, hint:"" },
      { id:"pafi_35", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Divide: 45 ÷ -9", choices:["-54","-5","5","-36"], answer:1, hint:"" },
      { id:"pafi_36", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Divide: -48 ÷ -8 ÷ 2", choices:["6","-3","3","-6"], answer:2, hint:"" },
      { id:"pafi_37", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Divide: 100 ÷ -25", choices:["4","-75","-4","-125"], answer:2, hint:"" },
      { id:"pafi_38", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: -6 × 4 ÷ -3", choices:["2","8","-2","-8"], answer:1, hint:"" },
      { id:"pafi_39", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: (-12 ÷ 4) × 5", choices:["-3","-60","15","-15"], answer:3, hint:"" },
      { id:"pafi_40", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: -3 × -3 ÷ -9", choices:["1","9","-9","-1"], answer:3, hint:"" },
      { id:"pafi_41", topic:"Integers & Order of Operations", difficulty:"Hard", question:"Evaluate: (-2)^3 ÷ 4", choices:["-16","2","-32","-2"], answer:3, hint:"" },
      { id:"pafi_42", topic:"Integers & Order of Operations", difficulty:"Hard", question:"Evaluate: -5 × 6 ÷ -2 ÷ 3", choices:["-45","5","45","-5"], answer:1, hint:"" },
      { id:"pafi_43", topic:"Integers & Order of Operations", difficulty:"Hard", question:"Evaluate: (-4 × 3) ÷ (-2 × -3)", choices:["2","-6","6","-2"], answer:3, hint:"" },
      { id:"pafi_44", topic:"Integers & Order of Operations", difficulty:"Hard", question:"Evaluate: -24 ÷ (-2 × 3) × -1", choices:["-12","12","-4","4"], answer:2, hint:"" },
      { id:"pafi_45", topic:"Integers & Order of Operations", difficulty:"Hard", question:"A diver descends at -3 m per minute for 8 minutes, then ÷ that depth over 4 equal stops. Depth per stop?", choices:["-24 m","-12 m","-6 m","6 m"], answer:2, hint:"" },
      { id:"pafi_46", topic:"Integers & Order of Operations", difficulty:"Hard", question:"Evaluate: (-1)^5 × (-2)^2", choices:["4","2","-2","-4"], answer:3, hint:"" },
      { id:"pafi_47", topic:"Integers & Order of Operations", difficulty:"Hard", question:"Evaluate: 36 ÷ (-6) × (-2)", choices:["-3","12","-12","3"], answer:1, hint:"" },
      { id:"pafi_48", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: -8 × -5 ÷ 10", choices:["40","4","-4","-40"], answer:1, hint:"" },
      { id:"pafi_49", topic:"Integers & Order of Operations", difficulty:"Hard", question:"Evaluate: (-15 ÷ 3) × (-2)^2", choices:["-5","-60","20","-20"], answer:3, hint:"" },
      { id:"pafi_50", topic:"Integers & Order of Operations", difficulty:"Hard", question:"Temperature drops 4°/hr for 6 hours, total change shared over 3 zones equally. Change per zone?", choices:["8°","-8°","-2°","-24°"], answer:1, hint:"" },
    ],
  },

  algebra1: {
    id: "algebra1", label: "Algebra 1", emoji: "A1",
    color: C.sky, bg: "#E5F2FF", dark: "#2B7FC7",
    tagline: "Equations, functions & beyond",
    topics: [
      { name: "Linear Equations", icon: "", color: C.sky, bg: "#E5F2FF" },
      { name: "Systems of Equations", icon: "", color: C.violet, bg: C.lavender },
      { name: "Inequalities", icon: "≤", color: C.coral, bg: C.blush },
      { name: "Slope & Linear Functions", icon: "", color: C.teal, bg: C.mint },
      { name: "Equations of a Line", icon: "", color: "#0EA5A0", bg: "#DFF7F3" },
      { name: "Exponents & Radicals", icon: "√", color: "#E8960C", bg: C.cream },
      { name: "Relations & Functions", icon: "", color: "#0EA5A0", bg: "#DFF7F3" },
      { name: "Quadratic Functions", icon: "", color: "#DC2626", bg: "#FEE2E2" },
      { name: "Factoring Polynomials", icon: "", color: "#7C3AED", bg: "#EDE9FE" },
    ],
    seeds: [
      { id:"a1_1", topic:"Linear Equations", difficulty:"Easy", question:"Solve for x: 2x + 5 = 13", choices:["x = 9","x = 6","x = 3","x = 4"], answer:3, hint:"Subtract 5 from both sides, then divide by 2." },
      { id:"a1_2", topic:"Linear Equations", difficulty:"Medium", question:"Solve: 3(x − 2) = 4x + 1", choices:["x = 7","x = 1","x = −1","x = −7"], answer:3, hint:"Distribute the 3 first, then collect x-terms on one side." },
      { id:"a1_3", topic:"Linear Equations", difficulty:"Hard", question:"Solve: (x + 3)/4 − (x − 1)/2 = 1", choices:["x = 5","x = −3","x = −5","x = 3"], answer:1, hint:"Multiply every term by 4 to clear the denominators." },
      { id:"a1_4", topic:"Systems of Equations", difficulty:"Easy", question:"Solve: y = 2x + 1 and y = x + 4", choices:["(1, 3)","(3, 7)","(4, 9)","(2, 5)"], answer:1, hint:"Set the right sides equal and solve for x." },
      { id:"a1_5", topic:"Systems of Equations", difficulty:"Hard", question:"Solve: 3x + 2y = 12 and x − y = 1", choices:["(4, 0)","(3, 2)","(2, 3)","(1, 4)"], answer:2, hint:"From the second equation, x = y + 1. Substitute." },
      { id:"a1_6", topic:"Inequalities", difficulty:"Easy", question:"Solve: −3x < 9", choices:["x < 3","x > 3","x > −3","x < −3"], answer:2, hint:"Dividing by a NEGATIVE flips the inequality sign." },
      { id:"a1_7", topic:"Slope & Linear Functions", difficulty:"Easy", question:"What is the slope of the line through (1, 2) and (3, 8)?", choices:["2","1/3","3","6"], answer:2, hint:"Slope = (y₂ − y₁)/(x₂ − x₁) = (8 − 2)/(3 − 1)." },
      { id:"a1_8", topic:"Slope & Linear Functions", difficulty:"Medium", question:"Write the equation of the line with slope 2 through (1, 5).",choices:["y = 2x + 5","y = 2x + 3","y = 2x − 3","y = x + 3"], answer:1, hint:"Use point-slope form: y − y₁ = m(x − x₁)." },
      { id:"a1_9", topic:"Exponents & Radicals", difficulty:"Medium", question:"Simplify: x³ · x⁵", choices:["x¹⁵","x²","2x⁸","x⁸"], answer:3, hint:"When multiplying same bases, add the exponents." },
      { id:"a1_eol_1", topic:"Equations of a Line", difficulty:"Easy", question:"What is the slope of y = 3x + 5 ?", choices:["−3","3","1/3","5"], answer:1, hint:"In y = mx + b, m is the slope." },
      { id:"a1_eol_2", topic:"Equations of a Line", difficulty:"Easy", question:"What is the y-intercept of y = −2x + 7 ?", choices:["−7","7","2","−2"], answer:1, hint:"In y = mx + b, b is the y-intercept." },
      { id:"a1_eol_3", topic:"Equations of a Line", difficulty:"Easy", question:"Write the equation of a line with slope 4 and y-intercept −1.", choices:["y = x − 4","y = 4x + 1","y = −x + 4","y = 4x − 1"], answer:3, hint:"Plug m = 4 and b = −1 into y = mx + b." },
      { id:"a1_eol_4", topic:"Equations of a Line", difficulty:"Easy", question:"Which equation is in slope-intercept form?", choices:["3x + 4y = 12","2x + y = 3","y = 2x + 3","x − y = 5"], answer:2, hint:"Slope-intercept form is y = mx + b, solved for y." },
      { id:"a1_eol_5", topic:"Equations of a Line", difficulty:"Easy", question:"What is the slope of y = −x + 8 ?", choices:["−8","−1","1","8"], answer:1, hint:"The coefficient of x is −1." },
      { id:"a1_eol_6", topic:"Equations of a Line", difficulty:"Easy", question:"A line has slope 0. Which describes it?", choices:["Diagonal up","Diagonal down","Vertical line","Horizontal line"], answer:3, hint:"Zero slope means no rise — a flat, horizontal line." },
      { id:"a1_eol_7", topic:"Equations of a Line", difficulty:"Easy", question:"What is the slope of the vertical line x = 4 ?", choices:["0","1","4","Undefined"], answer:3, hint:"Vertical lines have undefined slope (division by zero)." },
      { id:"a1_eol_8", topic:"Equations of a Line", difficulty:"Easy", question:"What is the y-intercept of y = 5x ?", choices:["undefined","5","0","1"], answer:2, hint:"y = 5x is y = 5x + 0, so b = 0." },
      { id:"a1_eol_9", topic:"Equations of a Line", difficulty:"Easy", question:"In point-slope form y − y₁ = m(x − x₁), what does m represent?", choices:["The x-intercept","The y-intercept","A point","The slope"], answer:3, hint:"m is always the slope." },
      { id:"a1_eol_10", topic:"Equations of a Line", difficulty:"Easy", question:"Which is the standard form of a line?", choices:["y = a(x−h)²+k","y = mx + b","Ax + By = C","y − y₁ = m(x − x₁)"], answer:2, hint:"Standard form is Ax + By = C." },
      { id:"a1_eol_11", topic:"Equations of a Line", difficulty:"Easy", question:"What is the slope of y = 7 ?", choices:["7","0","1","undefined"], answer:1, hint:"y = 7 is horizontal, so slope is 0." },
      { id:"a1_eol_12", topic:"Equations of a Line", difficulty:"Easy", question:"Find the slope between (0, 0) and (2, 6).", choices:["2","3","1/3","6"], answer:1, hint:"Slope = (6 − 0)/(2 − 0) = 6/2." },
      { id:"a1_eol_13", topic:"Equations of a Line", difficulty:"Medium", question:"Find the slope of the line through (1, 2) and (4, 11).", choices:["1/3","3","−3","9"], answer:1, hint:"Slope = (11 − 2)/(4 − 1) = 9/3." },
      { id:"a1_eol_14", topic:"Equations of a Line", difficulty:"Medium", question:"Write the equation (slope-intercept) of the line through (0, −3) with slope 2.", choices:["y = 2x + 3","y = 2x","y = −3x + 2","y = 2x − 3"], answer:3, hint:"b is the y-value when x = 0, so b = −3." },
      { id:"a1_eol_15", topic:"Equations of a Line", difficulty:"Medium", question:"Write in slope-intercept form the line through (2, 5) with slope 3.", choices:["y = 3x − 5","y = 3x − 1","y = 3x + 5","y = 3x + 1"], answer:1, hint:"y − 5 = 3(x − 2) → y = 3x − 6 + 5." },
      { id:"a1_eol_16", topic:"Equations of a Line", difficulty:"Medium", question:"Convert 2x + y = 7 to slope-intercept form.", choices:["y = 2x − 7","y = 2x + 7","y = −2x + 7","y = −2x − 7"], answer:2, hint:"Subtract 2x from both sides." },
      { id:"a1_eol_17", topic:"Equations of a Line", difficulty:"Medium", question:"Convert y = 3x − 6 to standard form (Ax + By = C).", choices:["−3x + y = 6","3x − y = 6","3x + y = 6","x − 3y = 6"], answer:1, hint:"Move 3x to the left: −3x + y = −6, then multiply by −1." },
      { id:"a1_eol_18", topic:"Equations of a Line", difficulty:"Medium", question:"What is the x-intercept of y = 2x − 8 ?", choices:["(0, −8)","(0, 4)","(−4, 0)","(4, 0)"], answer:3, hint:"Set y = 0: 0 = 2x − 8 → x = 4." },
      { id:"a1_eol_19", topic:"Equations of a Line", difficulty:"Medium", question:"What is the y-intercept of 3x + 4y = 12 ?", choices:["(0, 4)","(0, 12)","(0, 3)","(4, 0)"], answer:2, hint:"Set x = 0: 4y = 12 → y = 3." },
      { id:"a1_eol_20", topic:"Equations of a Line", difficulty:"Medium", question:"What is the x-intercept of 3x + 4y = 12 ?", choices:["(0, 4)","(0, 3)","(4, 0)","(3, 0)"], answer:2, hint:"Set y = 0: 3x = 12 → x = 4." },
      { id:"a1_eol_21", topic:"Equations of a Line", difficulty:"Medium", question:"Find the equation of the line through (1, 4) and (3, 10).", choices:["y = 3x + 4","y = 3x + 1","y = 2x + 2","y = 3x − 1"], answer:1, hint:"Slope = (10−4)/(3−1) = 3. Then y − 4 = 3(x − 1)." },
      { id:"a1_eol_22", topic:"Equations of a Line", difficulty:"Medium", question:"A line parallel to y = 2x + 1 passes through (0, 5). Find it.", choices:["y = −½x + 5","y = 2x + 1","y = 5x + 2","y = 2x + 5"], answer:3, hint:"Parallel lines share the same slope, m = 2." },
      { id:"a1_eol_23", topic:"Equations of a Line", difficulty:"Medium", question:"A line perpendicular to y = 3x − 2 has what slope?", choices:["1/3","−3","3","−1/3"], answer:3, hint:"Perpendicular slopes are negative reciprocals: −1/3." },
      { id:"a1_eol_24", topic:"Equations of a Line", difficulty:"Medium", question:"Write point-slope form for the line through (4, −1) with slope 5.", choices:["y − 1 = 5(x + 4)","y + 4 = 5(x − 1)","y + 1 = 5(x − 4)","y − 1 = 5(x − 4)"], answer:2, hint:"y − y₁ = m(x − x₁) with (x₁,y₁) = (4,−1)." },
      { id:"a1_eol_25", topic:"Equations of a Line", difficulty:"Medium", question:"Which line is horizontal?", choices:["y = 2x","y = −2","x = −2","y = x"], answer:1, hint:"y = constant is horizontal." },
      { id:"a1_eol_26", topic:"Equations of a Line", difficulty:"Medium", question:"Which line passes through the origin?", choices:["y = 4x + 1","x = 4","y = 4x","y = 4"], answer:2, hint:"Through origin means b = 0." },
      { id:"a1_eol_27", topic:"Equations of a Line", difficulty:"Medium", question:"Find the slope of 4x − 2y = 10.", choices:["1/2","4","−2","2"], answer:3, hint:"Solve for y: −2y = −4x + 10 → y = 2x − 5." },
      { id:"a1_eol_28", topic:"Equations of a Line", difficulty:"Medium", question:"The line y = mx + b passes through (0, 4) and (2, 0). Find m.", choices:["−4","4","−2","2"], answer:2, hint:"Slope = (0 − 4)/(2 − 0) = −2." },
      { id:"a1_eol_29", topic:"Equations of a Line", difficulty:"Medium", question:"Write the equation of the vertical line through (3, 7).", choices:["x = 7","x = 3","y = 3","y = 7"], answer:1, hint:"Vertical lines are x = constant." },
      { id:"a1_eol_30", topic:"Equations of a Line", difficulty:"Medium", question:"Write the equation of the horizontal line through (3, 7).", choices:["x = 7","y = 7","y = 3","x = 3"], answer:1, hint:"Horizontal lines are y = constant." },
      { id:"a1_eol_31", topic:"Equations of a Line", difficulty:"Hard", question:"Find the equation of the line through (2, 3) and (6, 11) in slope-intercept form.", choices:["y = 2x + 1","y = 2x − 3","y = 2x − 1","y = ½x + 2"], answer:2, hint:"Slope = 8/4 = 2. y − 3 = 2(x − 2) → y = 2x − 1." },
      { id:"a1_eol_32", topic:"Equations of a Line", difficulty:"Hard", question:"Line through (−1, 4), perpendicular to y = ½x + 3. Find it.", choices:["y = ½x + 2","y = −2x − 2","y = −2x + 2","y = 2x + 6"], answer:2, hint:"Perp slope = −2. y − 4 = −2(x + 1)." },
      { id:"a1_eol_33", topic:"Equations of a Line", difficulty:"Hard", question:"Line through (3, −2), parallel to 3x + y = 5. Find it.", choices:["y = 3x − 11","y = ⅓x − 3","y = −3x + 7","y = −3x − 7"], answer:2, hint:"Parallel slope = −3. y + 2 = −3(x − 3)." },
      { id:"a1_eol_34", topic:"Equations of a Line", difficulty:"Hard", question:"Convert y − 2 = 4(x + 1) to standard form.", choices:["x − 4y = −6","4x − y = −6","4x + y = 6","4x − y = 6"], answer:1, hint:"y = 4x + 6 → 4x − y = −6." },
      { id:"a1_eol_35", topic:"Equations of a Line", difficulty:"Hard", question:"A line has x-intercept 3 and y-intercept −6. Find its equation.", choices:["y = 2x + 6","y = ½x − 6","y = 2x − 6","y = −2x − 6"], answer:2, hint:"Slope = (−6 − 0)/(0 − 3) = 2. b = −6." },
      { id:"a1_eol_36", topic:"Equations of a Line", difficulty:"Hard", question:"Find the equation of the perpendicular bisector of the segment from (0,0) to (4,8).", choices:["y = ½x + 5","y = 2x − 5","y = −½x − 5","y = −½x + 5"], answer:3, hint:"Midpoint (2,4); segment slope 2; perp slope −½. y − 4 = −½(x − 2)." },
      { id:"a1_eol_37", topic:"Equations of a Line", difficulty:"Hard", question:"For what k is kx + 2y = 8 parallel to y = 3x − 1 ?", choices:["k = 3","k = 6","k = −3","k = −6"], answer:3, hint:"Slope = −k/2 must equal 3 → k = −6." },
      { id:"a1_eol_38", topic:"Equations of a Line", difficulty:"Hard", question:"Line through (5, 1) with the same y-intercept as y = 2x − 4. Find it.", choices:["y = x + 4","y = −x − 4","y = 2x − 4","y = x − 4"], answer:3, hint:"b = −4. Through (5,1): 1 = 5m − 4 → m = 1." },
      { id:"a1_eol_39", topic:"Equations of a Line", difficulty:"Hard", question:"Three points (1, k), (3, 7), (5, 13) are collinear. Find k.", choices:["3","1","5","4"], answer:1, hint:"Slope (3,7)-(5,13) = 3. Back to (1,k): 7 − k = 3(3 − 1) → k = 1." },
      { id:"a1_eol_40", topic:"Equations of a Line", difficulty:"Hard", question:"Write y = −¾x + 2 in standard form with integer coefficients.", choices:["3x − 4y = 8","3x + 4y = 8","4x + 3y = 8","3x + 4y = 2"], answer:1, hint:"Multiply by 4: 4y = −3x + 8 → 3x + 4y = 8." },
      { id:"a1_eol_41", topic:"Equations of a Line", difficulty:"Medium", question:"A taxi charges $3 to start plus $2 per mile. Write the cost C for m miles.", choices:["C = 2m − 3","C = 3m + 2","C = 2m + 3","C = 5m"], answer:2, hint:"Flat fee is the y-intercept; per-mile rate is the slope." },
      { id:"a1_eol_42", topic:"Equations of a Line", difficulty:"Medium", question:"A gym costs $50 to join plus $20 per month. Total cost after x months?", choices:["y = 50x + 20","y = 20x − 50","y = 70x","y = 20x + 50"], answer:3, hint:"Start fee = intercept (50); monthly = slope (20)." },
      { id:"a1_eol_43", topic:"Equations of a Line", difficulty:"Medium", question:"A plant is 4 cm tall and grows 2 cm per week. Height h after w weeks?", choices:["h = 2w − 4","h = 2w + 4","h = 4w + 2","h = 6w"], answer:1, hint:"Starting height is the intercept; growth rate is the slope." },
      { id:"a1_eol_44", topic:"Equations of a Line", difficulty:"Medium", question:"A pool has 100 gallons and drains 5 gal/min. Gallons g after t minutes?", choices:["g = −5t − 100","g = 5t + 100","g = 100t − 5","g = −5t + 100"], answer:3, hint:"Draining means negative slope; start amount is intercept." },
      { id:"a1_eol_45", topic:"Equations of a Line", difficulty:"Medium", question:"A candle is 12 in tall and burns 1.5 in/hr. Height after h hours?", choices:["y = 1.5h + 12","y = 12h − 1.5","y = −1.5h + 12","y = −1.5h − 12"], answer:2, hint:"Burning shortens it: slope is negative." },
      { id:"a1_eol_46", topic:"Equations of a Line", difficulty:"Medium", question:"A phone plan is $30/month flat. Which equation models cost over x months?", choices:["y = 30x + 30","y = 30x","y = x + 30","y = 30"], answer:1, hint:"No start fee, so intercept is 0; rate is 30." },
      { id:"a1_eol_47", topic:"Equations of a Line", difficulty:"Hard", question:"A car rental costs $40 plus $0.25/mile. If a trip cost $65, how many miles?", choices:["105","100","25","160"], answer:1, hint:"65 = 0.25m + 40 → 0.25m = 25 → m = 100." },
      { id:"a1_eol_48", topic:"Equations of a Line", difficulty:"Hard", question:"Water rises 3 cm/hr in a tank starting at 10 cm. When does it reach 31 cm?", choices:["3 hours","7 hours","9 hours","21 hours"], answer:1, hint:"31 = 3t + 10 → 3t = 21 → t = 7." },
      { id:"a1_eol_49", topic:"Equations of a Line", difficulty:"Hard", question:"A company's profit was $2,000 in year 0 and grows $500/yr. In what year is profit $6,500?", choices:["Year 13","Year 9","Year 7","Year 11"], answer:1, hint:"6500 = 500t + 2000 → 500t = 4500 → t = 9." },
      { id:"a1_eol_50", topic:"Equations of a Line", difficulty:"Hard", question:"A spring is 8 cm with no weight and stretches 2 cm per kg. A reading of 20 cm means what mass?", choices:["4 kg","10 kg","12 kg","6 kg"], answer:3, hint:"20 = 2x + 8 → 2x = 12 → x = 6." },
      { id:"a1_eol_51", topic:"Equations of a Line", difficulty:"Hard", question:"Two gyms: A is $60 + $15/mo, B is $30 + $25/mo. After how many months do they cost the same?", choices:["6 months","5 months","3 months","2 months"], answer:2, hint:"15x + 60 = 25x + 30 → 30 = 10x → x = 3." },
      { id:"a1_eol_52", topic:"Equations of a Line", difficulty:"Hard", question:"A printer cost $200; ink is $0.05/page. Cost after p pages? Then cost for 1000 pages?", choices:["y = 0.05p + 200; $200","y = 200p + 0.05; $250","y = 0.05p; $50","y = 0.05p + 200; $250"], answer:3, hint:"Intercept 200, slope 0.05. At p=1000: 50 + 200 = 250." },
      { id:"a1_eol_53", topic:"Equations of a Line", difficulty:"Hard", question:"A balloon at 500 ft descends 50 ft/min. Write the height equation and find when it lands.", choices:["y = 50t + 500; 10 min","y = −50t + 500; 10 min","y = −50t + 500; 5 min","y = −50t − 500; 10 min"], answer:1, hint:"Lands when y = 0: 0 = −50t + 500 → t = 10." },
      { id:"a1_eol_54", topic:"Equations of a Line", difficulty:"Hard", question:"A salesperson earns $1,500 base plus $100 per sale. To earn $3,300, how many sales?", choices:["48","18","33","15"], answer:1, hint:"3300 = 100s + 1500 → 100s = 1800 → s = 18." },
      { id:"a1exp_1", topic:"Exponents & Radicals", difficulty:"Easy", question:"Simplify: x³ · x⁴", choices:["x¹","x¹²","x⁷","2x⁷"], answer:2, hint:"" },
      { id:"a1exp_2", topic:"Exponents & Radicals", difficulty:"Easy", question:"Simplify: 2² · 2³", choices:["2¹","2⁵","2⁶","4⁵"], answer:1, hint:"" },
      { id:"a1exp_3", topic:"Exponents & Radicals", difficulty:"Easy", question:"Simplify: a · a⁵", choices:["a⁵","a⁴","2a⁵","a⁶"], answer:3, hint:"" },
      { id:"a1exp_4", topic:"Exponents & Radicals", difficulty:"Medium", question:"Simplify: 3x² · 4x⁵", choices:["12x¹⁰","12x⁷","7x⁷","12x³"], answer:1, hint:"" },
      { id:"a1exp_5", topic:"Exponents & Radicals", difficulty:"Medium", question:"Simplify: (2a³)(5a²)(a)", choices:["7a⁶","10a⁶","10a⁷","10a⁵"], answer:1, hint:"" },
      { id:"a1exp_6", topic:"Exponents & Radicals", difficulty:"Easy", question:"Simplify: x⁷ / x³", choices:["x¹⁰","x²","x⁴","x²¹"], answer:2, hint:"" },
      { id:"a1exp_7", topic:"Exponents & Radicals", difficulty:"Easy", question:"Simplify: 5⁶ / 5²", choices:["5⁸","1⁴","5⁴","5³"], answer:2, hint:"" },
      { id:"a1exp_8", topic:"Exponents & Radicals", difficulty:"Medium", question:"Simplify: 12x⁸ / 4x³", choices:["3x¹¹","3x⁵","3x²⁴","8x⁵"], answer:1, hint:"" },
      { id:"a1exp_9", topic:"Exponents & Radicals", difficulty:"Medium", question:"Simplify: (20a⁶ b⁴) / (5a² b)", choices:["4a⁸ b⁴","15a⁴ b³","4a⁴ b³","4a³ b⁴"], answer:2, hint:"" },
      { id:"a1exp_10", topic:"Exponents & Radicals", difficulty:"Easy", question:"Simplify: (x³)⁴", choices:["3x⁴","x⁸¹","x⁷","x¹²"], answer:3, hint:"" },
      { id:"a1exp_11", topic:"Exponents & Radicals", difficulty:"Easy", question:"Simplify: (2³)²", choices:["2⁵","2⁶","2⁹","4⁶"], answer:1, hint:"" },
      { id:"a1exp_12", topic:"Exponents & Radicals", difficulty:"Medium", question:"Simplify: (a⁵)³", choices:["a⁸","a¹⁵","3a⁵","a²"], answer:1, hint:"" },
      { id:"a1exp_13", topic:"Exponents & Radicals", difficulty:"Medium", question:"Simplify: (3x)²", choices:["9x","3x²","9x²","6x²"], answer:2, hint:"" },
      { id:"a1exp_14", topic:"Exponents & Radicals", difficulty:"Medium", question:"Simplify: (2x³)⁴", choices:["8x¹²","16x¹²","16x⁷","2x¹²"], answer:1, hint:"" },
      { id:"a1exp_15", topic:"Exponents & Radicals", difficulty:"Medium", question:"Simplify: (-2a²b)³", choices:["8a⁶ b³","-8a⁶ b³","-6a⁶ b³","-8a⁵ b³"], answer:1, hint:"" },
      { id:"a1exp_16", topic:"Exponents & Radicals", difficulty:"Medium", question:"Simplify: (x/y)³", choices:["x³/y","3x/3y","x³/y³","x/y³"], answer:2, hint:"" },
      { id:"a1exp_17", topic:"Exponents & Radicals", difficulty:"Medium", question:"Simplify: (2/x)⁴", choices:["8/x⁴","16/x","2/x⁴","16/x⁴"], answer:3, hint:"" },
      { id:"a1exp_18", topic:"Exponents & Radicals", difficulty:"Hard", question:"Simplify: (3a² / b)³", choices:["27a⁵ / b³","27a⁶ / b³","27a⁶ / b","9a⁶ / b³"], answer:1, hint:"" },
      { id:"a1exp_19", topic:"Exponents & Radicals", difficulty:"Easy", question:"Simplify: 7⁰", choices:["0","undefined","1","7"], answer:2, hint:"" },
      { id:"a1exp_20", topic:"Exponents & Radicals", difficulty:"Easy", question:"Simplify: (5x)⁰", choices:["0","1","5x","5"], answer:1, hint:"" },
      { id:"a1exp_21", topic:"Exponents & Radicals", difficulty:"Medium", question:"Simplify: 3x⁰ + 2", choices:["3","6","5","2"], answer:2, hint:"" },
      { id:"a1exp_22", topic:"Exponents & Radicals", difficulty:"Easy", question:"Write with a positive exponent: x⁻³", choices:["-x³","-1/x³","x³","1/x³"], answer:3, hint:"" },
      { id:"a1exp_23", topic:"Exponents & Radicals", difficulty:"Easy", question:"Evaluate: 2⁻³", choices:["8","1/8","-1/8","-8"], answer:1, hint:"" },
      { id:"a1exp_24", topic:"Exponents & Radicals", difficulty:"Medium", question:"Simplify: x⁻⁴ · x⁶", choices:["x⁻¹⁰","x⁻²⁴","1/x²","x²"], answer:3, hint:"" },
      { id:"a1exp_25", topic:"Exponents & Radicals", difficulty:"Medium", question:"Simplify: 4x⁻² (positive exponents)", choices:["1/(4x²)","4x²","-8x","4/x²"], answer:3, hint:"" },
      { id:"a1exp_26", topic:"Exponents & Radicals", difficulty:"Hard", question:"Simplify: (2x⁻² y³) / (x³ y⁻¹) with positive exponents", choices:["2x⁵ y⁴","y⁴ / (2x⁵)","2y² / x⁵","2y⁴ / x⁵"], answer:3, hint:"" },
      { id:"a1exp_27", topic:"Exponents & Radicals", difficulty:"Medium", question:"Simplify: (x² y³)² · x", choices:["x⁴ y⁵","x⁵ y⁶","x⁵ y⁵","x⁴ y⁶"], answer:1, hint:"" },
      { id:"a1exp_28", topic:"Exponents & Radicals", difficulty:"Medium", question:"Simplify: (a³)² / a⁴", choices:["a⁻²","a","a²","a¹⁰"], answer:2, hint:"" },
      { id:"a1exp_29", topic:"Exponents & Radicals", difficulty:"Hard", question:"Simplify: (2x²)³ · (3x)²", choices:["72x¹²","36x⁸","72x⁸","72x⁷"], answer:2, hint:"" },
      { id:"a1exp_30", topic:"Exponents & Radicals", difficulty:"Hard", question:"Simplify: (4x³ y)² / (2x y²)", choices:["16x⁵","8x⁵ / 1","8x⁵ · 1","8x⁵"], answer:3, hint:"" },
      { id:"a1exp_31", topic:"Exponents & Radicals", difficulty:"Hard", question:"Simplify: (a⁴ b⁻²)⁻¹ with positive exponents", choices:["a⁴ / b²","1/(a⁴ b²)","a⁴ b²","b² / a⁴"], answer:3, hint:"" },
      { id:"a1exp_32", topic:"Exponents & Radicals", difficulty:"Medium", question:"Write in scientific notation: 45,000", choices:["4.5 × 10³","4.5 × 10⁵","45 × 10³","4.5 × 10⁴"], answer:3, hint:"" },
      { id:"a1exp_33", topic:"Exponents & Radicals", difficulty:"Medium", question:"Write in standard form: 3.2 × 10³", choices:["32,000","320","0.0032","3,200"], answer:3, hint:"" },
      { id:"a1exp_34", topic:"Exponents & Radicals", difficulty:"Medium", question:"Write in scientific notation: 0.00067", choices:["6.7 × 10⁴","6.7 × 10⁻³","67 × 10⁻⁵","6.7 × 10⁻⁴"], answer:3, hint:"" },
      { id:"a1exp_35", topic:"Exponents & Radicals", difficulty:"Hard", question:"Multiply: (2 × 10³)(4 × 10⁵)", choices:["8 × 10²","8 × 10⁸","6 × 10⁸","8 × 10¹⁵"], answer:1, hint:"" },
      { id:"a1exp_36", topic:"Exponents & Radicals", difficulty:"Hard", question:"Divide: (9 × 10⁷) / (3 × 10²)", choices:["6 × 10⁵","3 × 10⁹","3 × 10⁵","3 × 10⁴"], answer:2, hint:"" },
      { id:"a1exp_37", topic:"Exponents & Radicals", difficulty:"Medium", question:"Write as a radical: x¹ᐟ²", choices:["1/x²","√x","x²","2√x"], answer:1, hint:"" },
      { id:"a1exp_38", topic:"Exponents & Radicals", difficulty:"Medium", question:"Write as a radical: x¹ᐟ³", choices:["√x","∛x","x³","3√x"], answer:1, hint:"" },
      { id:"a1exp_39", topic:"Exponents & Radicals", difficulty:"Hard", question:"Evaluate: 8¹ᐟ³", choices:["24","3","2","4"], answer:2, hint:"" },
      { id:"a1exp_40", topic:"Exponents & Radicals", difficulty:"Hard", question:"Evaluate: 16³ᐟ⁴", choices:["12","64","8","4"], answer:2, hint:"" },
      { id:"a1exp_41", topic:"Exponents & Radicals", difficulty:"Hard", question:"Write x²ᐟ³ as a radical", choices:["x² √3","∛(x²)","√(x³)","(∛x)³"], answer:1, hint:"" },
      { id:"a1exp_42", topic:"Exponents & Radicals", difficulty:"Easy", question:"Simplify: y⁵ · y⁰", choices:["1","y⁶","y⁰","y⁵"], answer:3, hint:"" },
      { id:"a1exp_43", topic:"Exponents & Radicals", difficulty:"Medium", question:"Simplify: (x⁴)² · (x³)", choices:["x²⁴","x¹⁴","x⁹","x¹¹"], answer:3, hint:"" },
      { id:"a1exp_44", topic:"Exponents & Radicals", difficulty:"Medium", question:"Simplify: (6x⁵)/(2x⁵)", choices:["3x","3","3x¹⁰","x"], answer:1, hint:"" },
      { id:"a1exp_45", topic:"Exponents & Radicals", difficulty:"Medium", question:"Simplify: (a² b)³ · b²", choices:["a⁵ b⁵","a⁶ b⁵","a⁶ b³","a⁶ b⁶"], answer:1, hint:"" },
      { id:"a1exp_46", topic:"Exponents & Radicals", difficulty:"Hard", question:"Simplify: (2x² y⁻¹)⁻² with positive exponents", choices:["y² / (2x⁴)","x⁴ / (4y²)","y² / (4x⁴)","4x⁴ / y²"], answer:2, hint:"" },
      { id:"a1exp_47", topic:"Exponents & Radicals", difficulty:"Hard", question:"Simplify: (x³ y² z)⁰", choices:["0","xyz","1","x³ y² z"], answer:2, hint:"" },
      { id:"a1exp_48", topic:"Exponents & Radicals", difficulty:"Hard", question:"Simplify: (27x⁶)¹ᐟ³", choices:["9x²","27x²","3x²","3x³"], answer:2, hint:"" },
      { id:"a1exp_49", topic:"Exponents & Radicals", difficulty:"Medium", question:"Simplify: 10⁴ / 10⁴", choices:["10⁸","10","1","0"], answer:2, hint:"" },
      { id:"a1exp_50", topic:"Exponents & Radicals", difficulty:"Hard", question:"Simplify: (4¹ᐟ²) · (4¹ᐟ²)", choices:["16","8","2","4"], answer:3, hint:"" },
      { id:"a1rf_1", topic:"Relations & Functions", difficulty:"Easy", question:"Which relation IS a function?", choices:["{(1,2),(1,5)}","{(1,2),(2,3),(3,4)}","{(1,2),(1,3),(2,4)}","{(2,1),(2,2)}"], answer:1, hint:"" },
      { id:"a1rf_2", topic:"Relations & Functions", difficulty:"Easy", question:"Does the set {(0,1),(1,2),(2,3)} represent a function?", choices:["No","Yes","Only if x>0","Cannot tell"], answer:1, hint:"" },
      { id:"a1rf_3", topic:"Relations & Functions", difficulty:"Easy", question:"A relation is a function if each input has exactly one:", choices:["graph","point","output","input"], answer:2, hint:"" },
      { id:"a1rf_4", topic:"Relations & Functions", difficulty:"Easy", question:"Which set is NOT a function?", choices:["{(1,1),(2,2)}","{(1,4),(2,4)}","{(4,1),(4,2)}","{(0,0),(1,1)}"], answer:2, hint:"" },
      { id:"a1rf_5", topic:"Relations & Functions", difficulty:"Easy", question:"The vertical line test checks whether a graph is a:", choices:["parabola","circle","function","line"], answer:2, hint:"" },
      { id:"a1rf_6", topic:"Relations & Functions", difficulty:"Medium", question:"A vertical line crosses a graph twice. The graph is:", choices:["linear","increasing","a function","not a function"], answer:3, hint:"" },
      { id:"a1rf_7", topic:"Relations & Functions", difficulty:"Medium", question:"Which represents y as a function of x?", choices:["x = 3","y = 2x + 1","x = y²","x² + y² = 9"], answer:1, hint:"" },
      { id:"a1rf_8", topic:"Relations & Functions", difficulty:"Medium", question:"Is x = 5 (a vertical line) a function?", choices:["Yes","Sometimes","No","Only at x=5"], answer:2, hint:"" },
      { id:"a1rf_9", topic:"Relations & Functions", difficulty:"Medium", question:"The mapping 1→a, 2→b, 3→a is a function because:", choices:["it's one-to-one","a appears twice","outputs repeat","each input maps to one output"], answer:3, hint:"" },
      { id:"a1rf_10", topic:"Relations & Functions", difficulty:"Medium", question:"Which table represents a function? (x-values listed)", choices:["x: 2,2,2,2","x: 5,5,6,6","x: 1,1,2,3","x: 1,2,3,4"], answer:3, hint:"" },
      { id:"a1rf_11", topic:"Relations & Functions", difficulty:"Easy", question:"If f(x) = x + 4, what is f(3)?", choices:["3","4","12","7"], answer:3, hint:"" },
      { id:"a1rf_12", topic:"Relations & Functions", difficulty:"Easy", question:"If f(x) = 2x, what is f(5)?", choices:["7","10","2","25"], answer:1, hint:"" },
      { id:"a1rf_13", topic:"Relations & Functions", difficulty:"Medium", question:"If f(x) = x² − 1, what is f(4)?", choices:["7","15","8","16"], answer:1, hint:"" },
      { id:"a1rf_14", topic:"Relations & Functions", difficulty:"Medium", question:"If f(x) = 3x − 2 and f(a) = 10, what is a?", choices:["3","4","8","12"], answer:1, hint:"" },
      { id:"a1rf_15", topic:"Relations & Functions", difficulty:"Medium", question:"If g(x) = −x + 6, what is g(−2)?", choices:["−4","−8","8","4"], answer:2, hint:"" },
      { id:"a1rf_16", topic:"Relations & Functions", difficulty:"Medium", question:"If f(x) = x² + 2x, what is f(−3)?", choices:["−3","−15","3","15"], answer:2, hint:"" },
      { id:"a1rf_17", topic:"Relations & Functions", difficulty:"Easy", question:"What is the domain of {(1,2),(3,4),(5,6)}?", choices:["all reals","{2,4,6}","{1,3,5}","{1,2,3,4,5,6}"], answer:2, hint:"" },
      { id:"a1rf_18", topic:"Relations & Functions", difficulty:"Easy", question:"The domain of a function is the set of all:", choices:["points","slopes","outputs (y-values)","inputs (x-values)"], answer:3, hint:"" },
      { id:"a1rf_19", topic:"Relations & Functions", difficulty:"Medium", question:"What is the domain of f(x) = 1/(x − 2)?", choices:["x ≥ 2","x > 2","all reals","all reals except 2"], answer:3, hint:"" },
      { id:"a1rf_20", topic:"Relations & Functions", difficulty:"Medium", question:"What is the domain of f(x) = √(x − 3)?", choices:["x ≤ 3","x ≥ 3","all reals","x > 3"], answer:1, hint:"" },
      { id:"a1rf_21", topic:"Relations & Functions", difficulty:"Medium", question:"The domain of f(x) = 2x + 1 is:", choices:["x ≠ 0","x ≥ 0","all real numbers","x > 0"], answer:2, hint:"" },
      { id:"a1rf_22", topic:"Relations & Functions", difficulty:"Hard", question:"What is the domain of f(x) = √(x)/(x − 4)?", choices:["x ≥ 0","x ≠ 4","x ≥ 0 and x ≠ 4","all reals"], answer:2, hint:"" },
      { id:"a1rf_23", topic:"Relations & Functions", difficulty:"Easy", question:"What is the range of {(1,2),(3,4),(5,6)}?", choices:["all reals","{2,4,6}","{1,3,5}","{1,2,3}"], answer:1, hint:"" },
      { id:"a1rf_24", topic:"Relations & Functions", difficulty:"Medium", question:"What is the range of f(x) = x²?", choices:["all reals","y ≤ 0","y ≥ 0","y > 0"], answer:2, hint:"" },
      { id:"a1rf_25", topic:"Relations & Functions", difficulty:"Medium", question:"What is the range of f(x) = |x|?", choices:["y > 0","y ≤ 0","all reals","y ≥ 0"], answer:3, hint:"" },
      { id:"a1rf_26", topic:"Relations & Functions", difficulty:"Medium", question:"What is the range of f(x) = −x² + 5?", choices:["y ≥ 5","y ≤ 0","y ≤ 5","all reals"], answer:2, hint:"" },
      { id:"a1rf_27", topic:"Relations & Functions", difficulty:"Hard", question:"What is the range of f(x) = 2ˣ?", choices:["all reals","y > 1","y > 0","y ≥ 0"], answer:2, hint:"" },
      { id:"a1rf_28", topic:"Relations & Functions", difficulty:"Easy", question:"What is the y-intercept of y = 3x + 6?", choices:["3","−2","0","6"], answer:3, hint:"" },
      { id:"a1rf_29", topic:"Relations & Functions", difficulty:"Easy", question:"What is the x-intercept of y = 2x − 8?", choices:["−4","8","4","−8"], answer:2, hint:"" },
      { id:"a1rf_30", topic:"Relations & Functions", difficulty:"Medium", question:"The y-intercept of a graph occurs where:", choices:["the slope is 0","x = 0","y = 0","x = y"], answer:1, hint:"" },
      { id:"a1rf_31", topic:"Relations & Functions", difficulty:"Medium", question:"The x-intercept of a graph occurs where:", choices:["x = y","x = 0","y = 0","x = 1"], answer:2, hint:"" },
      { id:"a1rf_32", topic:"Relations & Functions", difficulty:"Medium", question:"Find the x-intercept of 3x + 4y = 12.", choices:["(0, 4)","(0, 3)","(3, 0)","(4, 0)"], answer:3, hint:"" },
      { id:"a1rf_33", topic:"Relations & Functions", difficulty:"Medium", question:"Find the y-intercept of 3x + 4y = 12.", choices:["(4, 0)","(3, 0)","(0, 4)","(0, 3)"], answer:3, hint:"" },
      { id:"a1rf_34", topic:"Relations & Functions", difficulty:"Medium", question:"What are the x-intercepts of y = x² − 9?", choices:["(9,0)","(3,0) and (−3,0)","(0,−9)","(0,9)"], answer:1, hint:"" },
      { id:"a1rf_35", topic:"Relations & Functions", difficulty:"Hard", question:"f(x) = x² − 5x + 6. The x-intercepts are:", choices:["x = 5 and x = 6","x = 1 and x = 6","x = −2 and x = −3","x = 2 and x = 3"], answer:3, hint:"" },
      { id:"a1rf_36", topic:"Relations & Functions", difficulty:"Hard", question:"How many x-intercepts does y = x² + 4 have?", choices:["2","infinite","1","0"], answer:3, hint:"" },
      { id:"a1rf_37", topic:"Relations & Functions", difficulty:"Medium", question:"A line passes through (0, −3). Its y-intercept is:", choices:["0","−3","undefined","3"], answer:1, hint:"" },
      { id:"a1rf_38", topic:"Relations & Functions", difficulty:"Medium", question:"If f(2) = 5, which point is on the graph of f?", choices:["(2, 2)","(5, 2)","(2, 5)","(5, 5)"], answer:2, hint:"" },
      { id:"a1rf_39", topic:"Relations & Functions", difficulty:"Medium", question:"The independent variable in y = f(x) is:", choices:["f","x","both","y"], answer:1, hint:"" },
      { id:"a1rf_40", topic:"Relations & Functions", difficulty:"Medium", question:"A function that increases everywhere has a graph that:", choices:["is horizontal","is vertical","falls left to right","rises left to right"], answer:3, hint:"" },
      { id:"a1rf_41", topic:"Relations & Functions", difficulty:"Medium", question:"If the range of f is {3} for all x, f is a:", choices:["identity","constant function","linear function","quadratic"], answer:1, hint:"" },
      { id:"a1rf_42", topic:"Relations & Functions", difficulty:"Hard", question:"Which function has domain all reals but range y ≥ −4?", choices:["f(x) = 2x","f(x) = x² − 4","f(x) = 1/x","f(x) = √x"], answer:1, hint:"" },
      { id:"a1rf_43", topic:"Relations & Functions", difficulty:"Hard", question:"The graph of f(x) = x³ has domain and range:", choices:["domain x≠0","both all real numbers","range y≥0","domain x≥0"], answer:1, hint:"" },
      { id:"a1rf_44", topic:"Relations & Functions", difficulty:"Hard", question:"If f(x) = (x−1)(x+2), the y-intercept is:", choices:["(1, 0)","(0, −2)","(0, 2)","(−2, 0)"], answer:1, hint:"" },
      { id:"a1rf_45", topic:"Relations & Functions", difficulty:"Hard", question:"A relation where every output also comes from exactly one input is called:", choices:["onto","constant","one-to-one","even"], answer:2, hint:"" },
      { id:"a1rf_46", topic:"Relations & Functions", difficulty:"Hard", question:"f(x) = |x − 3|. Its minimum value (bottom of range) is:", choices:["−3","3","0","1"], answer:2, hint:"" },
      { id:"a1rf_47", topic:"Relations & Functions", difficulty:"Hard", question:"The domain of f(x) = 5 (a constant function) is:", choices:["x = 5","all real numbers","{5}","x ≥ 0"], answer:1, hint:"" },
      { id:"a1rf_48", topic:"Relations & Functions", difficulty:"Hard", question:"If (a, 4) and (a, 7) are both in a relation, the relation is:", choices:["linear","not a function","a function","one-to-one"], answer:1, hint:"" },
      { id:"a1rf_49", topic:"Relations & Functions", difficulty:"Medium", question:"What is the range of the constant function f(x) = −2?", choices:["x = −2","{−2}","y ≥ −2","all reals"], answer:1, hint:"" },
      { id:"a1rf_50", topic:"Relations & Functions", difficulty:"Hard", question:"f(x) = √(x + 5). The smallest x in the domain is:", choices:["0","−5","−√5","5"], answer:1, hint:"" },
      { id:"a1rf_51", topic:"Relations & Functions", difficulty:"Medium", question:"If f(x) = x/2, what is f(10)?", choices:["2","20","5","10"], answer:2, hint:"" },
      { id:"a1rf_52", topic:"Relations & Functions", difficulty:"Easy", question:"A mapping diagram shows: 1→5, 2→6, 3→7. Is this a function?", choices:["Only if inputs repeat","No","Cannot tell","Yes"], answer:3, hint:"" },
      { id:"a1rf_53", topic:"Relations & Functions", difficulty:"Easy", question:"A mapping shows: 4→1, 4→2, 5→3. Is this a function?", choices:["Yes","Sometimes","No","Only for x=5"], answer:2, hint:"" },
      { id:"a1rf_54", topic:"Relations & Functions", difficulty:"Medium", question:"A mapping diagram maps 0→2, 1→2, 2→2. Is it a function?", choices:["No (not one-to-one)","No (outputs repeat)","Yes (each input has one output)","Cannot tell"], answer:2, hint:"" },
      { id:"a1rf_55", topic:"Relations & Functions", difficulty:"Medium", question:"In a mapping where every arrow from the left points to a different right value AND each right value is hit once, the relation is:", choices:["constant","one-to-one","not a function","many-to-one"], answer:1, hint:"" },
      { id:"a1rf_56", topic:"Relations & Functions", difficulty:"Medium", question:"A mapping diagram: −1→3, 0→3, 1→3, 2→3. This represents a:", choices:["non-function","one-to-one function","linear increasing function","constant function"], answer:3, hint:"" },
      { id:"a1rf_57", topic:"Relations & Functions", difficulty:"Medium", question:"A mapping has inputs {a, b} and shows a→1, a→2, b→3. The problem is:", choices:["it is one-to-one","nothing; it's a function","output 3 is unused","input 'a' has two outputs"], answer:3, hint:"" },
      { id:"a1rf_58", topic:"Relations & Functions", difficulty:"Hard", question:"A mapping diagram is a function AND one-to-one when:", choices:["each output repeats","each input maps to one output and no two inputs share an output","it maps to zero","inputs repeat"], answer:1, hint:"" },
      { id:"a1rf_59", topic:"Relations & Functions", difficulty:"Easy", question:"A table has x: 1, 2, 3 and y: 4, 5, 6. Is y a function of x?", choices:["Only if y repeats","No","Yes","Cannot tell"], answer:2, hint:"" },
      { id:"a1rf_60", topic:"Relations & Functions", difficulty:"Easy", question:"A table has x: 2, 2, 3 and y: 5, 8, 9. Is this a function?", choices:["Sometimes","No (x=2 gives two y's)","Yes","Only for x=3"], answer:1, hint:"" },
      { id:"a1rf_61", topic:"Relations & Functions", difficulty:"Medium", question:"From the table x: 0,1,2,3 and y: 1,3,5,7, the rule could be:", choices:["y = x + 1","y = 3x","y = x²","y = 2x + 1"], answer:3, hint:"" },
      { id:"a1rf_62", topic:"Relations & Functions", difficulty:"Medium", question:"A table shows x: 1,2,3 → y: 2,4,6. What is y when x = 5 (same pattern)?", choices:["5","12","10","8"], answer:2, hint:"" },
      { id:"a1rf_63", topic:"Relations & Functions", difficulty:"Medium", question:"In a function table, which situation is NOT allowed?", choices:["y = 0 for some x","Same x-value with two different y-values","Negative x-values","Same y for two x-values"], answer:1, hint:"" },
      { id:"a1rf_64", topic:"Relations & Functions", difficulty:"Medium", question:"A table: x: −2,−1,0,1 and y: 4,1,0,1. The rule is likely:", choices:["y = −x","y = x²","y = x + 2","y = 2x"], answer:1, hint:"" },
      { id:"a1rf_65", topic:"Relations & Functions", difficulty:"Hard", question:"A table has x: 1,2,3,4 and y: 3,3,3,3. The range of this function is:", choices:["{1,2,3,4}","{3}","{3,3,3,3}","all reals"], answer:1, hint:"" },
      { id:"a1rf_66", topic:"Relations & Functions", difficulty:"Hard", question:"From a table with points (1,2),(2,5),(3,10),(4,17), the pattern y = x² + 1 predicts y at x=5:", choices:["21","25","24","26"], answer:3, hint:"" },
      { id:"a1rf_67", topic:"Relations & Functions", difficulty:"Easy", question:"The vertical line test: if any vertical line hits the graph more than once, the graph is:", choices:["increasing","not a function","a function","linear"], answer:1, hint:"" },
      { id:"a1rf_68", topic:"Relations & Functions", difficulty:"Easy", question:"Does the graph of a straight non-vertical line pass the vertical line test?", choices:["No","Only through origin","Yes","Only if positive slope"], answer:2, hint:"" },
      { id:"a1rf_69", topic:"Relations & Functions", difficulty:"Medium", question:"A circle's graph (x² + y² = 9): does it pass the vertical line test?", choices:["Yes","Only top half","No","Only at x=0"], answer:2, hint:"" },
      { id:"a1rf_70", topic:"Relations & Functions", difficulty:"Medium", question:"A vertical line x = 4: is it a function?", choices:["Sometimes","No","Yes","Only at y=4"], answer:1, hint:"" },
      { id:"a1rf_71", topic:"Relations & Functions", difficulty:"Medium", question:"A parabola opening upward (y = x²): does it pass the vertical line test?", choices:["Only at vertex","Only right half","Yes","No"], answer:2, hint:"" },
      { id:"a1rf_72", topic:"Relations & Functions", difficulty:"Medium", question:"A sideways parabola (x = y²): is it a function of x?", choices:["Yes","Only top half only","No","Always"], answer:2, hint:"" },
      { id:"a1rf_73", topic:"Relations & Functions", difficulty:"Medium", question:"From a graph, the y-intercept is read where the curve crosses the:", choices:["asymptote","y-axis","origin only","x-axis"], answer:1, hint:"" },
      { id:"a1rf_74", topic:"Relations & Functions", difficulty:"Medium", question:"From a graph, the x-intercept(s) are where the curve crosses the:", choices:["y-axis","x-axis","y = 1 line","vertex"], answer:1, hint:"" },
      { id:"a1rf_75", topic:"Relations & Functions", difficulty:"Hard", question:"A graph passes through (0,0),(1,1),(2,4),(3,9). It represents:", choices:["y = 2x","y = x + 1","y = 3x","y = x²"], answer:3, hint:"" },
      { id:"a1rf_76", topic:"Relations & Functions", difficulty:"Hard", question:"A graph is a function and each horizontal line also hits it once. The function is:", choices:["many-to-one","not a function","one-to-one","constant"], answer:2, hint:"" },
      { id:"a1rf_77", topic:"Relations & Functions", difficulty:"Hard", question:"A graph shows a curve where x = 2 corresponds to both y = 1 and y = −1. The graph is:", choices:["linear","one-to-one","a function","not a function"], answer:3, hint:"" },
      { id:"a1qf_1", topic:"Quadratic Functions", difficulty:"Easy", question:"What shape is the graph of a quadratic function?", choices:["Hyperbola","Parabola","Line","Circle"], answer:1, hint:"" },
      { id:"a1qf_2", topic:"Quadratic Functions", difficulty:"Easy", question:"In y = x², the vertex is at:", choices:["(0, 1)","(0, 0)","(1, 1)","(1, 0)"], answer:1, hint:"" },
      { id:"a1qf_3", topic:"Quadratic Functions", difficulty:"Easy", question:"The graph of y = x² + 3 opens:", choices:["downward","left","right","upward"], answer:3, hint:"" },
      { id:"a1qf_4", topic:"Quadratic Functions", difficulty:"Easy", question:"The graph of y = −x² opens:", choices:["upward","left","right","downward"], answer:3, hint:"" },
      { id:"a1qf_5", topic:"Quadratic Functions", difficulty:"Easy", question:"The vertex of y = (x − 2)² is at:", choices:["(0, 2)","(2, 0)","(2, 2)","(−2, 0)"], answer:1, hint:"" },
      { id:"a1qf_6", topic:"Quadratic Functions", difficulty:"Medium", question:"The vertex of y = (x − 3)² + 4 is:", choices:["(−3, 4)","(3, −4)","(3, 4)","(4, 3)"], answer:2, hint:"" },
      { id:"a1qf_7", topic:"Quadratic Functions", difficulty:"Medium", question:"The axis of symmetry of y = (x + 1)² is:", choices:["x = 1","x = −1","y = 1","x = 0"], answer:1, hint:"" },
      { id:"a1qf_8", topic:"Quadratic Functions", difficulty:"Medium", question:"The axis of symmetry of y = x² − 6x + 5 is:", choices:["x = 6","x = 5","x = −3","x = 3"], answer:3, hint:"" },
      { id:"a1qf_9", topic:"Quadratic Functions", difficulty:"Medium", question:"In y = a(x − h)² + k, the vertex is:", choices:["(h, −k)","(k, h)","(h, k)","(−h, k)"], answer:2, hint:"" },
      { id:"a1qf_10", topic:"Quadratic Functions", difficulty:"Medium", question:"The vertex of y = −2(x + 4)² − 1 is:", choices:["(−1, −4)","(−4, 1)","(4, −1)","(−4, −1)"], answer:3, hint:"" },
      { id:"a1qf_11", topic:"Quadratic Functions", difficulty:"Medium", question:"The minimum value of y = x² − 4x + 7 is at x =", choices:["7","4","−2","2"], answer:3, hint:"" },
      { id:"a1qf_12", topic:"Quadratic Functions", difficulty:"Hard", question:"The vertex of y = x² − 8x + 10 is:", choices:["(4, 6)","(8, 10)","(4, −6)","(−4, −6)"], answer:2, hint:"" },
      { id:"a1qf_13", topic:"Quadratic Functions", difficulty:"Hard", question:"Convert y = x² + 6x + 5 to vertex form.", choices:["y = (x + 3)² + 4","y = (x + 6)² + 5","y = (x − 3)² − 4","y = (x + 3)² − 4"], answer:3, hint:"" },
      { id:"a1qf_14", topic:"Quadratic Functions", difficulty:"Hard", question:"A parabola has vertex (2, −3) and opens up. Its minimum value is:", choices:["3","2","−3","−2"], answer:2, hint:"" },
      { id:"a1qf_15", topic:"Quadratic Functions", difficulty:"Easy", question:"Solve: x² = 16", choices:["x = 4","x = 16","x = 8","x = 4 or x = −4"], answer:3, hint:"" },
      { id:"a1qf_16", topic:"Quadratic Functions", difficulty:"Easy", question:"Solve: x² − 25 = 0", choices:["x = −25","x = 25","x = 5 or x = −5","x = 5"], answer:2, hint:"" },
      { id:"a1qf_17", topic:"Quadratic Functions", difficulty:"Medium", question:"Solve: x² − 7x + 12 = 0", choices:["x = 3 or x = 5","x = 3 or x = 4","x = 7 or x = 12","x = −3 or x = −4"], answer:1, hint:"" },
      { id:"a1qf_18", topic:"Quadratic Functions", difficulty:"Medium", question:"Solve: x² + 5x + 6 = 0", choices:["x = 2 or x = 3","x = −2 or x = −3","x = −5 or x = −6","x = 1 or x = 6"], answer:1, hint:"" },
      { id:"a1qf_19", topic:"Quadratic Functions", difficulty:"Medium", question:"The x-intercepts of y = x² − 4 are:", choices:["(4,0)","(0,−4)","(2,0) and (−2,0)","(0,4)"], answer:2, hint:"" },
      { id:"a1qf_20", topic:"Quadratic Functions", difficulty:"Medium", question:"The y-intercept of y = x² − 3x + 2 is:", choices:["(2, 0)","(0, 0)","(0, −3)","(0, 2)"], answer:3, hint:"" },
      { id:"a1qf_21", topic:"Quadratic Functions", difficulty:"Medium", question:"Solve: x² − 9x = 0", choices:["x = −9","x = 9","x = 0 or x = 9","x = 0"], answer:2, hint:"" },
      { id:"a1qf_22", topic:"Quadratic Functions", difficulty:"Medium", question:"The roots of y = (x − 5)(x + 2) are:", choices:["x = −5 and x = 2","x = 5 and x = −2","x = 5 and x = 2","x = 10"], answer:1, hint:"" },
      { id:"a1qf_23", topic:"Quadratic Functions", difficulty:"Hard", question:"Solve using the quadratic formula: x² + 4x + 2 = 0", choices:["x = −4 ± √2","x = −2 ± √3","x = 2 ± √2","x = −2 ± √2"], answer:3, hint:"" },
      { id:"a1qf_24", topic:"Quadratic Functions", difficulty:"Hard", question:"Solve: 2x² − 8 = 0", choices:["x = 2","x = 4","x = ±4","x = 2 or x = −2"], answer:3, hint:"" },
      { id:"a1qf_25", topic:"Quadratic Functions", difficulty:"Hard", question:"How many real solutions does x² + 2x + 5 = 0 have?", choices:["infinite","2","0","1"], answer:2, hint:"" },
      { id:"a1qf_26", topic:"Quadratic Functions", difficulty:"Hard", question:"The discriminant of x² − 6x + 9 is:", choices:["−36","0","9","36"], answer:1, hint:"" },
      { id:"a1qf_27", topic:"Quadratic Functions", difficulty:"Hard", question:"If a quadratic has discriminant > 0, it has:", choices:["one real root","complex roots only","no real roots","two real roots"], answer:3, hint:"" },
      { id:"a1qf_28", topic:"Quadratic Functions", difficulty:"Medium", question:"Factor: x² + 7x + 10", choices:["(x − 2)(x − 5)","(x + 3)(x + 4)","(x + 2)(x + 5)","(x + 1)(x + 10)"], answer:2, hint:"" },
      { id:"a1qf_29", topic:"Quadratic Functions", difficulty:"Medium", question:"Factor: x² − 9", choices:["(x − 9)(x + 1)","(x + 9)(x − 1)","(x − 3)(x + 3)","(x − 3)²"], answer:2, hint:"" },
      { id:"a1qf_30", topic:"Quadratic Functions", difficulty:"Medium", question:"Factor: x² − 5x + 6", choices:["(x − 1)(x − 6)","(x + 2)(x + 3)","(x − 5)(x − 1)","(x − 2)(x − 3)"], answer:3, hint:"" },
      { id:"a1qf_31", topic:"Quadratic Functions", difficulty:"Medium", question:"Factor: x² + 2x − 15", choices:["(x − 5)(x + 3)","(x + 5)(x − 3)","(x + 15)(x − 1)","(x + 5)(x + 3)"], answer:1, hint:"" },
      { id:"a1qf_32", topic:"Quadratic Functions", difficulty:"Hard", question:"Factor: 2x² + 7x + 3", choices:["(2x + 3)(x + 1)","(2x + 1)(x + 3)","(x + 1)(x + 3)","(2x + 3)(x + 3)"], answer:1, hint:"" },
      { id:"a1qf_33", topic:"Quadratic Functions", difficulty:"Hard", question:"Factor completely: 3x² − 12", choices:["3(x − 4)(x + 1)","3(x − 2)(x + 2)","(3x − 6)(x + 2)","3(x² − 4)"], answer:1, hint:"" },
      { id:"a1qf_34", topic:"Quadratic Functions", difficulty:"Hard", question:"Factor: x² − 10x + 25", choices:["(x + 5)²","(x − 5)(x + 5)","(x − 25)(x − 1)","(x − 5)²"], answer:3, hint:"" },
      { id:"a1qf_35", topic:"Quadratic Functions", difficulty:"Medium", question:"Compared to y = x², the graph y = x² + 5 is shifted:", choices:["left 5","down 5","right 5","up 5"], answer:3, hint:"" },
      { id:"a1qf_36", topic:"Quadratic Functions", difficulty:"Medium", question:"Compared to y = x², the graph y = (x − 3)² is shifted:", choices:["down 3","right 3","up 3","left 3"], answer:1, hint:"" },
      { id:"a1qf_37", topic:"Quadratic Functions", difficulty:"Medium", question:"The graph y = 2x² is _____ compared to y = x².", choices:["shifted up","wider","shifted right","narrower"], answer:3, hint:"" },
      { id:"a1qf_38", topic:"Quadratic Functions", difficulty:"Medium", question:"The graph y = (1/2)x² is _____ compared to y = x².", choices:["shifted down","narrower","reflected","wider"], answer:3, hint:"" },
      { id:"a1qf_39", topic:"Quadratic Functions", difficulty:"Hard", question:"y = −(x − 2)² + 3 has vertex ___ and opens ___.", choices:["(2, −3), up","(−2, 3), down","(2, 3), down","(2, 3), up"], answer:2, hint:"" },
      { id:"a1qf_40", topic:"Quadratic Functions", difficulty:"Hard", question:"The maximum value of y = −x² + 6x − 5 is:", choices:["5","3","4","6"], answer:2, hint:"" },
      { id:"a1qf_41", topic:"Quadratic Functions", difficulty:"Hard", question:"A ball's height is h = −16t² + 48t. Its max height occurs at t =", choices:["48 s","24 s","1.5 s","3 s"], answer:2, hint:"" },
      { id:"a1qf_42", topic:"Quadratic Functions", difficulty:"Hard", question:"A parabola opens up with vertex (−1, −4). How many x-intercepts?", choices:["0","3","2","1"], answer:2, hint:"" },
      { id:"a1qf_43", topic:"Quadratic Functions", difficulty:"Medium", question:"The product of two numbers that sum to 10 is modeled by P = x(10 − x). This is a:", choices:["constant","linear function","exponential","quadratic function"], answer:3, hint:"" },
      { id:"a1qf_44", topic:"Quadratic Functions", difficulty:"Hard", question:"A garden's area A = w(20 − w). The width for maximum area is:", choices:["20","10","15","5"], answer:1, hint:"" },
      { id:"a1qf_45", topic:"Quadratic Functions", difficulty:"Hard", question:"A projectile: h = −5t² + 20t. When does it hit the ground (h=0, t>0)?", choices:["20 s","5 s","4 s","2 s"], answer:2, hint:"" },
      { id:"a1qf_46", topic:"Quadratic Functions", difficulty:"Hard", question:"The revenue R = −2x² + 40x is maximized at x =", choices:["20","40","10","5"], answer:2, hint:"" },
      { id:"a1qf_47", topic:"Quadratic Functions", difficulty:"Medium", question:"If a quadratic's vertex is its highest point, the parabola opens:", choices:["right","downward","upward","left"], answer:1, hint:"" },
      { id:"a1qf_48", topic:"Quadratic Functions", difficulty:"Hard", question:"Two consecutive integers have a product of 30. The equation is:", choices:["x + (x+1) = 30","2x = 30","x² = 30","x(x+1) = 30"], answer:3, hint:"" },
      { id:"a1qf_49", topic:"Quadratic Functions", difficulty:"Medium", question:"The graph of y = x² − 1 crosses the x-axis at:", choices:["x = 1","x = 0","x = 1 and x = −1","x = −1"], answer:2, hint:"" },
      { id:"a1qf_50", topic:"Quadratic Functions", difficulty:"Medium", question:"The y-intercept of y = 2x² − 3x + 5 is:", choices:["(0, 2)","(0, 5)","(0, −3)","(5, 0)"], answer:1, hint:"" },
      { id:"a1qf_51", topic:"Quadratic Functions", difficulty:"Hard", question:"If y = x² + bx + 9 is a perfect square trinomial, b could be:", choices:["3 or −3","only 6","9 or −9","6 or −6"], answer:3, hint:"" },
      { id:"a1fac_1", topic:"Factoring Polynomials", difficulty:"Easy", question:"Factor out the GCF: 6x + 9", choices:["x(6 + 9)","3(2x + 3)","6(x + 9)","3(2x + 9)"], answer:1, hint:"" },
      { id:"a1fac_2", topic:"Factoring Polynomials", difficulty:"Easy", question:"Factor out the GCF: 4x² + 8x", choices:["x(4x + 8)","4(x² + 2)","4x(x + 2)","4x(x + 8)"], answer:2, hint:"" },
      { id:"a1fac_3", topic:"Factoring Polynomials", difficulty:"Easy", question:"Factor out the GCF: 10x³ − 5x", choices:["5(2x³ − x)","5x(2x² − 1)","5x(2x² − x)","x(10x² − 5)"], answer:1, hint:"" },
      { id:"a1fac_4", topic:"Factoring Polynomials", difficulty:"Medium", question:"Factor out the GCF: 12x²y + 18xy²", choices:["3xy(4x + 6y)","6xy(2x + 3)","6xy(2x + 3y)","6x(2xy + 3y²)"], answer:2, hint:"" },
      { id:"a1fac_5", topic:"Factoring Polynomials", difficulty:"Easy", question:"Factor: x² + 5x + 6", choices:["(x − 2)(x − 3)","(x + 2)(x + 4)","(x + 1)(x + 6)","(x + 2)(x + 3)"], answer:3, hint:"" },
      { id:"a1fac_6", topic:"Factoring Polynomials", difficulty:"Easy", question:"Factor: x² + 7x + 12", choices:["(x + 1)(x + 12)","(x + 2)(x + 6)","(x + 3)(x + 4)","(x + 3)(x + 5)"], answer:2, hint:"" },
      { id:"a1fac_7", topic:"Factoring Polynomials", difficulty:"Medium", question:"Factor: x² − 5x + 6", choices:["(x − 2)(x − 4)","(x + 2)(x + 3)","(x − 2)(x − 3)","(x − 1)(x − 6)"], answer:2, hint:"" },
      { id:"a1fac_8", topic:"Factoring Polynomials", difficulty:"Medium", question:"Factor: x² + 2x − 15", choices:["(x + 15)(x − 1)","(x + 5)(x − 3)","(x + 5)(x + 3)","(x − 5)(x + 3)"], answer:1, hint:"" },
      { id:"a1fac_9", topic:"Factoring Polynomials", difficulty:"Medium", question:"Factor: x² − 4x − 21", choices:["(x + 7)(x − 3)","(x − 21)(x + 1)","(x − 7)(x − 3)","(x − 7)(x + 3)"], answer:3, hint:"" },
      { id:"a1fac_10", topic:"Factoring Polynomials", difficulty:"Medium", question:"Factor: x² − x − 12", choices:["(x − 12)(x + 1)","(x − 6)(x + 2)","(x + 4)(x − 3)","(x − 4)(x + 3)"], answer:3, hint:"" },
      { id:"a1fac_11", topic:"Factoring Polynomials", difficulty:"Medium", question:"Factor: x² + 9x + 20", choices:["(x + 1)(x + 20)","(x + 2)(x + 10)","(x + 4)(x + 5)","(x + 4)(x + 6)"], answer:2, hint:"" },
      { id:"a1fac_12", topic:"Factoring Polynomials", difficulty:"Easy", question:"Factor: x² − 9", choices:["(x − 3)²","(x + 9)(x − 1)","(x − 9)(x + 1)","(x − 3)(x + 3)"], answer:3, hint:"" },
      { id:"a1fac_13", topic:"Factoring Polynomials", difficulty:"Medium", question:"Factor: x² − 49", choices:["(x − 49)","(x − 7)(x + 7)","(x + 49)(x − 1)","(x − 7)²"], answer:1, hint:"" },
      { id:"a1fac_14", topic:"Factoring Polynomials", difficulty:"Medium", question:"Factor: 4x² − 25", choices:["(4x − 5)(x + 5)","(2x − 5)²","(2x + 25)(2x − 1)","(2x − 5)(2x + 5)"], answer:3, hint:"" },
      { id:"a1fac_15", topic:"Factoring Polynomials", difficulty:"Medium", question:"Factor: 9x² − 16", choices:["(9x − 16)","(3x − 4)²","(3x − 16)(3x + 1)","(3x − 4)(3x + 4)"], answer:3, hint:"" },
      { id:"a1fac_16", topic:"Factoring Polynomials", difficulty:"Hard", question:"Factor: x⁴ − 16", choices:["(x² − 4)(x² + 4)","(x² − 16)(x²)","(x − 2)⁴","(x² + 4)(x − 2)(x + 2)"], answer:3, hint:"" },
      { id:"a1fac_17", topic:"Factoring Polynomials", difficulty:"Medium", question:"Factor: x² + 6x + 9", choices:["(x − 3)²","(x + 3)²","(x + 9)(x + 1)","(x + 3)(x − 3)"], answer:1, hint:"" },
      { id:"a1fac_18", topic:"Factoring Polynomials", difficulty:"Medium", question:"Factor: x² − 10x + 25", choices:["(x − 5)(x + 5)","(x + 5)²","(x − 5)²","(x − 25)(x − 1)"], answer:2, hint:"" },
      { id:"a1fac_19", topic:"Factoring Polynomials", difficulty:"Hard", question:"Factor: 4x² + 12x + 9", choices:["(4x + 3)(x + 3)","(2x − 3)²","(2x + 3)²","(2x + 9)(2x + 1)"], answer:2, hint:"" },
      { id:"a1fac_20", topic:"Factoring Polynomials", difficulty:"Hard", question:"Factor: 2x² + 7x + 3", choices:["(2x + 3)(x + 1)","(2x + 1)(x + 3)","(x + 1)(x + 3)","(2x + 3)(x + 3)"], answer:1, hint:"" },
      { id:"a1fac_21", topic:"Factoring Polynomials", difficulty:"Hard", question:"Factor: 3x² + 10x + 8", choices:["(3x + 8)(x + 1)","(3x + 4)(x + 2)","(x + 4)(x + 2)","(3x + 2)(x + 4)"], answer:1, hint:"" },
      { id:"a1fac_22", topic:"Factoring Polynomials", difficulty:"Hard", question:"Factor: 2x² − 5x − 3", choices:["(2x − 3)(x + 1)","(2x + 3)(x − 1)","(2x − 1)(x + 3)","(2x + 1)(x − 3)"], answer:3, hint:"" },
      { id:"a1fac_23", topic:"Factoring Polynomials", difficulty:"Hard", question:"Factor: 6x² + x − 2", choices:["(3x − 2)(2x + 1)","(3x + 1)(2x − 2)","(3x + 2)(2x − 1)","(6x + 2)(x − 1)"], answer:2, hint:"" },
      { id:"a1fac_24", topic:"Factoring Polynomials", difficulty:"Hard", question:"Factor by grouping: x³ + 2x² + 3x + 6", choices:["(x² + 2)(x + 3)","(x + 3)(x² + 2)","(x + 2)(x² + 3)","(x + 2)(x + 3)"], answer:2, hint:"" },
      { id:"a1fac_25", topic:"Factoring Polynomials", difficulty:"Hard", question:"Factor by grouping: 2x³ + 4x² + x + 2", choices:["(x + 2)(2x + 1)","(2x² + 2)(x + 1)","(2x + 1)(x² + 2)","(x + 2)(2x² + 1)"], answer:3, hint:"" },
      { id:"a1fac_26", topic:"Factoring Polynomials", difficulty:"Hard", question:"Factor completely: 3x² − 12", choices:["3(x − 4)(x + 1)","3(x² − 4)","3(x − 2)(x + 2)","(3x − 6)(x + 2)"], answer:2, hint:"" },
      { id:"a1fac_27", topic:"Factoring Polynomials", difficulty:"Hard", question:"Factor completely: 2x² + 10x + 12", choices:["(2x + 4)(x + 3)","2(x + 2)(x + 3)","2(x + 1)(x + 6)","2(x² + 5x + 6)"], answer:1, hint:"" },
      { id:"a1fac_28", topic:"Factoring Polynomials", difficulty:"Hard", question:"Factor completely: x³ − 4x", choices:["x²(x − 4)","(x − 2)(x + 2)","x(x − 2)(x + 2)","x(x² − 4)"], answer:2, hint:"" },
      { id:"a1fac_29", topic:"Factoring Polynomials", difficulty:"Medium", question:"Factor: x² − 100", choices:["(x − 50)(x + 2)","(x − 10)(x + 10)","(x − 10)²","(x − 100)(x + 1)"], answer:1, hint:"" },
      { id:"a1fac_30", topic:"Factoring Polynomials", difficulty:"Hard", question:"Factor completely: 5x³ − 45x", choices:["5(x³ − 9x)","5x(x − 3)(x + 3)","x(5x − 15)(x + 3)","5x(x² − 9)"], answer:1, hint:"" },
    ],
  },

  geometry: {
    id: "geometry", label: "Geometry", emoji: "GEO",
    color: "#C44DF6", bg: "#F7E9FF", dark: "#9B2FD6",
    tagline: "Shapes, proofs & spatial thinking",
    topics: [
      { name: "Angles & Lines", icon: "", color: "#C44DF6", bg: "#F7E9FF" },
      { name: "Logic & Reasoning", icon: "", color: "#7C3AED", bg: "#EDE9FE" },
      { name: "Parallel Lines & Transversals", icon: "", color: "#0EA5A0", bg: "#DFF7F3" },
      { name: "Triangles", icon: "△", color: C.coral, bg: C.blush },
      { name: "Triangle Proofs & Congruence", icon: "", color: "#7C3AED", bg: "#EDE9FE" },
      { name: "Circles", icon: "", color: C.teal, bg: C.mint },
      { name: "Area & Perimeter", icon: "", color: "#E8960C", bg: C.cream },
      { name: "Volume & Surface Area", icon: "", color: C.sky, bg: "#E5F2FF" },
      { name: "Coordinate Geometry", icon: "", color: "#22A347", bg: "#E6F9EE" },
      { name: "Polygons", icon: "", color: "#EA580C", bg: "#FFEDD5" },
      { name: "Quadrilaterals", icon: "", color: "#0891B2", bg: "#CFFAFE" },
    ],
    seeds: [
      { id:"geo1", topic:"Angles & Lines", difficulty:"Easy", question:"Two angles are supplementary. One measures 65°. What is the other?", choices:["35°","25°","115°","90°"], answer:2, hint:"Supplementary angles add up to 180°." },
      { id:"geo2", topic:"Angles & Lines", difficulty:"Medium", question:"Two parallel lines are cut by a transversal. One co-interior angle is 72°. Find the other.", choices:["18°","90°","72°","108°"], answer:3, hint:"Co-interior angles are supplementary: they add to 180°." },
      { id:"geo3", topic:"Triangles", difficulty:"Easy", question:"A triangle has angles 45° and 80°. What is the third angle?", choices:["35°","45°","80°","55°"], answer:3, hint:"All three angles add up to 180°." },
      { id:"geo4", topic:"Triangles", difficulty:"Hard", question:"In a 30-60-90 triangle, the shortest side is 7. What is the hypotenuse?", choices:["7√2","21","7√3","14"], answer:3, hint:"The hypotenuse is exactly twice the shortest side." },
      { id:"geo5", topic:"Circles", difficulty:"Easy", question:"What is the circumference of a circle with radius 6? (π ≈ 3.14)", choices:["113.04","18.84","37.68","28.26"], answer:2, hint:"C = 2πr" },
      { id:"geo6", topic:"Circles", difficulty:"Hard", question:"An arc subtends 120° in a circle of radius 9. What is the arc length? (leave in terms of π)", choices:["9π","6π","3π","18π"], answer:1, hint:"Arc length = (θ/360°) × 2πr." },
      { id:"geo7", topic:"Area & Perimeter", difficulty:"Easy", question:"What is the area of a triangle with base 10 and height 6?", choices:["60","15","16","30"], answer:3, hint:"A = ½ × base × height" },
      { id:"geo8", topic:"Area & Perimeter", difficulty:"Medium", question:"A square has perimeter 36. What is its area?", choices:["72","81","36","9"], answer:1, hint:"Find the side length first: 36 ÷ 4 = 9. Then square it." },
      { id:"geo9", topic:"Volume & Surface Area", difficulty:"Medium", question:"Find the volume of a rectangular prism: length 5, width 3, height 4.", choices:["120","47","60","94"], answer:2, hint:"V = l × w × h" },
      { id:"geo10", topic:"Coordinate Geometry", difficulty:"Medium", question:"What is the distance between (1, 2) and (4, 6)?", choices:["7","5","√7","4"], answer:1, hint:"Distance = √((x₂−x₁)² + (y₂−y₁)²) = √(9 + 16)." },
      { id:"geo_lr_1", topic:"Logic & Reasoning", difficulty:"Easy", question:"In the statement 'If it rains, then the ground is wet,' what is the hypothesis?", choices:["If it rains then wet","The ground is wet","It rains","Then the ground is wet"], answer:2, hint:"The hypothesis is the 'if' part." },
      { id:"geo_lr_2", topic:"Logic & Reasoning", difficulty:"Easy", question:"In 'If a shape is a square, then it has 4 sides,' what is the conclusion?", choices:["A shape is a square","If a shape is a square","Squares are shapes","It has 4 sides"], answer:3, hint:"The conclusion is the 'then' part." },
      { id:"geo_lr_3", topic:"Logic & Reasoning", difficulty:"Easy", question:"Which is the converse of 'If P, then Q'?", choices:["If not P, then not Q","If Q, then P","P and Q","If not Q, then not P"], answer:1, hint:"The converse swaps hypothesis and conclusion." },
      { id:"geo_lr_4", topic:"Logic & Reasoning", difficulty:"Easy", question:"Which is the inverse of 'If P, then Q'?", choices:["P or Q","If not Q, then not P","If not P, then not Q","If Q, then P"], answer:2, hint:"The inverse negates both parts, keeping order." },
      { id:"geo_lr_5", topic:"Logic & Reasoning", difficulty:"Medium", question:"Which is the contrapositive of 'If P, then Q'?", choices:["If not P, then not Q","If not Q, then not P","If Q, then P","If P, then not Q"], answer:1, hint:"The contrapositive swaps AND negates both parts." },
      { id:"geo_lr_6", topic:"Logic & Reasoning", difficulty:"Medium", question:"Write the converse: 'If an animal is a dog, then it is a mammal.'", choices:["If an animal is not a mammal, then it is not a dog","All mammals are dogs","If an animal is a mammal, then it is a dog","If an animal is not a dog, then it is not a mammal"], answer:2, hint:"Swap hypothesis and conclusion (don't negate)." },
      { id:"geo_lr_7", topic:"Logic & Reasoning", difficulty:"Medium", question:"A statement and its contrapositive are always...", choices:["Opposites","Always true","Unrelated","Both true or both false"], answer:3, hint:"A conditional and its contrapositive are logically equivalent." },
      { id:"geo_lr_8", topic:"Logic & Reasoning", difficulty:"Medium", question:"Given 'If x = 3, then x² = 9' is true. Is the converse 'If x² = 9, then x = 3' necessarily true?", choices:["Cannot be written","No, x could be −3","Only if x is positive stated","Yes, always"], answer:1, hint:"x² = 9 also when x = −3, so the converse fails." },
      { id:"geo_lr_9", topic:"Logic & Reasoning", difficulty:"Medium", question:"Law of Detachment: Given 'If P then Q' is true and P is true, what can you conclude?", choices:["P is false","Q is false","Q is true","Nothing"], answer:2, hint:"If the hypothesis holds and the conditional is true, the conclusion follows." },
      { id:"geo_lr_10", topic:"Logic & Reasoning", difficulty:"Medium", question:"Law of Syllogism: 'If P then Q' and 'If Q then R' are true. What follows?", choices:["If R then P","Q is true","If P then Q only","If P then R"], answer:3, hint:"Chain the conditionals: P leads to R." },
      { id:"geo_lr_11", topic:"Logic & Reasoning", difficulty:"Hard", question:"Given: 'If it is Tuesday, then we have gym.' Today we have gym. Can you conclude it is Tuesday?", choices:["Only on weekdays","No — that is the converse error","Yes, by detachment","Yes, by syllogism"], answer:1, hint:"Affirming the conclusion doesn't prove the hypothesis; it's invalid reasoning." },
      { id:"geo_lr_12", topic:"Logic & Reasoning", difficulty:"Hard", question:"Given: 'If a number is divisible by 6, then it is divisible by 3.' 12 is divisible by 6. Conclude?", choices:["Nothing","12 is divisible by 2","12 is prime","12 is divisible by 3"], answer:3, hint:"Law of Detachment: hypothesis true → conclusion true." },
      { id:"geo_lr_13", topic:"Logic & Reasoning", difficulty:"Hard", question:"'If you study, you pass.' 'If you pass, you graduate.' Maria studies. What follows?", choices:["Nothing certain","Maria studies only","Maria graduates","Maria fails"], answer:2, hint:"Combine syllogism (study→graduate) with detachment." },
      { id:"geo_lr_14", topic:"Logic & Reasoning", difficulty:"Hard", question:"A conditional is FALSE only when...", choices:["Both are true","Hypothesis false","Hypothesis true, conclusion false","Both are false"], answer:2, hint:"If P then Q is false only when P is true but Q is false." },
      { id:"geo_lr_15", topic:"Logic & Reasoning", difficulty:"Hard", question:"The statement 'If not Q, then not P' is the contrapositive of which?", choices:["If Q, then P","If P, then not Q","If not P, then not Q","If P, then Q"], answer:3, hint:"Negate and swap the contrapositive back to recover the original." },
      { id:"geo_lr_16", topic:"Parallel Lines & Transversals", difficulty:"Easy", question:"When two parallel lines are cut by a transversal, corresponding angles are...", choices:["Complementary","Congruent","Always 90°","Supplementary"], answer:1, hint:"Corresponding angles are equal." },
      { id:"geo_lr_17", topic:"Parallel Lines & Transversals", difficulty:"Easy", question:"Alternate interior angles formed by parallel lines and a transversal are...", choices:["Always right angles","Congruent","Complementary","Supplementary"], answer:1, hint:"Alternate interior angles are equal." },
      { id:"geo_lr_18", topic:"Parallel Lines & Transversals", difficulty:"Easy", question:"Co-interior (same-side interior) angles between parallel lines are...", choices:["Equal to 45°","Congruent","Complementary","Supplementary"], answer:3, hint:"They add to 180°." },
      { id:"geo_lr_19", topic:"Parallel Lines & Transversals", difficulty:"Easy", question:"If one angle formed is 70°, its vertical angle is...", choices:["20°","70°","90°","110°"], answer:1, hint:"Vertical angles are always equal." },
      { id:"geo_lr_20", topic:"Parallel Lines & Transversals", difficulty:"Easy", question:"Two parallel lines cut by a transversal: one angle is 65°. Its corresponding angle is...", choices:["90°","115°","25°","65°"], answer:3, hint:"Corresponding angles are congruent." },
      { id:"geo_lr_21", topic:"Parallel Lines & Transversals", difficulty:"Medium", question:"Parallel lines cut by a transversal. One angle is 130°. Its co-interior partner is...", choices:["40°","50°","230°","130°"], answer:1, hint:"Co-interior angles are supplementary: 180 − 130." },
      { id:"geo_lr_22", topic:"Parallel Lines & Transversals", difficulty:"Medium", question:"An alternate exterior angle pair: one is 105°. The other is...", choices:["15°","105°","75°","90°"], answer:1, hint:"Alternate exterior angles are congruent." },
      { id:"geo_lr_23", topic:"Parallel Lines & Transversals", difficulty:"Medium", question:"Two angles are a linear pair along the transversal. One is 80°. The other is...", choices:["180°","80°","10°","100°"], answer:3, hint:"A linear pair is supplementary." },
      { id:"geo_lr_24", topic:"Parallel Lines & Transversals", difficulty:"Medium", question:"Angle A and Angle B are corresponding. A = (2x + 10)° and B = 50°. Find x.", choices:["15","25","30","20"], answer:3, hint:"Corresponding angles equal: 2x + 10 = 50." },
      { id:"geo_lr_25", topic:"Parallel Lines & Transversals", difficulty:"Medium", question:"Co-interior angles: (3x)° and (2x + 20)°. Find x.", choices:["20","32","28","36"], answer:1, hint:"They sum to 180: 3x + 2x + 20 = 180 → 5x = 160." },
      { id:"geo_lr_26", topic:"Parallel Lines & Transversals", difficulty:"Hard", question:"Alternate interior angles (4x − 5)° and (3x + 15)° are congruent. Find x.", choices:["25","10","5","20"], answer:3, hint:"Set equal: 4x − 5 = 3x + 15 → x = 20." },
      { id:"geo_lr_27", topic:"Parallel Lines & Transversals", difficulty:"Hard", question:"If corresponding angles are NOT congruent when a transversal crosses two lines, the lines are...", choices:["Skew","Perpendicular","Not parallel","Parallel"], answer:2, hint:"Equal corresponding angles is the test for parallel; unequal means not parallel." },
      { id:"geo_lr_28", topic:"Parallel Lines & Transversals", difficulty:"Hard", question:"Two parallel lines, transversal makes angles (5x)° and (3x + 40)° as alternate interior angles. Find the angle measure.", choices:["20°","80°","100°","40°"], answer:2, hint:"5x = 3x + 40 → x = 20; angle = 5(20) = 100°." },
      { id:"geo_lr_29", topic:"Parallel Lines & Transversals", difficulty:"Hard", question:"Co-interior angles (x + 30)° and (2x)° are supplementary. Find both angles.", choices:["60° and 120°","50° and 130°","80° and 100°","90° and 90°"], answer:2, hint:"x + 30 + 2x = 180 → 3x = 150 → x = 50; angles 80° and 100°." },
      { id:"geo_lr_30", topic:"Parallel Lines & Transversals", difficulty:"Hard", question:"A transversal crosses two parallel lines. Angle 1 = 3x° and Angle 2 = (x + 60)° are vertical angles. Find x.", choices:["20","15","30","40"], answer:2, hint:"Vertical angles equal: 3x = x + 60 → 2x = 60." },
      { id:"geoproof_1", topic:"Triangle Proofs & Congruence", difficulty:"Easy", question:"Which postulate proves triangles congruent with two sides and the included angle?", choices:["SSA","SAS","AAA","SSS"], answer:1, hint:"" },
      { id:"geoproof_2", topic:"Triangle Proofs & Congruence", difficulty:"Easy", question:"Which proves congruence using all three pairs of sides?", choices:["AAS","SAS","ASA","SSS"], answer:3, hint:"" },
      { id:"geoproof_3", topic:"Triangle Proofs & Congruence", difficulty:"Easy", question:"Which uses two angles and the included side?", choices:["SAS","SSS","AAS","ASA"], answer:3, hint:"" },
      { id:"geoproof_4", topic:"Triangle Proofs & Congruence", difficulty:"Easy", question:"Which uses two angles and a non-included side?", choices:["SAS","SSA","ASA","AAS"], answer:3, hint:"" },
      { id:"geoproof_5", topic:"Triangle Proofs & Congruence", difficulty:"Easy", question:"Is AAA a valid congruence criterion for triangles?", choices:["Only for equilateral","No, it only shows similarity","Only for right triangles","Yes"], answer:1, hint:"" },
      { id:"geoproof_6", topic:"Triangle Proofs & Congruence", difficulty:"Easy", question:"Is SSA generally a valid congruence postulate?", choices:["Only with a right angle","Yes","No","Always"], answer:2, hint:"" },
      { id:"geoproof_7", topic:"Triangle Proofs & Congruence", difficulty:"Medium", question:"For right triangles, which special postulate uses the hypotenuse and a leg?", choices:["SSA","HL","LL only","AAA"], answer:1, hint:"" },
      { id:"geoproof_8", topic:"Triangle Proofs & Congruence", difficulty:"Medium", question:"Two triangles share a common side. This is often justified by the...", choices:["Substitution","Symmetric Property","Reflexive Property","Transitive Property"], answer:2, hint:"" },
      { id:"geoproof_9", topic:"Triangle Proofs & Congruence", difficulty:"Medium", question:"If ∠A ≅ ∠A, which property is used?", choices:["Transitive","Reflexive","Addition","Symmetric"], answer:1, hint:"" },
      { id:"geoproof_10", topic:"Triangle Proofs & Congruence", difficulty:"Medium", question:"Vertical angles are congruent. In a proof, this justifies a pair of congruent...", choices:["arcs","angles","sides","triangles"], answer:1, hint:"" },
      { id:"geoproof_11", topic:"Triangle Proofs & Congruence", difficulty:"Medium", question:"CPCTC stands for: Corresponding Parts of Congruent Triangles are...", choices:["Equal in area","Congruent","Similar","Complementary"], answer:1, hint:"" },
      { id:"geoproof_12", topic:"Triangle Proofs & Congruence", difficulty:"Medium", question:"You can only use CPCTC after you have shown...", choices:["the lines are parallel","the triangles are congruent","the figure is a triangle","two angles are equal"], answer:1, hint:"" },
      { id:"geoproof_13", topic:"Triangle Proofs & Congruence", difficulty:"Medium", question:"Given two triangles with SSS, what can you conclude about all corresponding angles?", choices:["Nothing","They are congruent (CPCTC)","They sum to 90°","They are supplementary"], answer:1, hint:"" },
      { id:"geoproof_14", topic:"Triangle Proofs & Congruence", difficulty:"Medium", question:"If two parallel lines are cut by a transversal, alternate interior angles are congruent. This often supplies the angle pair for which postulate?", choices:["SSS","ASA or AAS","HL","SSA"], answer:1, hint:"" },
      { id:"geoproof_15", topic:"Triangle Proofs & Congruence", difficulty:"Medium", question:"A midpoint divides a segment into two segments that are...", choices:["parallel","congruent","supplementary","perpendicular"], answer:1, hint:"" },
      { id:"geoproof_16", topic:"Triangle Proofs & Congruence", difficulty:"Medium", question:"An angle bisector creates two angles that are...", choices:["right","congruent","complementary","vertical"], answer:1, hint:"" },
      { id:"geoproof_17", topic:"Triangle Proofs & Congruence", difficulty:"Hard", question:"Given: AB ≅ DE, ∠B ≅ ∠E, BC ≅ EF. Which postulate proves △ABC ≅ △DEF?", choices:["AAS","SAS","ASA","SSS"], answer:1, hint:"" },
      { id:"geoproof_18", topic:"Triangle Proofs & Congruence", difficulty:"Hard", question:"Given: ∠A ≅ ∠D, ∠C ≅ ∠F, AC ≅ DF. Which postulate applies?", choices:["SAS","HL","SSS","ASA"], answer:3, hint:"" },
      { id:"geoproof_19", topic:"Triangle Proofs & Congruence", difficulty:"Hard", question:"Given: ∠A ≅ ∠D, ∠B ≅ ∠E, BC ≅ EF (BC not between the angles). Which applies?", choices:["SSS","ASA","AAS","SAS"], answer:2, hint:"" },
      { id:"geoproof_20", topic:"Triangle Proofs & Congruence", difficulty:"Hard", question:"Two right triangles have congruent hypotenuses and one pair of congruent legs. Which postulate?", choices:["AAA","SAS","HL","SSA"], answer:2, hint:"" },
      { id:"geoproof_21", topic:"Triangle Proofs & Congruence", difficulty:"Hard", question:"In a proof, 'Given' statements appear where?", choices:["They are never written","Only at the end","At the start, as the first reasons","As the conclusion"], answer:2, hint:"" },
      { id:"geoproof_22", topic:"Triangle Proofs & Congruence", difficulty:"Hard", question:"The final statement of a two-column proof is the...", choices:["given","postulate","definition","statement you were asked to prove"], answer:3, hint:"" },
      { id:"geoproof_23", topic:"Triangle Proofs & Congruence", difficulty:"Hard", question:"If △ABC ≅ △XYZ, then AB corresponds to which side?", choices:["ZX","XZ","YZ","XY"], answer:3, hint:"" },
      { id:"geoproof_24", topic:"Triangle Proofs & Congruence", difficulty:"Hard", question:"To prove two segments congruent using triangles, the usual last step is...", choices:["the reflexive property","substitution","CPCTC","SSS"], answer:2, hint:"" },
      { id:"geoproof_25", topic:"Triangle Proofs & Congruence", difficulty:"Hard", question:"Given an isosceles triangle, the base angles are congruent by the...", choices:["SSS Postulate","Pythagorean Theorem","Exterior Angle Theorem","Isosceles Triangle Theorem"], answer:3, hint:"" },
      { id:"geoproof_26", topic:"Triangle Proofs & Congruence", difficulty:"Hard", question:"Two triangles where ∠1 ≅ ∠2 (vertical angles), and the two sides forming them are congruent in pairs. Which postulate proves congruence?", choices:["AAS","SAS","SSS","ASA"], answer:1, hint:"" },
      { id:"geoproof_27", topic:"Triangle Proofs & Congruence", difficulty:"Hard", question:"Given: M is the midpoint of AB, and CM ⊥ AB. To prove △ACM ≅ △BCM, you'd use CM ≅ CM by the...", choices:["midpoint definition","CPCTC","Reflexive Property","vertical angles"], answer:2, hint:"" },
      { id:"geoproof_28", topic:"Triangle Proofs & Congruence", difficulty:"Hard", question:"If you know SSS for two triangles, do you need CPCTC to conclude they are congruent?", choices:["Only for right triangles","Yes, always","Only with a diagram","No — SSS already proves congruence"], answer:3, hint:"" },
      { id:"geoproof_29", topic:"Triangle Proofs & Congruence", difficulty:"Hard", question:"Which statement is sufficient to PROVE two triangles congruent on its own?", choices:["two angles only","SSA","AAA","ASA"], answer:3, hint:"" },
      { id:"geoproof_30", topic:"Triangle Proofs & Congruence", difficulty:"Hard", question:"In △PQR ≅ △STU, ∠Q corresponds to...", choices:["∠U","∠T","∠P","∠S"], answer:1, hint:"" },
      { id:"geopoly_1", topic:"Polygons", difficulty:"Easy", question:"How many sides does a pentagon have?", choices:["7","5","4","6"], answer:1, hint:"" },
      { id:"geopoly_2", topic:"Polygons", difficulty:"Easy", question:"How many sides does a hexagon have?", choices:["7","5","6","8"], answer:2, hint:"" },
      { id:"geopoly_3", topic:"Polygons", difficulty:"Easy", question:"How many sides does an octagon have?", choices:["10","6","7","8"], answer:3, hint:"" },
      { id:"geopoly_4", topic:"Polygons", difficulty:"Easy", question:"A polygon with all sides and angles equal is called:", choices:["irregular","regular","convex","concave"], answer:1, hint:"" },
      { id:"geopoly_5", topic:"Polygons", difficulty:"Easy", question:"How many sides does a heptagon have?", choices:["6","7","8","9"], answer:1, hint:"" },
      { id:"geopoly_6", topic:"Polygons", difficulty:"Easy", question:"A triangle is a polygon with how many sides?", choices:["2","4","5","3"], answer:3, hint:"" },
      { id:"geopoly_7", topic:"Polygons", difficulty:"Medium", question:"What is the sum of interior angles of a triangle?", choices:["90°","360°","270°","180°"], answer:3, hint:"" },
      { id:"geopoly_8", topic:"Polygons", difficulty:"Medium", question:"What is the sum of interior angles of a quadrilateral?", choices:["540°","720°","180°","360°"], answer:3, hint:"" },
      { id:"geopoly_9", topic:"Polygons", difficulty:"Medium", question:"The sum of interior angles of a pentagon is:", choices:["720°","540°","360°","450°"], answer:1, hint:"" },
      { id:"geopoly_10", topic:"Polygons", difficulty:"Medium", question:"The sum of interior angles of a hexagon is:", choices:["540°","640°","900°","720°"], answer:3, hint:"" },
      { id:"geopoly_11", topic:"Polygons", difficulty:"Medium", question:"Formula for the sum of interior angles of an n-sided polygon:", choices:["n·180°","(n − 1)·180°","(n − 2)·180°","360°/n"], answer:2, hint:"" },
      { id:"geopoly_12", topic:"Polygons", difficulty:"Medium", question:"Each interior angle of a regular pentagon measures:", choices:["120°","90°","108°","72°"], answer:2, hint:"" },
      { id:"geopoly_13", topic:"Polygons", difficulty:"Medium", question:"Each interior angle of a regular hexagon measures:", choices:["90°","108°","135°","120°"], answer:3, hint:"" },
      { id:"geopoly_14", topic:"Polygons", difficulty:"Medium", question:"The sum of exterior angles of any convex polygon is:", choices:["720°","360°","180°","depends on sides"], answer:1, hint:"" },
      { id:"geopoly_15", topic:"Polygons", difficulty:"Medium", question:"Each exterior angle of a regular hexagon is:", choices:["45°","120°","72°","60°"], answer:3, hint:"" },
      { id:"geopoly_16", topic:"Polygons", difficulty:"Medium", question:"Each exterior angle of a regular octagon is:", choices:["135°","60°","40°","45°"], answer:3, hint:"" },
      { id:"geopoly_17", topic:"Polygons", difficulty:"Medium", question:"A regular polygon has each exterior angle 72°. How many sides?", choices:["6","8","5","4"], answer:2, hint:"" },
      { id:"geopoly_18", topic:"Polygons", difficulty:"Medium", question:"How many diagonals does a pentagon have?", choices:["4","10","5","6"], answer:2, hint:"" },
      { id:"geopoly_19", topic:"Polygons", difficulty:"Hard", question:"How many diagonals does a hexagon have?", choices:["15","6","12","9"], answer:3, hint:"" },
      { id:"geopoly_20", topic:"Polygons", difficulty:"Hard", question:"The formula for number of diagonals of an n-gon is:", choices:["(n − 2)·180","n − 3","n(n − 1)/2","n(n − 3)/2"], answer:3, hint:"" },
      { id:"geopoly_21", topic:"Polygons", difficulty:"Hard", question:"Each interior angle of a regular octagon measures:", choices:["120°","150°","135°","144°"], answer:2, hint:"" },
      { id:"geopoly_22", topic:"Polygons", difficulty:"Hard", question:"A regular polygon has interior angles of 140°. How many sides?", choices:["8","7","10","9"], answer:3, hint:"" },
      { id:"geopoly_23", topic:"Polygons", difficulty:"Hard", question:"The sum of interior angles of a polygon is 900°. How many sides?", choices:["9","8","6","7"], answer:3, hint:"" },
      { id:"geopoly_24", topic:"Polygons", difficulty:"Hard", question:"A regular polygon has each interior angle 150°. Number of sides?", choices:["15","10","9","12"], answer:3, hint:"" },
      { id:"geopoly_25", topic:"Polygons", difficulty:"Hard", question:"If each exterior angle is 30°, the polygon has how many sides?", choices:["6","10","12","8"], answer:2, hint:"" },
      { id:"geopoly_26", topic:"Polygons", difficulty:"Medium", question:"A polygon where all diagonals lie inside is called:", choices:["irregular","regular","convex","concave"], answer:2, hint:"" },
      { id:"geopoly_27", topic:"Polygons", difficulty:"Medium", question:"A concave polygon has at least one interior angle that is:", choices:["less than 45°","greater than 180°","exactly 180°","equal to 90°"], answer:1, hint:"" },
      { id:"geopoly_28", topic:"Polygons", difficulty:"Hard", question:"The measure of each interior angle of a regular n-gon is:", choices:["(n − 2)·180°","(n − 2)·180°/n","180° − n","360°/n"], answer:1, hint:"" },
      { id:"geopoly_29", topic:"Polygons", difficulty:"Hard", question:"A decagon (10 sides) has interior angle sum of:", choices:["1800°","1260°","1440°","1620°"], answer:2, hint:"" },
      { id:"geopoly_30", topic:"Polygons", difficulty:"Medium", question:"A nonagon has how many sides?", choices:["8","7","9","10"], answer:2, hint:"" },
      { id:"geoquad_1", topic:"Quadrilaterals", difficulty:"Easy", question:"A quadrilateral with 4 equal sides and 4 right angles is a:", choices:["rectangle","square","rhombus","trapezoid"], answer:1, hint:"" },
      { id:"geoquad_2", topic:"Quadrilaterals", difficulty:"Easy", question:"A quadrilateral with opposite sides parallel is a:", choices:["triangle","trapezoid","parallelogram","kite"], answer:2, hint:"" },
      { id:"geoquad_3", topic:"Quadrilaterals", difficulty:"Easy", question:"A rectangle has how many right angles?", choices:["2","0","1","4"], answer:3, hint:"" },
      { id:"geoquad_4", topic:"Quadrilaterals", difficulty:"Easy", question:"How many sides does every quadrilateral have?", choices:["6","4","5","3"], answer:1, hint:"" },
      { id:"geoquad_5", topic:"Quadrilaterals", difficulty:"Easy", question:"A quadrilateral with exactly one pair of parallel sides is a:", choices:["rhombus","trapezoid","square","parallelogram"], answer:1, hint:"" },
      { id:"geoquad_6", topic:"Quadrilaterals", difficulty:"Easy", question:"A parallelogram with 4 equal sides (but not necessarily right angles) is a:", choices:["square","trapezoid","rectangle","rhombus"], answer:3, hint:"" },
      { id:"geoquad_7", topic:"Quadrilaterals", difficulty:"Medium", question:"The sum of the interior angles of any quadrilateral is:", choices:["180°","540°","360°","720°"], answer:2, hint:"" },
      { id:"geoquad_8", topic:"Quadrilaterals", difficulty:"Medium", question:"In a parallelogram, opposite angles are:", choices:["complementary","supplementary","right","equal"], answer:3, hint:"" },
      { id:"geoquad_9", topic:"Quadrilaterals", difficulty:"Medium", question:"In a parallelogram, consecutive angles are:", choices:["complementary","supplementary","equal","right"], answer:1, hint:"" },
      { id:"geoquad_10", topic:"Quadrilaterals", difficulty:"Medium", question:"The diagonals of a rectangle are:", choices:["parallel","perpendicular","unequal","equal in length"], answer:3, hint:"" },
      { id:"geoquad_11", topic:"Quadrilaterals", difficulty:"Medium", question:"The diagonals of a rhombus are:", choices:["never bisected","perpendicular","parallel","equal"], answer:1, hint:"" },
      { id:"geoquad_12", topic:"Quadrilaterals", difficulty:"Medium", question:"In a parallelogram, the diagonals:", choices:["are equal","bisect each other","don't intersect","are perpendicular"], answer:1, hint:"" },
      { id:"geoquad_13", topic:"Quadrilaterals", difficulty:"Medium", question:"A square is always a:", choices:["kite only","rhombus and rectangle","trapezoid","triangle"], answer:1, hint:"" },
      { id:"geoquad_14", topic:"Quadrilaterals", difficulty:"Medium", question:"Opposite sides of a parallelogram are:", choices:["equal only","unequal","perpendicular","equal and parallel"], answer:3, hint:"" },
      { id:"geoquad_15", topic:"Quadrilaterals", difficulty:"Medium", question:"A quadrilateral with two pairs of adjacent equal sides is a:", choices:["rhombus","rectangle","trapezoid","kite"], answer:3, hint:"" },
      { id:"geoquad_16", topic:"Quadrilaterals", difficulty:"Medium", question:"The area of a rectangle with length 8 and width 5 is:", choices:["13","20","26","40"], answer:3, hint:"" },
      { id:"geoquad_17", topic:"Quadrilaterals", difficulty:"Medium", question:"The area of a square with side 6 is:", choices:["12","36","24","18"], answer:1, hint:"" },
      { id:"geoquad_18", topic:"Quadrilaterals", difficulty:"Medium", question:"The perimeter of a rectangle with length 7 and width 3 is:", choices:["14","21","20","10"], answer:2, hint:"" },
      { id:"geoquad_19", topic:"Quadrilaterals", difficulty:"Medium", question:"The area of a parallelogram with base 10 and height 4 is:", choices:["28","20","14","40"], answer:3, hint:"" },
      { id:"geoquad_20", topic:"Quadrilaterals", difficulty:"Hard", question:"The area of a trapezoid with bases 6 and 10 and height 4 is:", choices:["16","64","40","32"], answer:3, hint:"" },
      { id:"geoquad_21", topic:"Quadrilaterals", difficulty:"Hard", question:"The area of a rhombus with diagonals 6 and 8 is:", choices:["48","14","24","28"], answer:2, hint:"" },
      { id:"geoquad_22", topic:"Quadrilaterals", difficulty:"Hard", question:"In a parallelogram, one angle is 70°. The consecutive angle is:", choices:["90°","20°","70°","110°"], answer:3, hint:"" },
      { id:"geoquad_23", topic:"Quadrilaterals", difficulty:"Hard", question:"A rectangle has length 12 and diagonal 13. Its width is:", choices:["1","7","6","5"], answer:3, hint:"" },
      { id:"geoquad_24", topic:"Quadrilaterals", difficulty:"Hard", question:"If a parallelogram has area 48 and base 8, its height is:", choices:["40","5","6","8"], answer:2, hint:"" },
      { id:"geoquad_25", topic:"Quadrilaterals", difficulty:"Hard", question:"A square has diagonal 10√2. Its side length is:", choices:["20","10","5","10√2"], answer:1, hint:"" },
      { id:"geoquad_26", topic:"Quadrilaterals", difficulty:"Hard", question:"A trapezoid has area 45, height 5, and one base 8. The other base is:", choices:["12","10","6","9"], answer:1, hint:"" },
      { id:"geoquad_27", topic:"Quadrilaterals", difficulty:"Hard", question:"The diagonals of a square are equal AND:", choices:["parallel","non-bisecting","perpendicular","unequal"], answer:2, hint:"" },
      { id:"geoquad_28", topic:"Quadrilaterals", difficulty:"Medium", question:"Which is NOT always true of a rhombus?", choices:["Diagonals perpendicular","All sides equal","All angles are 90°","Opposite sides parallel"], answer:2, hint:"" },
      { id:"geoquad_29", topic:"Quadrilaterals", difficulty:"Hard", question:"A parallelogram with perpendicular, equal diagonals is a:", choices:["kite","rhombus","square","rectangle"], answer:2, hint:"" },
      { id:"geoquad_30", topic:"Quadrilaterals", difficulty:"Medium", question:"A rectangle is a parallelogram with:", choices:["four equal sides","four right angles","perpendicular diagonals","one pair parallel"], answer:1, hint:"" },
    ],
  },

  algebra2: {
    id: "algebra2", label: "Algebra 2", emoji: "ƒ",
    color: C.violet, bg: C.lavender, dark: C.violetDark,
    tagline: "Practice · Ask for help · Level up",
    topics: [
      { name: "Quadratics", icon: "", color: C.coral, bg: C.blush },
      { name: "Polynomials", icon: "", color: C.violet, bg: C.lavender },
      { name: "Logarithms", icon: "", color: C.teal, bg: C.mint },
      { name: "Rational Expressions", icon: "", color: "#E8960C", bg: C.cream },
      { name: "Parent Functions & Transformations", icon: "", color: C.pinkDark, bg: C.pink },
      { name: "Radicals & Radical Equations", icon: "√", color: "#22A347", bg: "#E6F9EE" },
      { name: "Exponential Functions", icon: "", color: C.sky, bg: "#E5F2FF" },
      { name: "Sequences & Series", icon: "", color: "#8B5CF6", bg: "#EDE9FE" },
      { name: "Complex Numbers", icon: "", color: "#C44DF6", bg: "#F7E9FF" },
      { name: "Function Features", icon: "", color: "#0EA5A0", bg: "#DFF7F3" },
      { name: "Parent Functions Library", icon: "", color: "#D97706", bg: "#FEF3C7" },
    ],
    seeds: [
      { id:"p1", topic:"Quadratics", difficulty:"Easy", question:"Solve for x: x² − 5x + 6 = 0", choices:["x = 1 or x = 6","x = −1 or x = −6","x = 2 or x = 3","x = −2 or x = −3"], answer:2, hint:"Find two numbers that multiply to 6 and add to −5." },
      { id:"p2", topic:"Quadratics", difficulty:"Medium", question:"What is the vertex of y = 2(x − 3)² + 4 ?", choices:["(3, −4)","(−3, 4)","(3, 4)","(2, 3)"], answer:2, hint:"Vertex form y = a(x − h)² + k has vertex (h, k)." },
      { id:"p9", topic:"Quadratics", difficulty:"Hard", question:"For what values of k does x² + kx + 9 = 0 have exactly one real solution?", choices:["k = 9 only","k = 6 or k = −6","k = 3 or k = −3","k = 0 only"], answer:1, hint:"Exactly one real solution ⟹ discriminant b² − 4ac = 0." },
      { id:"a2quad_1", topic:"Quadratics", difficulty:"Easy", question:"Solve: x² − 16 = 0", choices:["x = -8","x = 16","x = 4 or x = -4","x = 4"], answer:2, hint:"" },
      { id:"a2quad_2", topic:"Quadratics", difficulty:"Easy", question:"Solve: x² − 2x − 8 = 0", choices:["x = -4 or x = 2","x = 2 or x = 4","x = 4 or x = -2","x = 8"], answer:2, hint:"" },
      { id:"a2quad_3", topic:"Quadratics", difficulty:"Easy", question:"What is the vertex of y = (x + 1)² − 6?", choices:["(1, -6)","(-1, 6)","(6, -1)","(-1, -6)"], answer:3, hint:"" },
      { id:"a2quad_4", topic:"Quadratics", difficulty:"Easy", question:"Factor: x² + 8x + 16", choices:["(x + 8)²","(x + 4)²","(x + 4)(x − 4)","(x + 2)(x + 8)"], answer:1, hint:"" },
      { id:"a2quad_5", topic:"Quadratics", difficulty:"Medium", question:"Solve by quadratic formula: x² − 3x − 10 = 0", choices:["x = 3 or x = 10","x = 5 or x = -2","x = 5","x = -5 or x = 2"], answer:1, hint:"" },
      { id:"a2quad_6", topic:"Quadratics", difficulty:"Medium", question:"Complete the square: x² + 6x = 7. The solutions are:", choices:["x = 3","x = -1 or x = 7","x = 7 or x = -6","x = 1 or x = -7"], answer:3, hint:"" },
      { id:"a2quad_7", topic:"Quadratics", difficulty:"Medium", question:"The discriminant of 2x² − 4x + 1 is:", choices:["-8","0","8","16"], answer:2, hint:"" },
      { id:"a2quad_8", topic:"Quadratics", difficulty:"Medium", question:"Convert y = x² − 4x + 1 to vertex form.", choices:["y = (x + 2)² − 3","y = (x − 2)² + 1","y = (x − 2)² − 3","y = (x − 4)² + 1"], answer:2, hint:"" },
      { id:"a2quad_9", topic:"Quadratics", difficulty:"Medium", question:"What are the roots of y = x² − x − 6?", choices:["x = 1","x = -3 or x = 2","x = 6 or x = -1","x = 3 or x = -2"], answer:3, hint:"" },
      { id:"a2quad_10", topic:"Quadratics", difficulty:"Medium", question:"The axis of symmetry of y = 2x² + 8x − 1 is:", choices:["x = 4","x = -2","x = -4","x = 2"], answer:1, hint:"" },
      { id:"a2quad_11", topic:"Quadratics", difficulty:"Medium", question:"A parabola opens upward and has vertex (3, -4). Its minimum value is:", choices:["3","-4","-3","4"], answer:1, hint:"" },
      { id:"a2quad_12", topic:"Quadratics", difficulty:"Medium", question:"Solve: 3x² = 27", choices:["x = 3","x = 3 or x = -3","x = -9","x = 9"], answer:1, hint:"" },
      { id:"a2quad_13", topic:"Quadratics", difficulty:"Hard", question:"Solve: x² + 4x + 1 = 0", choices:["x = -4 ± √3","x = 2 ± √3","x = -2 ± √5","x = -2 ± √3"], answer:3, hint:"" },
      { id:"a2quad_14", topic:"Quadratics", difficulty:"Hard", question:"For what k does x² + kx + 16 = 0 have a double root (k > 0)?", choices:["4","16","8","2"], answer:2, hint:"" },
      { id:"a2quad_15", topic:"Quadratics", difficulty:"Hard", question:"The sum of the roots of 2x² − 6x + 1 = 0 is:", choices:["6","3","-3","1/2"], answer:1, hint:"" },
      { id:"a2quad_16", topic:"Quadratics", difficulty:"Hard", question:"The product of the roots of x² − 5x + 6 = 0 is:", choices:["5","-6","1","6"], answer:3, hint:"" },
      { id:"a2quad_17", topic:"Quadratics", difficulty:"Hard", question:"If a quadratic has roots 2 and -3, which equation could it be?", choices:["x² − 6 = 0","x² − x − 6 = 0","x² + 5x + 6 = 0","x² + x − 6 = 0"], answer:3, hint:"" },
      { id:"a2quad_18", topic:"Quadratics", difficulty:"Hard", question:"Solve: x² − 10x + 25 = 0", choices:["x = 5 or x = -5","x = 10","x = 25","x = 5 (double root)"], answer:3, hint:"" },
      { id:"a2quad_19", topic:"Quadratics", difficulty:"Hard", question:"The graph of y = x² + bx + c passes through (0, 5). What is c?", choices:["b","5","0","-5"], answer:1, hint:"" },
      { id:"a2quad_20", topic:"Quadratics", difficulty:"Hard", question:"How many real roots does 3x² + 2x + 5 = 0 have?", choices:["3","1","2","0"], answer:3, hint:"" },
      { id:"a2quad_21", topic:"Quadratics", difficulty:"Hard", question:"A projectile follows h = -5t² + 20t. Its maximum height is:", choices:["25","40","15","20"], answer:3, hint:"" },
      { id:"a2quad_22", topic:"Quadratics", difficulty:"Hard", question:"If x² + bx + 12 = 0 has roots that differ by 1 (3 and 4), what is b?", choices:["-12","-7","12","7"], answer:1, hint:"" },
      { id:"a2quad_23", topic:"Quadratics", difficulty:"Medium", question:"Solve: (x − 4)² = 9", choices:["x = 13 or x = -5","x = 7","x = 3","x = 7 or x = 1"], answer:3, hint:"" },
      { id:"a2quad_24", topic:"Quadratics", difficulty:"Hard", question:"The function f(x) = x² − 6x + 5 has zeros at:", choices:["x = 2 and x = 3","x = 6 and x = 5","x = 1 and x = 5","x = -1 and x = -5"], answer:2, hint:"" },
      { id:"a2quad_25", topic:"Quadratics", difficulty:"Medium", question:"Factor completely: 2x² − 18", choices:["2(x² − 9)","(x − 3)(x + 6)","2(x − 3)(x + 3)","(2x − 6)(x + 3)"], answer:2, hint:"" },
      { id:"p3", topic:"Polynomials", difficulty:"Medium", question:"What is the remainder when x³ − 4x + 6 is divided by (x − 2) ?", choices:["2","6","0","10"], answer:1, hint:"Use the Remainder Theorem: plug in x = 2." },
      { id:"p10", topic:"Polynomials", difficulty:"Hard", question:"Given (x + 1) is a factor of x³ + 2x² − 5x − 6, what are all the roots?", choices:["x = −1 only","x = −1, 2, −3","x = 1, −2, 3","x = −1, −2, 3"], answer:1, hint:"Divide by (x + 1), then factor the resulting quadratic." },
      { id:"p16", topic:"Polynomials", difficulty:"Easy", question:"What is the degree of 4x⁵ − 3x² + 7x − 1 ?", choices:["3","4","5","2"], answer:2, hint:"The degree is the highest exponent on x." },
      { id:"p4", topic:"Logarithms", difficulty:"Easy", question:"Evaluate: log₂(32)", choices:["6","5","4","16"], answer:1, hint:"2 raised to what power gives 32?" },
      { id:"p5", topic:"Logarithms", difficulty:"Medium", question:"Solve for x: log(x) + log(x − 3) = 1", choices:["x = −2","x = 5","x = 10","x = 2"], answer:1, hint:"Combine the logs, then rewrite as a power of 10." },
      { id:"p11", topic:"Logarithms", difficulty:"Hard", question:"Solve for x: log₃(x) + log₃(x + 6) = 3", choices:["x = 9","x = 3 or x = −9","x = −9","x = 3"], answer:3, hint:"Combine into log₃(x(x + 6)) = 3, then check for extraneous solutions." },
      { id:"p6", topic:"Rational Expressions", difficulty:"Medium", question:"Simplify: (x² − 9) / (x² + 5x + 6)", choices:["(x − 9)/(x + 6)","(x + 3)/(x + 2)","(x − 3)/(x − 2)","(x − 3)/(x + 2)"], answer:3, hint:"Factor the top and bottom, then cancel." },
      { id:"p12", topic:"Rational Expressions", difficulty:"Hard", question:"Solve for x: 2/(x − 1) + 3/(x + 1) = 4/(x² − 1)", choices:["x = −1","x = 3/5","x = 5/3","x = 1"], answer:1, hint:"x² − 1 = (x − 1)(x + 1). Multiply everything by that LCD." },
      { id:"p17", topic:"Parent Functions & Transformations", difficulty:"Easy", question:"What is the parent function of g(x) = (x − 2)² + 5 ?", choices:["y = √x","y = |x|","y = x","y = x²"], answer:3, hint:"Strip away the shifts — what basic shape is left?" },
      { id:"p18", topic:"Parent Functions & Transformations", difficulty:"Easy", question:"The graph of y = |x| is shifted 3 units RIGHT. What is the new equation?", choices:["y = |x| + 3","y = |x + 3|","y = |x − 3|","y = |x| − 3"], answer:2, hint:"Horizontal shifts go inside — sign is opposite of what you'd expect." },
      { id:"p19", topic:"Parent Functions & Transformations", difficulty:"Medium", question:"How is g(x) = −√x + 4 transformed from y = √x ?", choices:["Shifted down 4 only","Reflected over y-axis, shifted up 4","Reflected over x-axis, shifted right 4","Reflected over x-axis, shifted up 4"], answer:3, hint:"The negative sign is OUTSIDE the radical, and so is the +4." },
      { id:"p20", topic:"Parent Functions & Transformations", difficulty:"Medium", question:"Describe all transformations of g(x) = 2|x + 1| − 3 from y = |x|.", choices:["Vert. shrink ×½, left 1, down 3","Vert. stretch ×2, left 1, up 3","Vert. stretch ×2, right 1, down 3","Vert. stretch ×2, left 1, down 3"], answer:3, hint:"2 stretches, +1 inside moves left, −3 outside moves down." },
      { id:"p21", topic:"Parent Functions & Transformations", difficulty:"Hard", question:"Reflect y = x³ over the x-axis, shift 2 right, then 5 up. What's the equation?", choices:["y = (−x − 2)³ + 5","y = −(x − 2)³ − 5","y = −(x + 2)³ + 5","y = −(x − 2)³ + 5"], answer:3, hint:"Reflection: − out front. Right 2: (x − 2). Up 5: +5 at end." },
      { id:"p22", topic:"Parent Functions & Transformations", difficulty:"Hard", question:"(4, −2) is on y = f(x). What point MUST be on y = f(x − 3) + 6 ?", choices:["(1, 4)","(7, −8)","(1, −8)","(7, 4)"], answer:3, hint:"x − 3 shifts right 3 (x: 4→7) and +6 shifts up 6 (y: −2→4)." },
      { id:"a2trans_1", topic:"Parent Functions & Transformations", difficulty:"Hard", question:"The graph of f(x) is shifted right 3, up 2, and reflected over the x-axis. Which represents the new function?", choices:["f(x − 3) + 2","-f(x + 3) + 2","-f(x − 3) + 2","-f(x − 3) − 2"], answer:2, hint:"" },
      { id:"a2trans_2", topic:"Parent Functions & Transformations", difficulty:"Hard", question:"If g(x) = -2f(x − 1) + 5, describe the transformation of f.", choices:["Compress by 2, right 1, down 5","Reflect over x-axis, right 1, down 5","Reflect over x-axis, stretch by 2, right 1, up 5","Reflect over y-axis, stretch by 2, left 1, up 5"], answer:2, hint:"" },
      { id:"a2trans_3", topic:"Parent Functions & Transformations", difficulty:"Hard", question:"The point (2, 3) is on f(x). Where is it on y = f(x + 4) − 1?", choices:["(2, 2)","(-2, 2)","(6, 2)","(-2, 4)"], answer:1, hint:"" },
      { id:"a2trans_4", topic:"Parent Functions & Transformations", difficulty:"Hard", question:"The point (4, -2) is on f(x). Where is it on y = -f(x) + 3?", choices:["(-4, 5)","(4, 5)","(4, -5)","(4, 1)"], answer:1, hint:"" },
      { id:"a2trans_5", topic:"Parent Functions & Transformations", difficulty:"Hard", question:"y = f(2x) transforms f(x) how?", choices:["Shift right 2","Horizontal compression by factor 1/2","Vertical stretch by 2","Horizontal stretch by 2"], answer:1, hint:"" },
      { id:"a2trans_6", topic:"Parent Functions & Transformations", difficulty:"Hard", question:"y = f(x/3) transforms f(x) how?", choices:["Horizontal compression by 1/3","Shift left 3","Horizontal stretch by factor 3","Vertical compression by 3"], answer:2, hint:"" },
      { id:"a2trans_7", topic:"Parent Functions & Transformations", difficulty:"Hard", question:"If f(x) = x², write the function shifted left 5, reflected over x-axis, and down 2.", choices:["-(x + 5)² + 2","(x + 5)² + 2","-(x + 5)² − 2","-(x − 5)² − 2"], answer:2, hint:"" },
      { id:"a2trans_8", topic:"Parent Functions & Transformations", difficulty:"Hard", question:"The graph y = 3f(x − 2) + 1 takes point (2, 4) of f to:", choices:["(4, 12)","(4, 5)","(0, 13)","(4, 13)"], answer:3, hint:"" },
      { id:"a2trans_9", topic:"Parent Functions & Transformations", difficulty:"Hard", question:"A function is reflected over the y-axis. Which describes it?", choices:["y = -f(x)","y = -f(-x)","y = f(-x)","y = f(x) + c"], answer:2, hint:"" },
      { id:"a2trans_10", topic:"Parent Functions & Transformations", difficulty:"Hard", question:"If h(x) = f(-x) + 4 and (3, 1) is on f, what point is on h?", choices:["(-3, 1)","(3, -3)","(3, 5)","(-3, 5)"], answer:3, hint:"" },
      { id:"a2trans_11", topic:"Parent Functions & Transformations", difficulty:"Hard", question:"The transformation y = (1/2)f(x) − 3 does what to f?", choices:["Horizontal stretch, down 3","Reflect, down 3","Vertical stretch by 2, down 3","Vertical compression by 1/2, down 3"], answer:3, hint:"" },
      { id:"a2trans_12", topic:"Parent Functions & Transformations", difficulty:"Hard", question:"Given f(x) = √x, write the transformation: right 4, vertical stretch by 3, down 1.", choices:["√(3x − 4) − 1","3√(x − 4) + 1","3√(x + 4) − 1","3√(x − 4) − 1"], answer:3, hint:"" },
      { id:"a2trans_13", topic:"Parent Functions & Transformations", difficulty:"Hard", question:"y = -f(x − 1) − 2 reflects over the x-axis and shifts how?", choices:["Right 2, down 1","Right 1, down 2","Right 1, up 2","Left 1, down 2"], answer:1, hint:"" },
      { id:"a2trans_14", topic:"Parent Functions & Transformations", difficulty:"Hard", question:"If the vertex of f(x) = x² is (0,0), the vertex of y = -2(x − 3)² + 7 is:", choices:["(-3, 7)","(3, 7)","(3, -7)","(7, 3)"], answer:1, hint:"" },
      { id:"a2trans_15", topic:"Parent Functions & Transformations", difficulty:"Hard", question:"The point (-2, 5) is on y = f(x). After y = f(2x) − 3, which point is on the new graph?", choices:["(-1, 8)","(-2, 2)","(-4, 2)","(-1, 2)"], answer:3, hint:"" },
      { id:"a2trans_16", topic:"Parent Functions & Transformations", difficulty:"Hard", question:"Which sequence transforms y = |x| into y = -3|x + 2| + 1?", choices:["Left 2, compress 3, down 1","Right 2, stretch 3, up 1","Left 2, stretch 3, reflect over x-axis, up 1","Right 2, reflect, down 1"], answer:2, hint:"" },
      { id:"r1", topic:"Radicals & Radical Equations", difficulty:"Easy", question:"Simplify: √72", choices:["8√2","36√2","3√8","6√2"], answer:3, hint:"72 = 36 × 2. Pull out the perfect square." },
      { id:"r2", topic:"Radicals & Radical Equations", difficulty:"Medium", question:"Solve: √(2x + 1) = 5", choices:["x = 2","x = 13","x = 12","x = 24"], answer:2, hint:"Square both sides: 2x + 1 = 25." },
      { id:"r3", topic:"Radicals & Radical Equations", difficulty:"Hard", question:"Solve: √(x + 3) = x − 3", choices:["x = 1 or x = 6","No solution","x = 1","x = 6"], answer:3, hint:"Square both sides, then check for extraneous solutions." },
      { id:"e1", topic:"Exponential Functions", difficulty:"Easy", question:"Which function represents exponential DECAY?", choices:["y = 0.5(3)ˣ","y = 3ˣ","y = 3(0.5)ˣ","y = 3x²"], answer:2, hint:"Decay means the base b satisfies 0 < b < 1." },
      { id:"e2", topic:"Exponential Functions", difficulty:"Medium", question:"A population of 500 doubles every 4 years. What is it after 12 years?", choices:["2000","4000","8000","6000"], answer:1, hint:"Doubles 3 times: 500 × 2³." },
      { id:"e3", topic:"Exponential Functions", difficulty:"Hard", question:"Solve for x: 4ˣ = 8", choices:["x = 2/3","x = 4/8","x = 2","x = 3/2"], answer:3, hint:"Write both as powers of 2: (2²)ˣ = 2³, so 2x = 3." },
      { id:"p7", topic:"Sequences & Series", difficulty:"Easy", question:"What is the 10th term of 4, 7, 10, … ?", choices:["34","31","28","30"], answer:1, hint:"aₙ = a₁ + (n − 1)d, with d = 3." },
      { id:"p15", topic:"Sequences & Series", difficulty:"Medium", question:"What is the sum of the first 20 terms of 2 + 5 + 8 + … ?", choices:["590","580","620","610"], answer:3, hint:"Sₙ = n/2 · (2a₁ + (n − 1)d)." },
      { id:"p13", topic:"Sequences & Series", difficulty:"Hard", question:"Sum of infinite geometric series: 18 − 6 + 2 − 2/3 + … ?", choices:["36","12","24","27/2"], answer:3, hint:"S = a₁/(1 − r). Here r = −1/3." },
      { id:"p8", topic:"Complex Numbers", difficulty:"Medium", question:"Multiply: (3 + 2i)(1 − 4i)", choices:["3 − 8i","−5 − 10i","11 + 10i","11 − 10i"], answer:3, hint:"FOIL it out and remember i² = −1." },
      { id:"p14", topic:"Complex Numbers", difficulty:"Hard", question:"Simplify: (2 + i) / (3 − i)", choices:["(7 + i)/10","(5 + 5i)/8","(1 + i)/2","(1 − i)/2"], answer:2, hint:"Multiply top and bottom by the conjugate (3 + i)." },
      { id:"a2_ff_1", topic:"Function Features", difficulty:"Easy", question:"As x → +∞, what happens to f(x) = x² ?", choices:["f(x) → 1","f(x) → 0","f(x) → −∞","f(x) → +∞"], answer:3, hint:"Even-degree, positive leading coefficient rises on both ends." },
      { id:"a2_ff_2", topic:"Function Features", difficulty:"Easy", question:"As x → −∞, what happens to f(x) = x³ ?", choices:["stays constant","f(x) → 0","f(x) → +∞","f(x) → −∞"], answer:3, hint:"Odd-degree, positive lead: falls left, rises right." },
      { id:"a2_ff_3", topic:"Function Features", difficulty:"Medium", question:"Describe the end behavior of f(x) = −2x⁴ + 3.", choices:["Up on both ends","Down on both ends","Up left, down right","Down left, up right"], answer:1, hint:"Even degree with negative leading coefficient falls both ways." },
      { id:"a2_ff_4", topic:"Function Features", difficulty:"Medium", question:"Describe the end behavior of f(x) = 5x³ − x.", choices:["Up both ends","Up left, down right","Down left, up right","Down both ends"], answer:2, hint:"Odd degree, positive lead: left → −∞, right → +∞." },
      { id:"a2_ff_5", topic:"Function Features", difficulty:"Medium", question:"Which leading term gives 'up on the left, down on the right'?", choices:["−x⁴","−x³","x⁴","x³"], answer:1, hint:"Odd degree + negative coefficient flips to up-left, down-right." },
      { id:"a2_ff_6", topic:"Function Features", difficulty:"Hard", question:"f(x) = −3x⁵ + 2x² − 7. As x → +∞, f(x) → ?", choices:["−7","0","+∞","−∞"], answer:3, hint:"Odd degree, negative lead: rises left, falls right." },
      { id:"a2_ff_7", topic:"Function Features", difficulty:"Hard", question:"A polynomial falls on the left and rises on the right. Which could it be?", choices:["−x⁴","x² + 1","x⁵ − x","−x³"], answer:2, hint:"Odd degree, positive leading coefficient." },
      { id:"a2_ff_8", topic:"Function Features", difficulty:"Medium", question:"The end behavior of f(x) = x² and g(x) = x⁴ is...", choices:["Down both ends","Opposite","The same (up both ends)","Up then down"], answer:2, hint:"Both even degree, positive lead → both rise on each end." },
      { id:"a2_ff_9", topic:"Function Features", difficulty:"Easy", question:"Where is f(x) = x² negative?", choices:["x < 0","all x","x > 0","Nowhere"], answer:3, hint:"x² is always ≥ 0, never negative." },
      { id:"a2_ff_10", topic:"Function Features", difficulty:"Medium", question:"For f(x) = x² − 4, on what interval is f(x) negative?", choices:["x > 2","x < −2","all x","−2 < x < 2"], answer:3, hint:"Roots at ±2; the parabola dips below zero between them." },
      { id:"a2_ff_11", topic:"Function Features", difficulty:"Medium", question:"For f(x) = (x − 1)(x + 3), where is f(x) positive?", choices:["−3 < x < 1","x < −3 or x > 1","x > 1 only","x < −3 only"], answer:1, hint:"Positive outside the roots for an upward parabola." },
      { id:"a2_ff_12", topic:"Function Features", difficulty:"Medium", question:"A function is positive when its graph is...", choices:["Below the x-axis","Left of the y-axis","Above the x-axis","On the x-axis"], answer:2, hint:"Positive output means y > 0, above the x-axis." },
      { id:"a2_ff_13", topic:"Function Features", difficulty:"Hard", question:"For f(x) = x(x − 2)(x + 2), where is f(x) negative?", choices:["−2 < x < 2","−2 < x < 0 or x > 2","x < −2 or 0 < x < 2","x > 2 only"], answer:2, hint:"Sign chart with roots −2, 0, 2 on an odd-degree positive-lead cubic." },
      { id:"a2_ff_14", topic:"Function Features", difficulty:"Hard", question:"For f(x) = −(x − 1)², where is f(x) positive?", choices:["x > 1","x < 1","Nowhere","all x except 1"], answer:2, hint:"−(square) is ≤ 0 everywhere, never positive." },
      { id:"a2_ff_15", topic:"Function Features", difficulty:"Easy", question:"Is f(x) = x² even, odd, or neither?", choices:["Odd","Both","Even","Neither"], answer:2, hint:"f(−x) = x² = f(x), so it's even (symmetric about y-axis)." },
      { id:"a2_ff_16", topic:"Function Features", difficulty:"Easy", question:"Is f(x) = x³ even, odd, or neither?", choices:["Neither","Both","Odd","Even"], answer:2, hint:"f(−x) = −x³ = −f(x), so it's odd (symmetric about origin)." },
      { id:"a2_ff_17", topic:"Function Features", difficulty:"Medium", question:"Which function is EVEN?", choices:["f(x) = 2x","f(x) = x³","f(x) = x³ + x","f(x) = x⁴ − 2x²"], answer:3, hint:"Only even powers (and constants) → even function." },
      { id:"a2_ff_18", topic:"Function Features", difficulty:"Medium", question:"Which function is ODD?", choices:["f(x) = x² ","f(x) = x³ − x","f(x) = x⁴","f(x) = x² + 1"], answer:1, hint:"Only odd powers → odd function; f(−x) = −f(x)." },
      { id:"a2_ff_19", topic:"Function Features", difficulty:"Medium", question:"An even function is symmetric about the...", choices:["x-axis","line y = x","y-axis","origin"], answer:2, hint:"Even functions mirror across the y-axis." },
      { id:"a2_ff_20", topic:"Function Features", difficulty:"Medium", question:"An odd function is symmetric about the...", choices:["y-axis","line y = x","origin","x-axis"], answer:2, hint:"Odd functions have rotational symmetry about the origin." },
      { id:"a2_ff_21", topic:"Function Features", difficulty:"Hard", question:"If f(−x) = f(x) for all x, then f is...", choices:["Odd","Even","Linear","Neither"], answer:1, hint:"That's the definition of an even function." },
      { id:"a2_ff_22", topic:"Function Features", difficulty:"Hard", question:"Is f(x) = x³ + x² even, odd, or neither?", choices:["Even","Odd","Neither","Both"], answer:2, hint:"Mixing odd and even powers → neither symmetry holds." },
      { id:"a2_ff_23", topic:"Function Features", difficulty:"Hard", question:"f is odd and f(3) = 5. What is f(−3)?", choices:["5","−5","−3","3"], answer:1, hint:"Odd functions: f(−x) = −f(x), so f(−3) = −5." },
      { id:"a2_ff_24", topic:"Function Features", difficulty:"Hard", question:"f is even and f(−2) = 7. What is f(2)?", choices:["−2","2","−7","7"], answer:3, hint:"Even functions: f(−x) = f(x), so f(2) = 7." },
      { id:"a2_ff_25", topic:"Function Features", difficulty:"Easy", question:"On what interval is f(x) = x² increasing?", choices:["all x","x < 0","never","x > 0"], answer:3, hint:"To the right of the vertex (0,0) the parabola rises." },
      { id:"a2_ff_26", topic:"Function Features", difficulty:"Easy", question:"On what interval is f(x) = x² decreasing?", choices:["x > 0","all x","x < 0","never"], answer:2, hint:"Left of the vertex it falls." },
      { id:"a2_ff_27", topic:"Function Features", difficulty:"Medium", question:"A line y = 3x + 1 is...", choices:["Increasing then decreasing","Constant","Always increasing","Always decreasing"], answer:2, hint:"Positive slope means always increasing." },
      { id:"a2_ff_28", topic:"Function Features", difficulty:"Medium", question:"A line y = −2x + 5 is...", choices:["Always increasing","Constant","Increasing then decreasing","Always decreasing"], answer:3, hint:"Negative slope means always decreasing." },
      { id:"a2_ff_29", topic:"Function Features", difficulty:"Medium", question:"The vertex of y = (x − 2)² + 1 is a...", choices:["Maximum","Minimum","Inflection point","x-intercept"], answer:1, hint:"Upward parabola → vertex is the lowest point (minimum)." },
      { id:"a2_ff_30", topic:"Function Features", difficulty:"Hard", question:"For f(x) = x² − 6x, on what interval is f decreasing?", choices:["all x","x < 3","x > 3","x < 0"], answer:1, hint:"Vertex at x = 3; decreasing to the left of it." },
      { id:"a2_ff_31", topic:"Function Features", difficulty:"Hard", question:"A cubic f(x) = x³ is...", choices:["Always decreasing","Increasing then decreasing","Decreasing then increasing","Always increasing"], answer:3, hint:"x³ rises everywhere (flat tangent only at origin)." },
      { id:"a2_ff_32", topic:"Function Features", difficulty:"Hard", question:"f(x) = −(x + 1)² + 4 increases on which interval?", choices:["x > −1","x < −1","never","all x"], answer:1, hint:"Downward parabola with vertex at x = −1; rises to the left." },
      { id:"a2_ff_33", topic:"Function Features", difficulty:"Easy", question:"What is the domain of f(x) = x² ?", choices:["x > 0","x ≠ 0","All real numbers","x ≥ 0"], answer:2, hint:"Polynomials accept every real input." },
      { id:"a2_ff_34", topic:"Function Features", difficulty:"Medium", question:"What is the domain of f(x) = √x ?", choices:["x > 0","all reals","x ≤ 0","x ≥ 0"], answer:3, hint:"Square roots need a non-negative radicand." },
      { id:"a2_ff_35", topic:"Function Features", difficulty:"Medium", question:"What is the domain of f(x) = 1/(x − 3) ?", choices:["x ≥ 3","all reals","x ≠ 3","x ≠ 0"], answer:2, hint:"Denominator can't be zero, so x ≠ 3." },
      { id:"a2_ff_36", topic:"Function Features", difficulty:"Medium", question:"What is the domain of f(x) = √(x − 5) ?", choices:["x ≤ 5","x ≠ 5","x ≥ 5","x > 5"], answer:2, hint:"Need x − 5 ≥ 0." },
      { id:"a2_ff_37", topic:"Function Features", difficulty:"Hard", question:"Domain of f(x) = 1/√(x − 2) ?", choices:["x ≥ 2","x > 2","x < 2","x ≠ 2"], answer:1, hint:"Radicand must be positive (can't be 0 in the denominator): x − 2 > 0." },
      { id:"a2_ff_38", topic:"Function Features", difficulty:"Hard", question:"Domain of f(x) = (x + 1)/(x² − 9) ?", choices:["x ≠ 3","x ≠ −1","x ≠ ±3","all reals"], answer:2, hint:"x² − 9 = 0 at x = ±3, so exclude both." },
      { id:"a2_ff_39", topic:"Function Features", difficulty:"Easy", question:"What is the domain of the line y = 2x + 1 ?", choices:["x ≠ 1","All real numbers","x > 0","x ≥ 0"], answer:1, hint:"Lines are defined for every x." },
      { id:"a2_ff_40", topic:"Function Features", difficulty:"Medium", question:"What is the range of f(x) = x² ?", choices:["y ≤ 0","all reals","y > 0","y ≥ 0"], answer:3, hint:"Squares are never negative; minimum output is 0." },
      { id:"a2_ff_41", topic:"Function Features", difficulty:"Medium", question:"What is the range of f(x) = −x² ?", choices:["y < 0","y ≥ 0","y ≤ 0","all reals"], answer:2, hint:"Downward parabola maxes at 0." },
      { id:"a2_ff_42", topic:"Function Features", difficulty:"Medium", question:"What is the range of f(x) = x² + 3 ?", choices:["y ≤ 3","all reals","y ≥ 3","y > 3"], answer:2, hint:"Vertex at (0, 3); opens up." },
      { id:"a2_ff_43", topic:"Function Features", difficulty:"Medium", question:"What is the range of f(x) = |x| ?", choices:["y ≤ 0","y > 0","y ≥ 0","all reals"], answer:2, hint:"Absolute value outputs are non-negative." },
      { id:"a2_ff_44", topic:"Function Features", difficulty:"Hard", question:"Range of f(x) = (x − 1)² − 4 ?", choices:["y ≥ 1","y ≥ −4","all reals","y ≤ −4"], answer:1, hint:"Vertex (1, −4), opens up → minimum −4." },
      { id:"a2_ff_45", topic:"Function Features", difficulty:"Hard", question:"Range of f(x) = 2ˣ ?", choices:["y ≥ 0","y > 0","y > 1","all reals"], answer:1, hint:"Exponentials are always positive, approaching but never reaching 0." },
      { id:"a2_ff_46", topic:"Function Features", difficulty:"Hard", question:"Range of f(x) = −(x + 2)² + 5 ?", choices:["y ≥ 5","all reals","y ≤ 5","y ≤ −2"], answer:2, hint:"Downward parabola, vertex (−2, 5) → max 5." },
      { id:"a2_ff_47", topic:"Function Features", difficulty:"Easy", question:"What is the y-intercept of f(x) = x² − 4 ?", choices:["(−4, 0)","(0, 4)","(0, −4)","(2, 0)"], answer:2, hint:"Set x = 0: f(0) = −4." },
      { id:"a2_ff_48", topic:"Function Features", difficulty:"Easy", question:"What are the x-intercepts of f(x) = x² − 9 ?", choices:["(0,−9)","(3,0) and (−3,0)","(0,9)","(9,0) only"], answer:1, hint:"Set y = 0: x² = 9 → x = ±3." },
      { id:"a2_ff_49", topic:"Function Features", difficulty:"Medium", question:"The x-intercepts of f(x) = (x − 2)(x + 5) are...", choices:["x = 2 and x = 5","x = −2 and x = 5","x = 10","x = 2 and x = −5"], answer:3, hint:"Set each factor to zero." },
      { id:"a2_ff_50", topic:"Function Features", difficulty:"Medium", question:"What is the y-intercept of f(x) = 3x³ − 2x + 7 ?", choices:["(7, 0)","(0, −2)","(0, 3)","(0, 7)"], answer:3, hint:"f(0) = 7." },
      { id:"a2_ff_51", topic:"Function Features", difficulty:"Hard", question:"How many x-intercepts does f(x) = x² + 1 have?", choices:["2","0","1","infinite"], answer:1, hint:"x² + 1 = 0 has no real solutions (discriminant < 0)." },
      { id:"a2_ff_52", topic:"Function Features", difficulty:"Hard", question:"f(x) = x³ − x. Find all x-intercepts.", choices:["x = 1, −1","x = 0 only","x = 0, 1","x = 0, 1, −1"], answer:3, hint:"Factor: x(x − 1)(x + 1) = 0." },
      { id:"a2_pf_1", topic:"Parent Functions Library", difficulty:"Easy", question:"What is the parent function for a straight line through the origin with slope 1?", choices:["y = |x|","y = 1/x","y = x","y = x²"], answer:2, hint:"The linear parent function is y = x." },
      { id:"a2_pf_2", topic:"Parent Functions Library", difficulty:"Easy", question:"y = x is shifted UP 3. New equation?", choices:["y = (x+3)","y = x + 3","y = 3x","y = x − 3"], answer:1, hint:"Adding outside shifts vertically up." },
      { id:"a2_pf_3", topic:"Parent Functions Library", difficulty:"Medium", question:"y = x is shifted RIGHT 2. New equation?", choices:["y = x + 2","y = x − 2","y = −x + 2","y = 2x"], answer:1, hint:"Inside the function, right means subtract: (x − 2)." },
      { id:"a2_pf_4", topic:"Parent Functions Library", difficulty:"Medium", question:"y = x reflected over the x-axis becomes?", choices:["y = x","y = |x|","y = −x","y = 1/x"], answer:2, hint:"A reflection over x-axis negates the output." },
      { id:"a2_pf_5", topic:"Parent Functions Library", difficulty:"Medium", question:"y = x with a vertical stretch by 4 becomes?", choices:["y = x/4","y = x − 4","y = x + 4","y = 4x"], answer:3, hint:"Multiply the function by 4." },
      { id:"a2_pf_6", topic:"Parent Functions Library", difficulty:"Hard", question:"y = x shifted left 1 and down 5. New equation?", choices:["y = (x + 1) + 5","y = (x − 1) + 5","y = (x + 1) − 5","y = (x − 1) − 5"], answer:2, hint:"Left 1 → (x+1); down 5 → −5." },
      { id:"a2_pf_7", topic:"Parent Functions Library", difficulty:"Hard", question:"Point (2, 2) is on y = x. After y = x − 4, where does it move?", choices:["(2, 6)","(2, −2)","(−2, 2)","(6, 2)"], answer:1, hint:"−4 lowers every output by 4: 2 − 4 = −2." },
      { id:"a2_pf_8", topic:"Parent Functions Library", difficulty:"Easy", question:"What is the parent function of a basic parabola?", choices:["y = x³","y = √x","y = x²","y = x"], answer:2, hint:"The quadratic parent function is y = x²." },
      { id:"a2_pf_9", topic:"Parent Functions Library", difficulty:"Easy", question:"y = x² shifted UP 6. New equation?", choices:["y = 6x²","y = x² − 6","y = (x+6)²","y = x² + 6"], answer:3, hint:"Add outside to shift up." },
      { id:"a2_pf_10", topic:"Parent Functions Library", difficulty:"Medium", question:"y = x² shifted LEFT 3. New equation?", choices:["y = x² + 3","y = (x − 3)²","y = (x + 3)²","y = x² − 3"], answer:2, hint:"Left → add inside: (x + 3)²." },
      { id:"a2_pf_11", topic:"Parent Functions Library", difficulty:"Medium", question:"y = x² reflected over the x-axis (opens down)?", choices:["y = 1/x²","y = −x²","y = (−x)²","y = x²"], answer:1, hint:"Negative in front flips it downward." },
      { id:"a2_pf_12", topic:"Parent Functions Library", difficulty:"Medium", question:"y = x² vertically stretched by 2. New equation?", choices:["y = (2x)²","y = x² + 2","y = 2x²","y = x²/2"], answer:2, hint:"Multiply the squared term by 2." },
      { id:"a2_pf_13", topic:"Parent Functions Library", difficulty:"Hard", question:"Vertex of y = (x − 4)² + 1 ?", choices:["(1, 4)","(4, −1)","(−4, 1)","(4, 1)"], answer:3, hint:"Vertex form a(x−h)²+k has vertex (h, k)." },
      { id:"a2_pf_14", topic:"Parent Functions Library", difficulty:"Hard", question:"y = x² is shifted right 2, down 3, and reflected down. Equation?", choices:["y = (x − 2)² − 3","y = −(x − 2)² − 3","y = −(x + 2)² − 3","y = −(x − 2)² + 3"], answer:1, hint:"Reflect: −; right 2: (x−2); down 3: −3." },
      { id:"a2_pf_15", topic:"Parent Functions Library", difficulty:"Easy", question:"What is the cubic parent function?", choices:["y = x²","y = x","y = x³","y = |x|"], answer:2, hint:"The cubic parent function is y = x³." },
      { id:"a2_pf_16", topic:"Parent Functions Library", difficulty:"Easy", question:"y = x³ shifted DOWN 2. New equation?", choices:["y = 2x³","y = x³ + 2","y = x³ − 2","y = (x−2)³"], answer:2, hint:"Subtract outside to shift down." },
      { id:"a2_pf_17", topic:"Parent Functions Library", difficulty:"Medium", question:"y = x³ shifted RIGHT 5. New equation?", choices:["y = x³ + 5","y = (x + 5)³","y = x³ − 5","y = (x − 5)³"], answer:3, hint:"Right → subtract inside." },
      { id:"a2_pf_18", topic:"Parent Functions Library", difficulty:"Medium", question:"y = x³ reflected over the x-axis?", choices:["y = x³","both A and C","y = (−x)³","y = −x³"], answer:3, hint:"For odd functions −x³ and (−x)³ are equal; A is the standard form." },
      { id:"a2_pf_19", topic:"Parent Functions Library", difficulty:"Medium", question:"y = x³ vertically compressed by 1/2. New equation?", choices:["y = 2x³","y = ½x³","y = x³ + ½","y = (½x)³"], answer:1, hint:"Multiply by the fraction ½." },
      { id:"a2_pf_20", topic:"Parent Functions Library", difficulty:"Hard", question:"Point of inflection of y = (x + 1)³ − 4 ?", choices:["(4, −1)","(−1, 4)","(1, −4)","(−1, −4)"], answer:3, hint:"The cubic's center moves to (h, k) = (−1, −4)." },
      { id:"a2_pf_21", topic:"Parent Functions Library", difficulty:"Hard", question:"(1, 1) is on y = x³. After y = (x − 2)³ + 5, it maps to?", choices:["(3, 4)","(1, 6)","(−1, 6)","(3, 6)"], answer:3, hint:"Right 2 (x: 1→3), up 5 (y: 1→6)." },
      { id:"a2_pf_22", topic:"Parent Functions Library", difficulty:"Easy", question:"What is the square root parent function?", choices:["y = x²","y = |x|","y = 1/x","y = √x"], answer:3, hint:"The radical parent function is y = √x." },
      { id:"a2_pf_23", topic:"Parent Functions Library", difficulty:"Easy", question:"Domain of the parent y = √x ?", choices:["all reals","x ≥ 0","x > 0","x ≤ 0"], answer:1, hint:"You can't take the square root of a negative." },
      { id:"a2_pf_24", topic:"Parent Functions Library", difficulty:"Medium", question:"y = √x shifted UP 4. New equation?", choices:["y = √(x + 4)","y = √(x − 4)","y = √x + 4","y = √x − 4"], answer:2, hint:"Add outside the radical for vertical shift." },
      { id:"a2_pf_25", topic:"Parent Functions Library", difficulty:"Medium", question:"y = √x shifted RIGHT 9. New equation?", choices:["y = √x − 9","y = √(x + 9)","y = √(x − 9)","y = √x + 9"], answer:2, hint:"Right → subtract inside: √(x − 9)." },
      { id:"a2_pf_26", topic:"Parent Functions Library", difficulty:"Medium", question:"y = √x reflected over the x-axis?", choices:["y = √x","y = √(−x)","y = 1/√x","y = −√x"], answer:3, hint:"Negative outside flips it down." },
      { id:"a2_pf_27", topic:"Parent Functions Library", difficulty:"Hard", question:"Domain of y = √(x − 3) ?", choices:["x ≤ 3","x ≥ −3","x ≥ 0","x ≥ 3"], answer:3, hint:"Need x − 3 ≥ 0." },
      { id:"a2_pf_28", topic:"Parent Functions Library", difficulty:"Hard", question:"y = √x reflected over the y-axis becomes y = √(−x). Its domain?", choices:["x < 0","x ≤ 0","x ≥ 0","all reals"], answer:1, hint:"Need −x ≥ 0, so x ≤ 0." },
      { id:"a2_pf_29", topic:"Parent Functions Library", difficulty:"Easy", question:"What is the absolute value parent function?", choices:["y = x","y = x²","y = |x|","y = √x"], answer:2, hint:"The V-shaped parent function is y = |x|." },
      { id:"a2_pf_30", topic:"Parent Functions Library", difficulty:"Easy", question:"y = |x| shifted UP 2. New equation?", choices:["y = |x| − 2","y = |x + 2|","y = |x − 2|","y = |x| + 2"], answer:3, hint:"Add outside to move the V up." },
      { id:"a2_pf_31", topic:"Parent Functions Library", difficulty:"Medium", question:"y = |x| shifted LEFT 5. New equation?", choices:["y = |x| + 5","y = |x + 5|","y = |x| − 5","y = |x − 5|"], answer:1, hint:"Left → add inside: |x + 5|." },
      { id:"a2_pf_32", topic:"Parent Functions Library", difficulty:"Medium", question:"y = |x| reflected over the x-axis (opens down)?", choices:["y = 1/|x|","y = −|x|","y = |x|","y = |−x|"], answer:1, hint:"Negative in front flips the V downward." },
      { id:"a2_pf_33", topic:"Parent Functions Library", difficulty:"Medium", question:"y = |x| vertically stretched by 3. New equation?", choices:["y = |x| + 3","y = 3|x|","y = |3x|","y = |x|/3"], answer:1, hint:"Multiply the absolute value by 3." },
      { id:"a2_pf_34", topic:"Parent Functions Library", difficulty:"Hard", question:"Vertex of y = |x − 2| + 7 ?", choices:["(7, 2)","(2, −7)","(−2, 7)","(2, 7)"], answer:3, hint:"The corner sits at (h, k) = (2, 7)." },
      { id:"a2_pf_35", topic:"Parent Functions Library", difficulty:"Hard", question:"y = |x| shifted right 4, down 1, reflected down. Equation?", choices:["y = −|x − 4| + 1","y = −|x + 4| − 1","y = |x − 4| − 1","y = −|x − 4| − 1"], answer:3, hint:"Reflect −; right 4: (x−4); down 1: −1." },
      { id:"a2_pf_36", topic:"Parent Functions Library", difficulty:"Easy", question:"Which is an exponential parent function?", choices:["y = 2x","y = x²","y = 2ˣ","y = √x"], answer:2, hint:"Variable in the exponent → exponential." },
      { id:"a2_pf_37", topic:"Parent Functions Library", difficulty:"Easy", question:"Range of the parent y = 2ˣ ?", choices:["y ≥ 0","y > 1","y > 0","all reals"], answer:2, hint:"Exponentials stay above the x-axis." },
      { id:"a2_pf_38", topic:"Parent Functions Library", difficulty:"Medium", question:"y = 2ˣ shifted UP 3. New equation?", choices:["y = 2^(x−3)","y = 2ˣ + 3","y = 2^(x+3)","y = 2ˣ − 3"], answer:1, hint:"Add outside the power." },
      { id:"a2_pf_39", topic:"Parent Functions Library", difficulty:"Medium", question:"y = 2ˣ shifted RIGHT 1. New equation?", choices:["y = 2^(x + 1)","y = 2ˣ + 1","y = 2^(x − 1)","y = 2ˣ − 1"], answer:2, hint:"Right → subtract inside the exponent." },
      { id:"a2_pf_40", topic:"Parent Functions Library", difficulty:"Medium", question:"The horizontal asymptote of y = 2ˣ is?", choices:["y = 1","y = 0","y = 2","x = 0"], answer:1, hint:"As x → −∞, 2ˣ approaches 0." },
      { id:"a2_pf_41", topic:"Parent Functions Library", difficulty:"Hard", question:"y = 2ˣ shifted up 5. New horizontal asymptote?", choices:["y = 0","y = 7","y = 2","y = 5"], answer:3, hint:"The asymptote shifts up with the graph." },
      { id:"a2_pf_42", topic:"Parent Functions Library", difficulty:"Hard", question:"y = 2ˣ reflected over the x-axis. Its range?", choices:["y ≤ 0","y < 0","y > 0","all reals"], answer:1, hint:"Flipping down makes all outputs negative." },
      { id:"a2_pf_43", topic:"Parent Functions Library", difficulty:"Easy", question:"Which is a logarithmic parent function?", choices:["y = x log","y = log x","y = x²","y = 10ˣ"], answer:1, hint:"y = log x is the log parent (inverse of 10ˣ)." },
      { id:"a2_pf_44", topic:"Parent Functions Library", difficulty:"Easy", question:"Domain of the parent y = log x ?", choices:["x < 0","all reals","x ≥ 0","x > 0"], answer:3, hint:"You can only take logs of positive numbers." },
      { id:"a2_pf_45", topic:"Parent Functions Library", difficulty:"Medium", question:"y = log x shifted UP 2. New equation?", choices:["y = log(x + 2)","y = log(x − 2)","y = log x + 2","y = log x − 2"], answer:2, hint:"Add outside the log." },
      { id:"a2_pf_46", topic:"Parent Functions Library", difficulty:"Medium", question:"y = log x shifted RIGHT 4. New equation?", choices:["y = log(x + 4)","y = log x + 4","y = log(x − 4)","y = log x − 4"], answer:2, hint:"Right → subtract inside." },
      { id:"a2_pf_47", topic:"Parent Functions Library", difficulty:"Medium", question:"The vertical asymptote of y = log x is?", choices:["y = 0","y = 1","x = 1","x = 0"], answer:3, hint:"Log curves hug the y-axis (x = 0)." },
      { id:"a2_pf_48", topic:"Parent Functions Library", difficulty:"Hard", question:"y = log x shifted right 3. New vertical asymptote?", choices:["x = −3","y = 3","x = 3","x = 0"], answer:2, hint:"The asymptote moves right with the graph." },
      { id:"a2_pf_49", topic:"Parent Functions Library", difficulty:"Hard", question:"Domain of y = log(x − 5) ?", choices:["x > −5","x ≥ 5","x > 5","x > 0"], answer:2, hint:"Need x − 5 > 0." },
      { id:"a2_pf_50", topic:"Parent Functions Library", difficulty:"Easy", question:"Which is the reciprocal parent function?", choices:["y = x²","y = √x","y = x","y = 1/x"], answer:3, hint:"y = 1/x is the rational/reciprocal parent." },
      { id:"a2_pf_51", topic:"Parent Functions Library", difficulty:"Easy", question:"What value is excluded from the domain of y = 1/x ?", choices:["−1","all","1","0"], answer:3, hint:"You can't divide by zero, so x ≠ 0." },
      { id:"a2_pf_52", topic:"Parent Functions Library", difficulty:"Medium", question:"y = 1/x shifted UP 1. New equation?", choices:["y = 1/(x−1)","y = 1/(x+1)","y = 1/x + 1","y = 1/x − 1"], answer:2, hint:"Add outside the fraction." },
      { id:"a2_pf_53", topic:"Parent Functions Library", difficulty:"Medium", question:"y = 1/x shifted RIGHT 2. New equation?", choices:["y = 1/x + 2","y = 1/(x − 2)","y = 1/x − 2","y = 1/(x + 2)"], answer:1, hint:"Right → subtract inside the denominator." },
      { id:"a2_pf_54", topic:"Parent Functions Library", difficulty:"Medium", question:"Horizontal asymptote of the parent y = 1/x ?", choices:["x = 0","y = 1","y = 0","y = x"], answer:2, hint:"As x → ±∞, 1/x → 0." },
      { id:"a2_pf_55", topic:"Parent Functions Library", difficulty:"Hard", question:"y = 1/x shifted right 3 and up 2. Equations of asymptotes?", choices:["x = −3, y = 2","x = 2, y = 3","x = 3, y = −2","x = 3, y = 2"], answer:3, hint:"Vertical shifts with x (x=3); horizontal shifts with y (y=2)." },
      { id:"a2_pf_56", topic:"Parent Functions Library", difficulty:"Hard", question:"y = 1/x reflected over the x-axis becomes?", choices:["y = 1/(−x)","y = 1/x","y = −1/x","both A and B"], answer:2, hint:"−1/x flips outputs; for this odd function 1/(−x) equals it too — A is standard." },
      { id:"a2_pf_57", topic:"Parent Functions Library", difficulty:"Easy", question:"Which is the cube root parent function?", choices:["y = 1/x","y = ∛x","y = x³","y = √x"], answer:1, hint:"y = ∛x is the cube root parent." },
      { id:"a2_pf_58", topic:"Parent Functions Library", difficulty:"Easy", question:"Domain of the parent y = ∛x ?", choices:["x > 0","all real numbers","x ≥ 0","x ≠ 0"], answer:1, hint:"Cube roots accept negatives too — all reals." },
      { id:"a2_pf_59", topic:"Parent Functions Library", difficulty:"Medium", question:"y = ∛x shifted DOWN 3. New equation?", choices:["y = ∛(x − 3)","y = ∛x − 3","y = ∛(x + 3)","y = ∛x + 3"], answer:1, hint:"Subtract outside the radical." },
      { id:"a2_pf_60", topic:"Parent Functions Library", difficulty:"Medium", question:"y = ∛x shifted LEFT 8. New equation?", choices:["y = ∛x − 8","y = ∛(x − 8)","y = ∛(x + 8)","y = ∛x + 8"], answer:2, hint:"Left → add inside." },
      { id:"a2_pf_61", topic:"Parent Functions Library", difficulty:"Medium", question:"Range of the parent y = ∛x ?", choices:["y ≤ 0","all real numbers","y ≥ 0","y > 0"], answer:1, hint:"Cube root outputs cover all reals." },
      { id:"a2_pf_62", topic:"Parent Functions Library", difficulty:"Hard", question:"y = ∛x reflected over the x-axis. New equation?", choices:["y = ∛x","both A and B","y = ∛(−x)","y = −∛x"], answer:3, hint:"−∛x flips it; cube root is odd so ∛(−x) matches — A is standard." },
      { id:"a2_pf_63", topic:"Parent Functions Library", difficulty:"Hard", question:"(8, 2) is on y = ∛x. After y = ∛(x) + 4, it maps to?", choices:["(8, 2)","(4, 6)","(8, 6)","(12, 2)"], answer:2, hint:"+4 raises output: 2 + 4 = 6." },
    ],
  },

  upperelementary: {
    id: "upperelementary", label: "Upper Elementary", emoji: "EL",
    color: "#EA580C", bg: "#FFF1E6", dark: "#C2410C",
    tagline: "4th grade word problems",
    topics: [
      { name: "Grade 3 Basics", icon: "", color: "#16A34A", bg: "#DCFCE7" },
      { name: "Multiplication", icon: "", color: "#EA580C", bg: "#FFF1E6" },
      { name: "Division", icon: "", color: C.sky, bg: "#E5F2FF" },
      { name: "Comparing Numbers", icon: "", color: C.violet, bg: C.lavender },
      { name: "Rounding & Estimating", icon: "", color: "#D97706", bg: "#FEF3C7" },
      { name: "Multi-Step Problems", icon: "", color: C.teal, bg: C.mint },
    ],
    seeds: [
      { id:"ue_1", topic:"Multiplication", difficulty:"Easy", question:"A classroom has 6 rows of desks with 5 desks in each row. How many desks in all?", choices:["11","36","25","30"], answer:3, hint:"Multiply rows by desks: 6 × 5." },
      { id:"ue_2", topic:"Multiplication", difficulty:"Easy", question:"Each pizza has 8 slices. How many slices are in 4 pizzas?", choices:["24","12","16","32"], answer:3, hint:"4 groups of 8: 4 × 8." },
      { id:"ue_3", topic:"Multiplication", difficulty:"Easy", question:"A bag holds 7 marbles. How many marbles in 6 bags?", choices:["48","36","42","13"], answer:2, hint:"6 × 7." },
      { id:"ue_4", topic:"Multiplication", difficulty:"Easy", question:"There are 9 boxes with 3 toys each. How many toys total?", choices:["12","30","18","27"], answer:3, hint:"9 × 3." },
      { id:"ue_5", topic:"Multiplication", difficulty:"Easy", question:"A book has 5 chapters, each with 10 pages. How many pages?", choices:["40","55","50","15"], answer:2, hint:"5 × 10." },
      { id:"ue_6", topic:"Multiplication", difficulty:"Medium", question:"A theater has 12 rows with 8 seats each. How many seats?", choices:["88","96","104","20"], answer:1, hint:"12 × 8." },
      { id:"ue_7", topic:"Multiplication", difficulty:"Medium", question:"Each crate holds 24 apples. How many apples in 5 crates?", choices:["29","125","120","100"], answer:2, hint:"5 × 24." },
      { id:"ue_8", topic:"Multiplication", difficulty:"Medium", question:"A farmer plants 15 rows of corn with 6 plants per row. How many plants?", choices:["21","96","90","80"], answer:2, hint:"15 × 6." },
      { id:"ue_9", topic:"Multiplication", difficulty:"Medium", question:"A store sells notebooks in packs of 4. How many notebooks in 23 packs?", choices:["27","82","96","92"], answer:3, hint:"23 × 4." },
      { id:"ue_10", topic:"Multiplication", difficulty:"Medium", question:"A school bus carries 36 students. How many students do 7 buses carry?", choices:["259","43","252","245"], answer:2, hint:"7 × 36." },
      { id:"ue_11", topic:"Multiplication", difficulty:"Hard", question:"A factory makes 125 toys each day. How many toys in 6 days?", choices:["720","131","756","750"], answer:3, hint:"125 × 6." },
      { id:"ue_12", topic:"Multiplication", difficulty:"Hard", question:"Each library shelf holds 48 books. A bookcase has 9 shelves. How many books fit?", choices:["424","57","440","432"], answer:3, hint:"48 × 9." },
      { id:"ue_13", topic:"Multiplication", difficulty:"Hard", question:"A stadium has 8 sections, each with 145 seats. How many total seats?", choices:["153","1,165","1,150","1,160"], answer:3, hint:"145 × 8." },
      { id:"ue_14", topic:"Division", difficulty:"Easy", question:"36 cookies are shared equally among 6 children. How many does each get?", choices:["30","9","42","6"], answer:3, hint:"36 ÷ 6." },
      { id:"ue_15", topic:"Division", difficulty:"Easy", question:"There are 20 students put into teams of 4. How many teams?", choices:["6","16","24","5"], answer:3, hint:"20 ÷ 4." },
      { id:"ue_16", topic:"Division", difficulty:"Easy", question:"48 pencils go into boxes of 8. How many boxes?", choices:["40","6","56","7"], answer:1, hint:"48 ÷ 8." },
      { id:"ue_17", topic:"Division", difficulty:"Easy", question:"A rope 27 feet long is cut into 3 equal pieces. How long is each?", choices:["8","30","24","9"], answer:3, hint:"27 ÷ 3." },
      { id:"ue_18", topic:"Division", difficulty:"Easy", question:"42 stickers shared by 7 friends. How many each?", choices:["35","6","49","7"], answer:1, hint:"42 ÷ 7." },
      { id:"ue_19", topic:"Division", difficulty:"Medium", question:"96 marbles are split evenly into 8 jars. How many in each jar?", choices:["104","88","11","12"], answer:3, hint:"96 ÷ 8." },
      { id:"ue_20", topic:"Division", difficulty:"Medium", question:"A baker has 144 muffins packed 12 to a box. How many boxes?", choices:["11","156","12","132"], answer:2, hint:"144 ÷ 12." },
      { id:"ue_21", topic:"Division", difficulty:"Medium", question:"225 students board buses that each hold 45. How many buses?", choices:["180","270","6","5"], answer:3, hint:"225 ÷ 45." },
      { id:"ue_22", topic:"Division", difficulty:"Medium", question:"A teacher divides 84 markers among 6 tables. How many per table?", choices:["90","13","78","14"], answer:3, hint:"84 ÷ 6." },
      { id:"ue_23", topic:"Division", difficulty:"Medium", question:"156 trading cards are shared equally by 4 kids. How many each?", choices:["160","152","39","38"], answer:2, hint:"156 ÷ 4." },
      { id:"ue_24", topic:"Division", difficulty:"Hard", question:"A school orders 365 books packed 7 to a box. How many full boxes, and how many left over?", choices:["51 boxes, 8 left","52 boxes, 0 left","53 boxes, 2 left","52 boxes, 1 left"], answer:3, hint:"365 ÷ 7 = 52 remainder 1." },
      { id:"ue_25", topic:"Division", difficulty:"Hard", question:"450 cupcakes are placed on trays of 8. How many full trays and how many cupcakes left?", choices:["55 trays, 10 left","57 trays, 6 left","56 trays, 0 left","56 trays, 2 left"], answer:3, hint:"450 ÷ 8 = 56 remainder 2." },
      { id:"ue_26", topic:"Division", difficulty:"Hard", question:"A field trip has 213 students with 1 chaperone per 9 students. How many chaperones are needed?", choices:["23","25","24","21"], answer:2, hint:"213 ÷ 9 = 23 r 6 — you still need 1 more for the leftover, so 24." },
      { id:"ue_27", topic:"Comparing Numbers", difficulty:"Easy", question:"Which number is greater: 4,506 or 4,560?", choices:["4,506","4,560","Can't tell","They are equal"], answer:1, hint:"Compare the tens place: 6 tens vs 0 tens." },
      { id:"ue_28", topic:"Comparing Numbers", difficulty:"Easy", question:"Which symbol makes it true: 3,209 ___ 3,290 ?", choices:["≤... none","=",">","<"], answer:3, hint:"3,209 is less than 3,290." },
      { id:"ue_29", topic:"Comparing Numbers", difficulty:"Easy", question:"Order from least to greatest: 812, 821, 128.", choices:["812, 821, 128","821, 812, 128","128, 812, 821","128, 821, 812"], answer:2, hint:"128 is smallest (1 hundred); then 812, then 821." },
      { id:"ue_30", topic:"Comparing Numbers", difficulty:"Easy", question:"Which is the largest? 5,000 4,999 5,001 4,909", choices:["4,999","5,000","5,001","4,909"], answer:2, hint:"5,001 has the most — compare ones after the thousands match." },
      { id:"ue_31", topic:"Comparing Numbers", difficulty:"Easy", question:"Round 6,481 to the nearest thousand.", choices:["6,400","7,000","6,000","6,500"], answer:2, hint:"The hundreds digit is 4, so round down." },
      { id:"ue_32", topic:"Comparing Numbers", difficulty:"Medium", question:"A store sold 3,452 toys in May and 3,425 in June. Which month sold more?", choices:["Same","May","Can't tell","June"], answer:1, hint:"3,452 > 3,425 (compare the tens place)." },
      { id:"ue_33", topic:"Comparing Numbers", difficulty:"Medium", question:"Round 8,749 to the nearest hundred.", choices:["8,800","9,000","8,700","8,750"], answer:2, hint:"Tens digit is 4, so round the hundreds down." },
      { id:"ue_34", topic:"Comparing Numbers", difficulty:"Medium", question:"Which statement is true?", choices:["7,830 = 7,803","7,830 > 7,803","7,830 < 7,803","7,803 > 7,830"], answer:1, hint:"Compare tens: 3 tens vs 0 tens, so 7,830 is greater." },
      { id:"ue_35", topic:"Comparing Numbers", difficulty:"Medium", question:"Two cities have populations 12,408 and 12,480. Which is bigger and by how much?", choices:["12,480 by 80","12,408 by 80","12,480 by 72","12,408 by 72"], answer:2, hint:"12,480 − 12,408 = 72." },
      { id:"ue_36", topic:"Comparing Numbers", difficulty:"Hard", question:"Round 45,672 to the nearest thousand, then to the nearest ten thousand.", choices:["45,000 then 40,000","46,000 then 40,000","45,000 then 50,000","46,000 then 50,000"], answer:3, hint:"Hundreds 6 → 46,000; thousands 5 → 50,000." },
      { id:"ue_37", topic:"Comparing Numbers", difficulty:"Hard", question:"Arrange greatest to least: 9,087 9,807 9,780 9,078.", choices:["9,087, 9,078, 9,780, 9,807","9,807, 9,780, 9,078, 9,087","9,780, 9,807, 9,087, 9,078","9,807, 9,780, 9,087, 9,078"], answer:3, hint:"Compare hundreds: 8,7,0,0 → 9,807 and 9,780 lead, then 9,087 > 9,078." },
      { id:"ue_38", topic:"Multi-Step Problems", difficulty:"Medium", question:"Maria buys 3 packs of pens with 6 pens each, then gives away 5. How many pens does she have?", choices:["11","23","13","18"], answer:2, hint:"3 × 6 = 18, then 18 − 5." },
      { id:"ue_39", topic:"Multi-Step Problems", difficulty:"Medium", question:"A class has 4 tables of 5 students and 2 tables of 6. How many students total?", choices:["20","34","30","32"], answer:3, hint:"(4×5) + (2×6) = 20 + 12." },
      { id:"ue_40", topic:"Multi-Step Problems", difficulty:"Medium", question:"Tom saves $8 a week for 5 weeks, then spends $15. How much is left?", choices:["$55","$25","$23","$40"], answer:1, hint:"8 × 5 = 40, then 40 − 15." },
      { id:"ue_41", topic:"Multi-Step Problems", difficulty:"Medium", question:"A bakery makes 6 trays of 12 muffins. They sell 50. How many are left?", choices:["28","18","72","22"], answer:3, hint:"6 × 12 = 72, then 72 − 50." },
      { id:"ue_42", topic:"Multi-Step Problems", difficulty:"Medium", question:"Sara reads 25 pages on Monday and 18 on Tuesday. The book has 60 pages. How many left?", choices:["43","17","23","7"], answer:1, hint:"25 + 18 = 43, then 60 − 43." },
      { id:"ue_43", topic:"Multi-Step Problems", difficulty:"Medium", question:"A store has 144 apples. They pack 12 per bag and sell 9 bags. How many apples are sold?", choices:["120","36","12","108"], answer:3, hint:"9 bags × 12 = 108 apples sold." },
      { id:"ue_44", topic:"Multi-Step Problems", difficulty:"Hard", question:"A school collects 245 cans Monday and 178 Tuesday, then splits them evenly into 9 boxes. About how many per box?", choices:["43","49","45","47"], answer:3, hint:"245 + 178 = 423; 423 ÷ 9 = 47." },
      { id:"ue_45", topic:"Multi-Step Problems", difficulty:"Hard", question:"4 friends earn $156 together mowing lawns and split it equally. Then each spends $12. How much does each have left?", choices:["$39","$24","$27","$144"], answer:2, hint:"156 ÷ 4 = 39, then 39 − 12." },
      { id:"ue_46", topic:"Multi-Step Problems", difficulty:"Hard", question:"A farmer has 8 baskets of 35 eggs. He sells 6 cartons of 30. How many eggs remain?", choices:["280","100","180","120"], answer:1, hint:"8 × 35 = 280; 6 × 30 = 180; 280 − 180." },
      { id:"ue_47", topic:"Multi-Step Problems", difficulty:"Hard", question:"A library buys 12 boxes of 25 books. They place them evenly on 6 shelves. How many books per shelf?", choices:["45","300","60","50"], answer:3, hint:"12 × 25 = 300; 300 ÷ 6 = 50." },
      { id:"ue_48", topic:"Multi-Step Problems", difficulty:"Hard", question:"A toy store gets 9 cases of 48 toys. After selling 350, how many are left?", choices:["78","350","82","432"], answer:2, hint:"9 × 48 = 432; 432 − 350." },
      { id:"ue_49", topic:"Multiplication", difficulty:"Easy", question:`Each row has 4 stars. How many stars in all?
    ★★★★
    ★★★★
    ★★★★`, choices:["7","16","8","12"], answer:3, hint:"3 rows of 4: count by 4s." },
      { id:"ue_50", topic:"Multiplication", difficulty:"Easy", question:`Count the dots in this array (5 columns, 2 rows):
    ● ● ● ● ●
    ● ● ● ● ●`, choices:["7","12","10","25"], answer:2, hint:"2 rows of 5 = 5 + 5." },
      { id:"ue_51", topic:"Multiplication", difficulty:"Easy", question:`How many squares? (4 rows of 3)
    ■ ■ ■
    ■ ■ ■
    ■ ■ ■
    ■ ■ ■`, choices:["16","9","12","7"], answer:2, hint:"4 × 3 = count by 3s four times." },
      { id:"ue_52", topic:"Multiplication", difficulty:"Easy", question:`Each box holds 6 apples. There are 3 boxes:
    [🍎×6] [🍎×6] [🍎×6]
    How many apples?`, choices:["12","24","18","9"], answer:2, hint:"3 groups of 6." },
      { id:"ue_53", topic:"Multiplication", difficulty:"Medium", question:`This array shows 6 rows of 5 hearts. How many hearts?
    (♥♥♥♥♥ repeated 6 times)`, choices:["35","25","11","30"], answer:3, hint:"6 × 5 = 30." },
      { id:"ue_54", topic:"Multiplication", difficulty:"Medium", question:`A garden has 7 rows with 8 flowers each:
    🌸×8 per row, 7 rows
    How many flowers?`, choices:["48","56","64","15"], answer:1, hint:"7 × 8 = 56." },
      { id:"ue_55", topic:"Multiplication", difficulty:"Medium", question:"Each carton holds 12 eggs. The picture shows 4 cartons. How many eggs total?", choices:["44","16","36","48"], answer:3, hint:"4 × 12 = 48." },
      { id:"ue_56", topic:"Multiplication", difficulty:"Hard", question:"An array has 9 rows and 7 columns of dots. How many dots in all?", choices:["16","56","72","63"], answer:3, hint:"9 × 7 = 63." },
      { id:"ue_57", topic:"Multiplication", difficulty:"Hard", question:"A parking lot has 8 rows. Each row holds 15 cars. How many cars when full?", choices:["105","120","135","23"], answer:1, hint:"8 × 15 = 120." },
      { id:"ue_58", topic:"Division", difficulty:"Easy", question:`12 cookies shared equally on 3 plates:
    🍪🍪🍪🍪 | 🍪🍪🍪🍪 | 🍪🍪🍪🍪
    How many cookies per plate?`, choices:["6","9","3","4"], answer:3, hint:"12 ÷ 3 = 4." },
      { id:"ue_59", topic:"Division", difficulty:"Easy", question:`15 stars split into 5 equal groups. How many per group?
    ★★★ ★★★ ★★★ ★★★ ★★★`, choices:["5","4","10","3"], answer:3, hint:"15 ÷ 5 = 3." },
      { id:"ue_60", topic:"Division", difficulty:"Easy", question:"20 dots arranged in 4 equal rows. How many dots in each row?", choices:["6","16","4","5"], answer:3, hint:"20 ÷ 4 = 5." },
      { id:"ue_61", topic:"Division", difficulty:"Easy", question:`18 balloons shared by 2 children equally:
    🎈×18 → 2 kids
    How many each?`, choices:["6","8","16","9"], answer:3, hint:"18 ÷ 2 = 9." },
      { id:"ue_62", topic:"Division", difficulty:"Medium", question:`24 pencils packed into boxes of 6. How many boxes?
    ✏️×24 → groups of 6`, choices:["18","6","4","3"], answer:2, hint:"24 ÷ 6 = 4." },
      { id:"ue_63", topic:"Division", difficulty:"Medium", question:"A picture shows 35 apples split into 7 equal baskets. How many apples per basket?", choices:["7","5","6","28"], answer:1, hint:"35 ÷ 7 = 5." },
      { id:"ue_64", topic:"Division", difficulty:"Medium", question:"32 marbles shared equally among 8 cups. How many marbles in each cup?", choices:["5","24","4","8"], answer:2, hint:"32 ÷ 8 = 4." },
      { id:"ue_65", topic:"Division", difficulty:"Hard", question:"A picture shows 27 toys put into groups of 4. How many full groups, and how many left over?", choices:["5 groups, 7 left","6 groups, 3 left","6 groups, 0 left","7 groups, 1 left"], answer:1, hint:"27 ÷ 4 = 6 remainder 3." },
      { id:"ue_66", topic:"Division", difficulty:"Hard", question:"45 stickers shared among 6 friends as evenly as possible. How many does each get, and how many remain?", choices:["8 each, 3 left","7 each, 0 left","6 each, 9 left","7 each, 3 left"], answer:3, hint:"45 ÷ 6 = 7 remainder 3." },
      { id:"ue_67", topic:"Rounding & Estimating", difficulty:"Easy", question:"Round 47 to the nearest ten.\nIs 47 closer to 40 or to 50?", choices:["30","50","45","40"], answer:1, hint:"47 is past the halfway point (45), so it rounds up to 50." },
      { id:"ue_68", topic:"Rounding & Estimating", difficulty:"Easy", question:"Round 23 to the nearest ten.\nIs 23 past the halfway mark of 25?", choices:["30","20","10","25"], answer:1, hint:"23 is closer to 20 than 30." },
      { id:"ue_69", topic:"Rounding & Estimating", difficulty:"Easy", question:"Round 68 to the nearest ten.\nIs 68 past the halfway mark of 65?", choices:["80","70","65","60"], answer:1, hint:"68 is closer to 70." },
      { id:"ue_70", topic:"Rounding & Estimating", difficulty:"Easy", question:"Which number rounds to 50 when rounding to the nearest ten?", choices:["44","52","61","38"], answer:1, hint:"52 rounds to 50; the others round to 60, 40, and 40." },
      { id:"ue_71", topic:"Rounding & Estimating", difficulty:"Medium", question:"Round 345 to the nearest hundred.\nIs 345 past the halfway mark of 350?", choices:["350","340","300","400"], answer:2, hint:"345 — the tens digit is 4, so round down to 300." },
      { id:"ue_72", topic:"Rounding & Estimating", difficulty:"Medium", question:"Estimate 38 + 41 by rounding each to the nearest ten.", choices:["70","90","80","79"], answer:2, hint:"38→40, 41→40, so about 40 + 40 = 80." },
      { id:"ue_73", topic:"Rounding & Estimating", difficulty:"Medium", question:"Estimate 412 − 189 by rounding to the nearest hundred.", choices:["223","200","100","300"], answer:1, hint:"412→400, 189→200, so about 400 − 200 = 200." },
      { id:"ue_74", topic:"Rounding & Estimating", difficulty:"Medium", question:"Round 6,481 to the nearest thousand.", choices:["6,400","6,500","7,000","6,000"], answer:3, hint:"The hundreds digit is 4, so round down." },
      { id:"ue_75", topic:"Rounding & Estimating", difficulty:"Medium", question:"About how much is 19 × 21? (round to estimate)", choices:["420","399","400","380"], answer:2, hint:"19→20, 21→20, so about 20 × 20 = 400." },
      { id:"ue_76", topic:"Rounding & Estimating", difficulty:"Hard", question:"A store has 287 red and 612 blue pens. Estimate the total to the nearest hundred.", choices:["899","1,000","900","800"], answer:2, hint:"287→300, 612→600, so about 300 + 600 = 900." },
      { id:"ue_77", topic:"Rounding & Estimating", difficulty:"Hard", question:"Estimate 5,892 ÷ 6 by rounding the dividend to the nearest thousand.", choices:["About 1,200","About 600","About 900","About 1,000"], answer:3, hint:"5,892→6,000; 6,000 ÷ 6 = 1,000." },
      { id:"ue_78", topic:"Rounding & Estimating", difficulty:"Hard", question:"Round 7,650 to the nearest hundred, then to the nearest thousand.", choices:["7,700 then 7,000","7,700 then 8,000","7,600 then 8,000","7,600 then 7,000"], answer:1, hint:"Tens 5 → 7,700; hundreds 6 → 8,000." },
      { id:"ue_79", topic:"Grade 3 Basics", difficulty:"Easy", question:"What is 3 × 4?", choices:["7","9","16","12"], answer:3, hint:"" },
      { id:"ue_80", topic:"Grade 3 Basics", difficulty:"Easy", question:"What is 5 × 6?", choices:["35","11","25","30"], answer:3, hint:"" },
      { id:"ue_81", topic:"Grade 3 Basics", difficulty:"Easy", question:"What is 7 × 8?", choices:["48","15","56","64"], answer:2, hint:"" },
      { id:"ue_82", topic:"Grade 3 Basics", difficulty:"Easy", question:"What is 6 × 6?", choices:["12","36","30","42"], answer:1, hint:"" },
      { id:"ue_83", topic:"Grade 3 Basics", difficulty:"Easy", question:"A array has 4 rows of 5. How many in all?", choices:["9","20","25","15"], answer:1, hint:"" },
      { id:"ue_84", topic:"Grade 3 Basics", difficulty:"Medium", question:"What is 9 × 7?", choices:["72","16","56","63"], answer:3, hint:"" },
      { id:"ue_85", topic:"Grade 3 Basics", difficulty:"Medium", question:"What is 8 × 8?", choices:["16","56","72","64"], answer:3, hint:"" },
      { id:"ue_86", topic:"Grade 3 Basics", difficulty:"Medium", question:"There are 6 bags with 7 apples each. How many apples?", choices:["13","42","48","36"], answer:1, hint:"" },
      { id:"ue_87", topic:"Grade 3 Basics", difficulty:"Easy", question:"What is 12 ÷ 3?", choices:["6","9","4","3"], answer:2, hint:"" },
      { id:"ue_88", topic:"Grade 3 Basics", difficulty:"Easy", question:"What is 20 ÷ 4?", choices:["16","6","5","4"], answer:2, hint:"" },
      { id:"ue_89", topic:"Grade 3 Basics", difficulty:"Easy", question:"What is 18 ÷ 2?", choices:["8","16","9","6"], answer:2, hint:"" },
      { id:"ue_90", topic:"Grade 3 Basics", difficulty:"Medium", question:"What is 56 ÷ 7?", choices:["6","8","7","9"], answer:1, hint:"" },
      { id:"ue_91", topic:"Grade 3 Basics", difficulty:"Medium", question:"Share 24 cookies among 4 kids equally. How many each?", choices:["20","8","4","6"], answer:3, hint:"" },
      { id:"ue_92", topic:"Grade 3 Basics", difficulty:"Medium", question:"What is 35 ÷ 5?", choices:["5","30","6","7"], answer:3, hint:"" },
      { id:"ue_93", topic:"Grade 3 Basics", difficulty:"Easy", question:"What is 234 + 152?", choices:["380","386","486","376"], answer:1, hint:"" },
      { id:"ue_94", topic:"Grade 3 Basics", difficulty:"Easy", question:"What is 405 + 318?", choices:["713","813","733","723"], answer:3, hint:"" },
      { id:"ue_95", topic:"Grade 3 Basics", difficulty:"Medium", question:"What is 562 − 247?", choices:["325","305","315","415"], answer:2, hint:"" },
      { id:"ue_96", topic:"Grade 3 Basics", difficulty:"Medium", question:"What is 700 − 256?", choices:["344","454","444","544"], answer:2, hint:"" },
      { id:"ue_97", topic:"Grade 3 Basics", difficulty:"Medium", question:"A store had 480 books and sold 215. How many are left?", choices:["365","255","265","275"], answer:2, hint:"" },
      { id:"ue_98", topic:"Grade 3 Basics", difficulty:"Easy", question:"Round 47 to the nearest ten.", choices:["40","45","50","60"], answer:2, hint:"" },
      { id:"ue_99", topic:"Grade 3 Basics", difficulty:"Easy", question:"Round 83 to the nearest ten.", choices:["90","70","80","85"], answer:2, hint:"" },
      { id:"ue_100", topic:"Grade 3 Basics", difficulty:"Medium", question:"Round 350 to the nearest hundred.", choices:["300","500","400","350"], answer:2, hint:"" },
      { id:"ue_101", topic:"Grade 3 Basics", difficulty:"Medium", question:"Round 612 to the nearest hundred.", choices:["610","500","700","600"], answer:3, hint:"" },
      { id:"ue_102", topic:"Grade 3 Basics", difficulty:"Easy", question:"Which fraction shows one half?", choices:["2/1","1/3","1/4","1/2"], answer:3, hint:"" },
      { id:"ue_103", topic:"Grade 3 Basics", difficulty:"Easy", question:"A pizza is cut into 4 equal slices. You eat 1. What fraction did you eat?", choices:["4/1","1/2","3/4","1/4"], answer:3, hint:"" },
      { id:"ue_104", topic:"Grade 3 Basics", difficulty:"Medium", question:"Which is larger: 1/2 or 1/4?", choices:["Cannot tell","1/2","They are equal","1/4"], answer:1, hint:"" },
      { id:"ue_105", topic:"Grade 3 Basics", difficulty:"Medium", question:"What fraction of this set is shaded if 2 out of 3 are shaded?", choices:["2/2","3/2","1/3","2/3"], answer:3, hint:"" },
      { id:"ue_106", topic:"Grade 3 Basics", difficulty:"Easy", question:"How many minutes are in 1 hour?", choices:["100","24","60","30"], answer:2, hint:"" },
      { id:"ue_107", topic:"Grade 3 Basics", difficulty:"Medium", question:"If it is 3:15 now, what time will it be in 30 minutes?", choices:["4:15","3:30","3:45","3:00"], answer:2, hint:"" },
      { id:"ue_108", topic:"Grade 3 Basics", difficulty:"Medium", question:"You have 3 quarters. How many cents is that?", choices:["100","75","50","25"], answer:1, hint:"" },
      { id:"ue_109", topic:"Grade 3 Basics", difficulty:"Medium", question:"A rectangle is 4 units long and 3 units wide. What is its area?", choices:["7 square units","12 units","14 square units","12 square units"], answer:3, hint:"" },
      { id:"ue_110", topic:"Grade 3 Basics", difficulty:"Medium", question:"A square has sides of 5. What is the perimeter?", choices:["15","25","10","20"], answer:3, hint:"" },
    ],
  },

  satmath: {
    id: "satmath", label: "SAT Math", emoji: "SAT",
    color: "#2563EB", bg: "#EFF6FF", dark: "#1D4ED8",
    tagline: "Algebra · 200 practice problems",
    topics: [
      { name: "Linear Equations (One Variable)", icon: "", color: "#2563EB", bg: "#DBEAFE" },
      { name: "Linear Functions & Slope", icon: "", color: "#0EA5A0", bg: "#DFF7F3" },
      { name: "Systems of Equations", icon: "", color: "#7C3AED", bg: "#EDE9FE" },
      { name: "Linear Inequalities", icon: "", color: "#DC2626", bg: "#FEE2E2" },
      { name: "Absolute Value", icon: "", color: "#D97706", bg: "#FEF3C7" },
      { name: "Expressions & Exponents", icon: "", color: "#DB2777", bg: "#FCE7F3" },
      { name: "Word Problems & Modeling", icon: "", color: "#16A34A", bg: "#DCFCE7" },
      { name: "Interpreting Models & Graphs", icon: "", color: "#0891B2", bg: "#CFFAFE" },
      { name: "Functions & Formulas", icon: "", color: "#9333EA", bg: "#F3E8FF" },
      { name: "Exponential & Percent Growth", icon: "", color: "#059669", bg: "#D1FAE5" },
      { name: "Quadratics", icon: "", color: "#DC2626", bg: "#FEE2E2" },
      { name: "Polynomials", icon: "", color: "#7C3AED", bg: "#EDE9FE" },
      { name: "Rational Expressions & Equations", icon: "", color: "#DB2777", bg: "#FCE7F3" },
      { name: "Radical & Exponential Equations", icon: "", color: "#D97706", bg: "#FEF3C7" },
      { name: "Nonlinear Systems & Composition", icon: "", color: "#0891B2", bg: "#CFFAFE" },
      { name: "Statistics & Data", icon: "", color: "#16A34A", bg: "#DCFCE7" },
      { name: "Geometry & Trigonometry", icon: "", color: "#EA580C", bg: "#FFEDD5" },
    ],
    seeds: [
      { id:"sat_1", topic:"Linear Equations (One Variable)", difficulty:"Easy", question:"If 3x + 7 = 22, what is the value of x?", choices:["15","29","7","5"], answer:3, hint:"" },
      { id:"sat_2", topic:"Linear Equations (One Variable)", difficulty:"Easy", question:"Solve: 5x − 9 = 16", choices:["4","25","5","7"], answer:2, hint:"" },
      { id:"sat_3", topic:"Linear Equations (One Variable)", difficulty:"Easy", question:"If 2(x + 4) = 18, what is x?", choices:["11","7","9","5"], answer:3, hint:"" },
      { id:"sat_4", topic:"Linear Equations (One Variable)", difficulty:"Easy", question:"Solve: x/4 + 3 = 8", choices:["2","5","44","20"], answer:3, hint:"" },
      { id:"sat_5", topic:"Linear Equations (One Variable)", difficulty:"Easy", question:"If 7 − 2x = 1, what is x?", choices:["4","-4","-3","3"], answer:3, hint:"" },
      { id:"sat_6", topic:"Linear Equations (One Variable)", difficulty:"Medium", question:"If 4(x − 3) = 2x + 6, what is x?", choices:["-9","6","9","3"], answer:2, hint:"" },
      { id:"sat_7", topic:"Linear Equations (One Variable)", difficulty:"Medium", question:"Solve: (2x + 1)/3 = 5", choices:["2","8","16","7"], answer:3, hint:"" },
      { id:"sat_8", topic:"Linear Equations (One Variable)", difficulty:"Medium", question:"If 0.5x + 2 = 0.2x + 5, what is x?", choices:["3","10","7","15"], answer:1, hint:"" },
      { id:"sat_9", topic:"Linear Equations (One Variable)", difficulty:"Medium", question:"Solve: 3x − (x − 4) = 12", choices:["2","16","8","4"], answer:3, hint:"" },
      { id:"sat_10", topic:"Linear Equations (One Variable)", difficulty:"Medium", question:"If (x/2) − (x/3) = 4, what is x?", choices:["12","6","24","2"], answer:2, hint:"" },
      { id:"sat_11", topic:"Linear Equations (One Variable)", difficulty:"Medium", question:"Solve: 6 − 3(2 − x) = 9", choices:["-1","1","5","3"], answer:3, hint:"" },
      { id:"sat_12", topic:"Linear Equations (One Variable)", difficulty:"Medium", question:"If 5(x + 2) − 3 = 2(x − 1) + 18, what is x?", choices:["9","5","7","3"], answer:3, hint:"" },
      { id:"sat_13", topic:"Linear Equations (One Variable)", difficulty:"Medium", question:"Solve: 8x − 5 = 3x + 20", choices:["3","5","15","25"], answer:1, hint:"" },
      { id:"sat_14", topic:"Linear Equations (One Variable)", difficulty:"Medium", question:"If 2x/5 = 6, what is the value of x?", choices:["30","3","15","12"], answer:2, hint:"" },
      { id:"sat_15", topic:"Linear Equations (One Variable)", difficulty:"Medium", question:"Solve: 4 − x = 2x − 8", choices:["-4","4","12","2"], answer:1, hint:"" },
      { id:"sat_16", topic:"Linear Equations (One Variable)", difficulty:"Hard", question:"If 3(2x − 1) = 4(x + 2) + x, what is x?", choices:["2","-11","5","11"], answer:3, hint:"" },
      { id:"sat_17", topic:"Linear Equations (One Variable)", difficulty:"Hard", question:"The equation 6x + 12 = a(x + 2) is true for all x. What is a?", choices:["12","2","6","3"], answer:2, hint:"" },
      { id:"sat_18", topic:"Linear Equations (One Variable)", difficulty:"Hard", question:"If (x − 3)/2 + (x + 1)/4 = 5, what is x?", choices:["9","7","5","3"], answer:1, hint:"" },
      { id:"sat_19", topic:"Linear Equations (One Variable)", difficulty:"Hard", question:"For what value of c does 4x + c = 4x + 9 have infinitely many solutions?", choices:["No value","9","0","4"], answer:1, hint:"" },
      { id:"sat_20", topic:"Linear Equations (One Variable)", difficulty:"Hard", question:"If 2(3x − 4) = 6x − 8, how many solutions does the equation have?", choices:["Exactly two","Infinitely many","Exactly one","Zero"], answer:1, hint:"" },
      { id:"sat_21", topic:"Linear Equations (One Variable)", difficulty:"Hard", question:"The equation 5x + b = 5x + 7 has no solution. Which must be true?", choices:["b = 0","b = 7","b ≠ 7","b > 7"], answer:2, hint:"" },
      { id:"sat_22", topic:"Linear Equations (One Variable)", difficulty:"Hard", question:"If (3x + 6)/3 = x + k for all x, what is k?", choices:["3","2","6","1"], answer:1, hint:"" },
      { id:"sat_23", topic:"Linear Equations (One Variable)", difficulty:"Hard", question:"If 7x − 2 = 3(x + 6) + 4x, the equation has how many solutions?", choices:["Two","One","Infinitely many","Zero"], answer:3, hint:"" },
      { id:"sat_24", topic:"Linear Equations (One Variable)", difficulty:"Hard", question:"If ax + 3 = 5x + 3 for all values of x, what is a?", choices:["8","5","3","0"], answer:1, hint:"" },
      { id:"sat_25", topic:"Linear Equations (One Variable)", difficulty:"Hard", question:"Solve for x: (x + 2)/3 − (x − 1)/2 = 1/6", choices:["4","2","3","1"], answer:2, hint:"" },
      { id:"sat_26", topic:"Linear Functions & Slope", difficulty:"Easy", question:"What is the slope of the line y = 4x − 3?", choices:["-4","4","3","-3"], answer:1, hint:"" },
      { id:"sat_27", topic:"Linear Functions & Slope", difficulty:"Easy", question:"What is the y-intercept of y = -2x + 7?", choices:["-7","2","7","-2"], answer:2, hint:"" },
      { id:"sat_28", topic:"Linear Functions & Slope", difficulty:"Easy", question:"A line passes through (0, 5) and (2, 11). What is its slope?", choices:["2","5","6","3"], answer:3, hint:"" },
      { id:"sat_29", topic:"Linear Functions & Slope", difficulty:"Easy", question:"If f(x) = 3x + 1, what is f(4)?", choices:["4","13","12","10"], answer:1, hint:"" },
      { id:"sat_30", topic:"Linear Functions & Slope", difficulty:"Easy", question:"Which point lies on the line y = 2x − 1?", choices:["(0, 1)","(2, 2)","(1, 3)","(3, 5)"], answer:3, hint:"" },
      { id:"sat_31", topic:"Linear Functions & Slope", difficulty:"Medium", question:"A line has slope 2 and passes through (1, 5). What is its equation?", choices:["y = 2x − 3","y = 2x + 5","y = 2x + 3","y = 5x + 2"], answer:2, hint:"" },
      { id:"sat_32", topic:"Linear Functions & Slope", difficulty:"Medium", question:"What is the slope of the line 3x + 4y = 12?", choices:["3/4","-4/3","4/3","-3/4"], answer:3, hint:"" },
      { id:"sat_33", topic:"Linear Functions & Slope", difficulty:"Medium", question:"If f(x) = 5x − 2 and f(a) = 13, what is a?", choices:["5","15","3","2"], answer:2, hint:"" },
      { id:"sat_34", topic:"Linear Functions & Slope", difficulty:"Medium", question:"The line through (2, 3) and (6, 11) has what slope?", choices:["1/2","2","8","4"], answer:1, hint:"" },
      { id:"sat_35", topic:"Linear Functions & Slope", difficulty:"Medium", question:"A line is parallel to y = -3x + 2. What is its slope?", choices:["3","1/3","-3","-1/3"], answer:2, hint:"" },
      { id:"sat_36", topic:"Linear Functions & Slope", difficulty:"Medium", question:"A line is perpendicular to y = 2x + 1. What is its slope?", choices:["2","-1/2","-2","1/2"], answer:1, hint:"" },
      { id:"sat_37", topic:"Linear Functions & Slope", difficulty:"Medium", question:"If g(x) = -x + 6, for what x is g(x) = 0?", choices:["-6","0","6","1"], answer:2, hint:"" },
      { id:"sat_38", topic:"Linear Functions & Slope", difficulty:"Medium", question:"What is the x-intercept of y = 3x − 12?", choices:["12","4","-4","-12"], answer:1, hint:"" },
      { id:"sat_39", topic:"Linear Functions & Slope", difficulty:"Medium", question:"A linear function has f(0) = 4 and f(2) = 10. What is f(5)?", choices:["16","19","22","13"], answer:1, hint:"" },
      { id:"sat_40", topic:"Linear Functions & Slope", difficulty:"Medium", question:"The graph of y = mx + b passes through (0, -2) and (4, 6). Find m.", choices:["4","2","-2","8"], answer:1, hint:"" },
      { id:"sat_41", topic:"Linear Functions & Slope", difficulty:"Hard", question:"Line L passes through (1, 4) and is perpendicular to y = (1/2)x + 3. What is the equation of L?", choices:["y = -2x + 4","y = (1/2)x + 4","y = 2x + 2","y = -2x + 6"], answer:3, hint:"" },
      { id:"sat_42", topic:"Linear Functions & Slope", difficulty:"Hard", question:"If f(x) = ax + b, f(2) = 7, and f(5) = 16, what is a?", choices:["5","7","3","2"], answer:2, hint:"" },
      { id:"sat_43", topic:"Linear Functions & Slope", difficulty:"Hard", question:"A line passes through (-2, 5) and (4, -7). What is its y-intercept?", choices:["3","-1","-3","1"], answer:3, hint:"" },
      { id:"sat_44", topic:"Linear Functions & Slope", difficulty:"Hard", question:"The line 2x − 5y = 10 has what y-intercept?", choices:["-5","5","2","-2"], answer:3, hint:"" },
      { id:"sat_45", topic:"Linear Functions & Slope", difficulty:"Hard", question:"If a line has slope 3/4 and passes through (4, 1), what is y when x = 8?", choices:["7","4","2","3"], answer:1, hint:"" },
      { id:"sat_46", topic:"Linear Functions & Slope", difficulty:"Hard", question:"Lines y = kx + 2 and y = 4x − 1 are parallel. What is k?", choices:["-1","2","1/4","4"], answer:3, hint:"" },
      { id:"sat_47", topic:"Linear Functions & Slope", difficulty:"Hard", question:"If f is linear, f(1) = 3, and f(4) = 12, what is f(10)?", choices:["27","30","21","24"], answer:1, hint:"" },
      { id:"sat_48", topic:"Linear Functions & Slope", difficulty:"Hard", question:"A line passes through (3, -2) with slope -1/3. What is its x-intercept?", choices:["3","6","-2","-3"], answer:3, hint:"" },
      { id:"sat_49", topic:"Linear Functions & Slope", difficulty:"Hard", question:"The function f(x) = mx + b satisfies f(-1) = 8 and f(3) = -4. Find b.", choices:["11","-3","5","2"], answer:2, hint:"" },
      { id:"sat_50", topic:"Linear Functions & Slope", difficulty:"Hard", question:"Line P: y = 2x + 1. Line Q is perpendicular to P and passes through (4, 3). Where do they intersect?", choices:["(2, 5)","(0, 1)","(3, 7)","(1, 3)"], answer:3, hint:"" },
      { id:"sat_51", topic:"Systems of Equations", difficulty:"Easy", question:"If x + y = 10 and x − y = 4, what is x?", choices:["5","7","3","6"], answer:1, hint:"" },
      { id:"sat_52", topic:"Systems of Equations", difficulty:"Easy", question:"Solve: y = 2x and x + y = 9. What is x?", choices:["6","2","9","3"], answer:3, hint:"" },
      { id:"sat_53", topic:"Systems of Equations", difficulty:"Easy", question:"If 2x + y = 8 and y = 4, what is x?", choices:["6","12","4","2"], answer:3, hint:"" },
      { id:"sat_54", topic:"Systems of Equations", difficulty:"Easy", question:"If x = 3 and 2x + 3y = 18, what is y?", choices:["2","4","6","3"], answer:1, hint:"" },
      { id:"sat_55", topic:"Systems of Equations", difficulty:"Easy", question:"Solve: x + y = 7 and x = 2y + 1. What is y?", choices:["1","5","2","3"], answer:2, hint:"" },
      { id:"sat_56", topic:"Systems of Equations", difficulty:"Medium", question:"If 3x + 2y = 16 and x − 2y = 0, what is x?", choices:["2","6","8","4"], answer:3, hint:"" },
      { id:"sat_57", topic:"Systems of Equations", difficulty:"Medium", question:"Solve: 2x + 3y = 12 and 2x − y = 4. What is y?", choices:["3","4","1","2"], answer:3, hint:"" },
      { id:"sat_58", topic:"Systems of Equations", difficulty:"Medium", question:"If 4x + y = 14 and 2x + y = 8, what is x?", choices:["2","6","3","5"], answer:2, hint:"" },
      { id:"sat_59", topic:"Systems of Equations", difficulty:"Medium", question:"Solve: x + 2y = 11 and 3x − y = 5. What is x?", choices:["5","2","4","3"], answer:3, hint:"" },
      { id:"sat_60", topic:"Systems of Equations", difficulty:"Medium", question:"If 5x − 2y = 19 and x + 2y = 5, what is x?", choices:["3","4","5","1"], answer:1, hint:"" },
      { id:"sat_61", topic:"Systems of Equations", difficulty:"Medium", question:"The system 2x + 3y = 13 and 4x − y = 5 has solution (x, y). What is y?", choices:["4","1","3","2"], answer:2, hint:"" },
      { id:"sat_62", topic:"Systems of Equations", difficulty:"Medium", question:"If x − y = 2 and x + y = 14, what is xy?", choices:["32","16","24","48"], answer:3, hint:"" },
      { id:"sat_63", topic:"Systems of Equations", difficulty:"Medium", question:"Solve: 3x + y = 10 and y = x − 2. What is x?", choices:["4","3","5","2"], answer:1, hint:"" },
      { id:"sat_64", topic:"Systems of Equations", difficulty:"Medium", question:"If 6x + 2y = 20 and 3x + y = 10, how many solutions does the system have?", choices:["Zero","Infinitely many","One","Two"], answer:1, hint:"" },
      { id:"sat_65", topic:"Systems of Equations", difficulty:"Medium", question:"The system y = 2x + 1 and y = 2x − 3 has how many solutions?", choices:["Infinitely many","Two","Zero","One"], answer:2, hint:"" },
      { id:"sat_66", topic:"Systems of Equations", difficulty:"Hard", question:"If 3x + 4y = 10 and 6x + 8y = k has infinitely many solutions, what is k?", choices:["10","16","8","20"], answer:3, hint:"" },
      { id:"sat_67", topic:"Systems of Equations", difficulty:"Hard", question:"For what value of c does the system 2x + 3y = 7 and 4x + cy = 14 have infinitely many solutions?", choices:["7","6","2","3"], answer:1, hint:"" },
      { id:"sat_68", topic:"Systems of Equations", difficulty:"Hard", question:"If 5x + 2y = 11 and 3x − 2y = 5, what is x + y?", choices:["2","5","4","3"], answer:3, hint:"" },
      { id:"sat_69", topic:"Systems of Equations", difficulty:"Hard", question:"The system 4x − 3y = 5 and 2x + ky = 1 has no solution. What is k?", choices:["3/2","2/3","-3/2","-2/3"], answer:2, hint:"" },
      { id:"sat_70", topic:"Systems of Equations", difficulty:"Hard", question:"If x + y = 6 and x² − y² = 12, what is x − y?", choices:["6","4","2","3"], answer:2, hint:"" },
      { id:"sat_71", topic:"Systems of Equations", difficulty:"Hard", question:"Solve: (1/2)x + y = 4 and x − y = 2. What is x?", choices:["2","4","3","6"], answer:1, hint:"" },
      { id:"sat_72", topic:"Systems of Equations", difficulty:"Hard", question:"A system has solution (2, -1). If one equation is 3x + 2y = 4, and the other is ax − y = 7, what is a?", choices:["2","4","5","3"], answer:3, hint:"" },
      { id:"sat_73", topic:"Systems of Equations", difficulty:"Hard", question:"If 2x + 5y = 1 and 3x − 5y = 14, what is x?", choices:["5","-3","3","2"], answer:2, hint:"" },
      { id:"sat_74", topic:"Systems of Equations", difficulty:"Hard", question:"The lines 2x + 3y = 6 and 4x + 6y = 18 intersect in how many points?", choices:["Infinitely many","0","2","1"], answer:1, hint:"" },
      { id:"sat_75", topic:"Systems of Equations", difficulty:"Hard", question:"If x/2 + y/3 = 4 and x − y = 3, find x.", choices:["9","3","2","6"], answer:3, hint:"" },
      { id:"sat_76", topic:"Linear Inequalities", difficulty:"Easy", question:"Solve: x + 3 > 7", choices:["x > 10","x < 10","x < 4","x > 4"], answer:3, hint:"" },
      { id:"sat_77", topic:"Linear Inequalities", difficulty:"Easy", question:"Solve: 2x ≤ 10", choices:["x ≤ 20","x ≤ 5","x ≤ 8","x ≥ 5"], answer:1, hint:"" },
      { id:"sat_78", topic:"Linear Inequalities", difficulty:"Easy", question:"Solve: x − 5 < 2", choices:["x < -3","x < 7","x > 7","x < 3"], answer:1, hint:"" },
      { id:"sat_79", topic:"Linear Inequalities", difficulty:"Easy", question:"If -3x > 12, then:", choices:["x > -4","x > 4","x < -4","x < 4"], answer:2, hint:"" },
      { id:"sat_80", topic:"Linear Inequalities", difficulty:"Easy", question:"Solve: x/3 ≥ 4", choices:["x ≤ 12","x ≥ 1","x ≥ 12","x ≥ 7"], answer:2, hint:"" },
      { id:"sat_81", topic:"Linear Inequalities", difficulty:"Medium", question:"Solve: 2x + 5 > 13", choices:["x < 4","x > 3","x > 9","x > 4"], answer:3, hint:"" },
      { id:"sat_82", topic:"Linear Inequalities", difficulty:"Medium", question:"Solve: 4 − 2x ≤ 10", choices:["x ≥ 3","x ≤ 3","x ≥ -3","x ≤ -3"], answer:2, hint:"" },
      { id:"sat_83", topic:"Linear Inequalities", difficulty:"Medium", question:"Solve: 3(x − 1) < 12", choices:["x < 4","x < 13","x > 5","x < 5"], answer:3, hint:"" },
      { id:"sat_84", topic:"Linear Inequalities", difficulty:"Medium", question:"If 5x − 2 ≥ 3x + 8, then:", choices:["x ≥ 10","x ≤ 5","x ≥ 3","x ≥ 5"], answer:3, hint:"" },
      { id:"sat_85", topic:"Linear Inequalities", difficulty:"Medium", question:"Which value of x satisfies 2x + 1 > 9?", choices:["4","2","3","6"], answer:3, hint:"" },
      { id:"sat_86", topic:"Linear Inequalities", difficulty:"Medium", question:"Solve: -2(x + 3) ≥ -10", choices:["x ≥ -2","x ≤ 2","x ≥ 2","x ≤ -2"], answer:1, hint:"" },
      { id:"sat_87", topic:"Linear Inequalities", difficulty:"Medium", question:"Solve: (x + 4)/2 < 6", choices:["x < 2","x < 12","x > 8","x < 8"], answer:3, hint:"" },
      { id:"sat_88", topic:"Linear Inequalities", difficulty:"Medium", question:"If 7 − x ≤ 3, then:", choices:["x ≤ 10","x ≥ 4","x ≤ 4","x ≥ 10"], answer:1, hint:"" },
      { id:"sat_89", topic:"Linear Inequalities", difficulty:"Medium", question:"Solve the compound inequality: 1 < x + 3 < 7", choices:["4 < x < 10","-2 < x < 7","1 < x < 7","-2 < x < 4"], answer:3, hint:"" },
      { id:"sat_90", topic:"Linear Inequalities", difficulty:"Medium", question:"A number n satisfies 3n − 4 > 11. What is the smallest integer value of n?", choices:["5","4","6","7"], answer:2, hint:"" },
      { id:"sat_91", topic:"Linear Inequalities", difficulty:"Hard", question:"If 2(3x − 1) < 4x + 6, then:", choices:["x < 8","x < 2","x < 4","x > 4"], answer:2, hint:"" },
      { id:"sat_92", topic:"Linear Inequalities", difficulty:"Hard", question:"A taxi charges $3 plus $2 per mile. If a rider has at most $20, what is the max whole miles m?", choices:["9","8","7","10"], answer:1, hint:"" },
      { id:"sat_93", topic:"Linear Inequalities", difficulty:"Hard", question:"Solve: -4 ≤ 2x − 6 ≤ 8", choices:["1 ≤ x ≤ 14","-5 ≤ x ≤ 1","-1 ≤ x ≤ 7","1 ≤ x ≤ 7"], answer:3, hint:"" },
      { id:"sat_94", topic:"Linear Inequalities", difficulty:"Hard", question:"If 5 − 3x ≥ 2x − 15, what is the largest integer x?", choices:["3","6","4","5"], answer:2, hint:"" },
      { id:"sat_95", topic:"Linear Inequalities", difficulty:"Hard", question:"A student needs an average of at least 90 on 4 tests. With 88, 92, 85 so far, the minimum 4th score is:", choices:["93","90","88","95"], answer:3, hint:"" },
      { id:"sat_96", topic:"Linear Inequalities", difficulty:"Hard", question:"If (2x − 3)/5 ≤ 1, then:", choices:["x ≥ 4","x ≤ 4","x ≤ 1","x ≤ 5"], answer:1, hint:"" },
      { id:"sat_97", topic:"Linear Inequalities", difficulty:"Hard", question:"The inequality 3x + 2y ≤ 12 is satisfied by which point?", choices:["(4, 2)","(3, 3)","(2, 4)","(2, 1)"], answer:3, hint:"" },
      { id:"sat_98", topic:"Linear Inequalities", difficulty:"Hard", question:"If -2 < 3 − x < 5, what is the range of x?", choices:["-2 < x < 3","-2 < x < 5","-5 < x < 2","2 < x < 5"], answer:1, hint:"" },
      { id:"sat_99", topic:"Linear Inequalities", difficulty:"Hard", question:"A gym costs $25 to join plus $10/month. With a $95 budget, the most months m is:", choices:["9","7","8","6"], answer:1, hint:"" },
      { id:"sat_100", topic:"Linear Inequalities", difficulty:"Hard", question:"If 4x − 7 > 2x + 5 and x < 10, the integer solutions number how many?", choices:["5","3","4","2"], answer:1, hint:"" },
      { id:"sat_101", topic:"Absolute Value", difficulty:"Easy", question:"What is |−8|?", choices:["-8","0","16","8"], answer:3, hint:"" },
      { id:"sat_102", topic:"Absolute Value", difficulty:"Easy", question:"Solve: |x| = 5", choices:["x = 5","x = 5 or x = -5","x = -5","x = 0"], answer:1, hint:"" },
      { id:"sat_103", topic:"Absolute Value", difficulty:"Easy", question:"What is |3 − 9|?", choices:["3","6","12","-6"], answer:1, hint:"" },
      { id:"sat_104", topic:"Absolute Value", difficulty:"Easy", question:"If |x| = 0, what is x?", choices:["No solution","Any number","0","1"], answer:2, hint:"" },
      { id:"sat_105", topic:"Absolute Value", difficulty:"Easy", question:"Evaluate |−4| + |2|", choices:["8","-2","2","6"], answer:3, hint:"" },
      { id:"sat_106", topic:"Absolute Value", difficulty:"Medium", question:"Solve: |x − 3| = 7", choices:["x = -4 or x = 4","x = 10 or x = -4","x = 4","x = 10"], answer:1, hint:"" },
      { id:"sat_107", topic:"Absolute Value", difficulty:"Medium", question:"Solve: |2x| = 10", choices:["x = 10","x = 5 or x = -5","x = -10","x = 5"], answer:1, hint:"" },
      { id:"sat_108", topic:"Absolute Value", difficulty:"Medium", question:"Solve: |x + 1| = 6", choices:["x = 5","x = -5 or x = 7","x = 5 or x = 7","x = 5 or x = -7"], answer:3, hint:"" },
      { id:"sat_109", topic:"Absolute Value", difficulty:"Medium", question:"If |x − 2| = 0, what is x?", choices:["No solution","2","0","-2"], answer:1, hint:"" },
      { id:"sat_110", topic:"Absolute Value", difficulty:"Medium", question:"Solve: |3x − 6| = 9", choices:["x = 5","x = 5 or x = -1","x = 3 or x = -3","x = -1"], answer:1, hint:"" },
      { id:"sat_111", topic:"Absolute Value", difficulty:"Medium", question:"How many solutions does |x| = -4 have?", choices:["Infinite","Two","Zero","One"], answer:2, hint:"" },
      { id:"sat_112", topic:"Absolute Value", difficulty:"Medium", question:"Solve: |x/2| = 3", choices:["x = 1.5","x = 3","x = 6 or x = -6","x = 6"], answer:2, hint:"" },
      { id:"sat_113", topic:"Absolute Value", difficulty:"Medium", question:"Evaluate |−5 × 2|", choices:["-10","7","3","10"], answer:3, hint:"" },
      { id:"sat_114", topic:"Absolute Value", difficulty:"Medium", question:"If |x + 4| = 4, what are the solutions?", choices:["x = 0","x = 0 or x = -8","x = -8","x = 4 or x = -4"], answer:1, hint:"" },
      { id:"sat_115", topic:"Absolute Value", difficulty:"Medium", question:"Solve: 2|x| = 14", choices:["x = 7","x = 14","x = -14","x = 7 or x = -7"], answer:3, hint:"" },
      { id:"sat_116", topic:"Absolute Value", difficulty:"Hard", question:"Solve: |x − 5| < 3", choices:["-8 < x < 8","x > 2","x < 8","2 < x < 8"], answer:3, hint:"" },
      { id:"sat_117", topic:"Absolute Value", difficulty:"Hard", question:"Solve: |2x + 1| > 5", choices:["x > 2","-3 < x < 2","x < -3","x > 2 or x < -3"], answer:3, hint:"" },
      { id:"sat_118", topic:"Absolute Value", difficulty:"Hard", question:"If |x − 4| = |x − 10|, what is x?", choices:["8","5","7","6"], answer:2, hint:"" },
      { id:"sat_119", topic:"Absolute Value", difficulty:"Hard", question:"Solve: |3x − 2| ≤ 7", choices:["-3 ≤ x ≤ 3","x ≤ 3","-5/3 ≤ x ≤ 3","x ≥ -5/3"], answer:2, hint:"" },
      { id:"sat_120", topic:"Absolute Value", difficulty:"Hard", question:"The distance of x from 6 is 4. Which equation models this?", choices:["|6 − 4| = x","|x − 4| = 6","|x − 6| = 4","|x + 6| = 4"], answer:2, hint:"" },
      { id:"sat_121", topic:"Absolute Value", difficulty:"Hard", question:"Solve: |x + 3| + 2 = 9", choices:["x = 7 or x = -7","x = -10","x = 4","x = 4 or x = -10"], answer:3, hint:"" },
      { id:"sat_122", topic:"Absolute Value", difficulty:"Hard", question:"For how many integer values of x is |x| < 4 true?", choices:["8","9","4","7"], answer:3, hint:"" },
      { id:"sat_123", topic:"Absolute Value", difficulty:"Hard", question:"If |2x − 8| = 0, what is x?", choices:["-4","8","4","0"], answer:2, hint:"" },
      { id:"sat_124", topic:"Absolute Value", difficulty:"Hard", question:"Solve: |x − 1| ≥ 5", choices:["x ≤ -4","x ≥ 6","x ≥ 6 or x ≤ -4","-4 ≤ x ≤ 6"], answer:2, hint:"" },
      { id:"sat_125", topic:"Absolute Value", difficulty:"Hard", question:"The equation |x + 2| = 3x has how many valid solutions?", choices:["0","1","3","2"], answer:1, hint:"" },
      { id:"sat_126", topic:"Expressions & Exponents", difficulty:"Easy", question:"Simplify: 3x + 5x − 2x", choices:["x","6x","8x","10x"], answer:1, hint:"" },
      { id:"sat_127", topic:"Expressions & Exponents", difficulty:"Easy", question:"Expand: 2(x + 5)", choices:["2x + 7","2x + 10","x + 10","2x + 5"], answer:1, hint:"" },
      { id:"sat_128", topic:"Expressions & Exponents", difficulty:"Easy", question:"Simplify: x² · x³", choices:["x¹","x⁶","x⁵","2x⁵"], answer:2, hint:"" },
      { id:"sat_129", topic:"Expressions & Exponents", difficulty:"Easy", question:"Simplify: (4x²)(3x)", choices:["7x³","12x³","12x²","12x"], answer:1, hint:"" },
      { id:"sat_130", topic:"Expressions & Exponents", difficulty:"Easy", question:"Combine: (3x + 2) + (5x − 7)", choices:["8x − 9","8x − 5","8x + 5","2x − 5"], answer:1, hint:"" },
      { id:"sat_131", topic:"Expressions & Exponents", difficulty:"Medium", question:"Expand: (x + 3)(x + 4)", choices:["x² + 7x + 7","x² + 12","x² + 7x + 12","x² + 12x + 7"], answer:2, hint:"" },
      { id:"sat_132", topic:"Expressions & Exponents", difficulty:"Medium", question:"Simplify: (x⁵)/(x²)", choices:["x²·⁵","x³","x⁷","x¹⁰"], answer:1, hint:"" },
      { id:"sat_133", topic:"Expressions & Exponents", difficulty:"Medium", question:"Factor: x² − 9", choices:["(x − 3)²","(x + 3)²","(x + 3)(x − 3)","(x + 9)(x − 1)"], answer:2, hint:"" },
      { id:"sat_134", topic:"Expressions & Exponents", difficulty:"Medium", question:"Simplify: (2x³)²", choices:["4x⁹","4x⁵","2x⁶","4x⁶"], answer:3, hint:"" },
      { id:"sat_135", topic:"Expressions & Exponents", difficulty:"Medium", question:"Expand: (x − 5)²", choices:["x² − 25","x² − 10x + 25","x² + 25","x² − 10x − 25"], answer:1, hint:"" },
      { id:"sat_136", topic:"Expressions & Exponents", difficulty:"Medium", question:"Simplify: 3(2x − 1) − 2(x − 4)", choices:["4x + 11","4x − 5","4x + 5","8x + 5"], answer:2, hint:"" },
      { id:"sat_137", topic:"Expressions & Exponents", difficulty:"Medium", question:"Factor: 2x² + 6x", choices:["2x(x + 6)","x(2x + 6)","2x(x + 3)","2(x² + 3)"], answer:2, hint:"" },
      { id:"sat_138", topic:"Expressions & Exponents", difficulty:"Medium", question:"Simplify: x⁻²  (positive exponent form)", choices:["-2x","-x²","1/x²","x²"], answer:2, hint:"" },
      { id:"sat_139", topic:"Expressions & Exponents", difficulty:"Medium", question:"Evaluate: 2³ · 2²", choices:["16","8","32","64"], answer:2, hint:"" },
      { id:"sat_140", topic:"Expressions & Exponents", difficulty:"Medium", question:"Factor: x² + 5x + 6", choices:["(x + 1)(x + 6)","(x − 2)(x − 3)","(x + 6)(x − 1)","(x + 2)(x + 3)"], answer:3, hint:"" },
      { id:"sat_141", topic:"Expressions & Exponents", difficulty:"Hard", question:"Simplify: (x² − 4)/(x + 2)", choices:["x² − 2","x − 2","x + 2","x − 4"], answer:1, hint:"" },
      { id:"sat_142", topic:"Expressions & Exponents", difficulty:"Hard", question:"If x² + bx + 9 is a perfect square, what is b (positive)?", choices:["18","6","9","3"], answer:1, hint:"" },
      { id:"sat_143", topic:"Expressions & Exponents", difficulty:"Hard", question:"Simplify: (3x²y³)(2xy²)", choices:["5x³y⁵","6x²y⁶","6x³y⁵","6x³y⁶"], answer:2, hint:"" },
      { id:"sat_144", topic:"Expressions & Exponents", difficulty:"Hard", question:"Factor completely: x³ − x", choices:["(x − 1)(x + 1)","x(x − 1)(x + 1)","x(x² − 1)","x²(x − 1)"], answer:1, hint:"" },
      { id:"sat_145", topic:"Expressions & Exponents", difficulty:"Hard", question:"Simplify: (16x⁴)^(1/2)", choices:["4x⁴","16x²","8x²","4x²"], answer:3, hint:"" },
      { id:"sat_146", topic:"Expressions & Exponents", difficulty:"Hard", question:"If (x + a)(x + 3) = x² + 7x + 12, what is a?", choices:["7","4","12","3"], answer:1, hint:"" },
      { id:"sat_147", topic:"Expressions & Exponents", difficulty:"Hard", question:"Simplify: (x² + 6x + 9)/(x + 3)", choices:["x − 3","x + 6","x + 9","x + 3"], answer:3, hint:"" },
      { id:"sat_148", topic:"Expressions & Exponents", difficulty:"Hard", question:"Expand and simplify: (2x + 1)(2x − 1)", choices:["4x² − 4x − 1","4x² − 1","4x² + 1","2x² − 1"], answer:1, hint:"" },
      { id:"sat_149", topic:"Expressions & Exponents", difficulty:"Hard", question:"If 3^(x) = 81, what is x?", choices:["27","4","9","3"], answer:1, hint:"" },
      { id:"sat_150", topic:"Expressions & Exponents", difficulty:"Hard", question:"Simplify: (x³y⁻²)/(x⁻¹y) with positive exponents", choices:["x²/y³","x⁴/y","x²/y","x⁴/y³"], answer:3, hint:"" },
      { id:"sat_151", topic:"Word Problems & Modeling", difficulty:"Easy", question:"A gym charges $30 to join plus $15/month. What is the cost C for m months?", choices:["C = 45m","C = 30m + 15","C = 15m + 30","C = 15m − 30"], answer:2, hint:"" },
      { id:"sat_152", topic:"Word Problems & Modeling", difficulty:"Easy", question:"A taxi charges $4 plus $2 per mile. The cost for 5 miles is:", choices:["$30","$6","$10","$14"], answer:3, hint:"" },
      { id:"sat_153", topic:"Word Problems & Modeling", difficulty:"Easy", question:"Sara has $50 and saves $10 per week. After how many weeks will she have $120?", choices:["8","7","12","6"], answer:1, hint:"" },
      { id:"sat_154", topic:"Word Problems & Modeling", difficulty:"Easy", question:"A plant is 6 cm tall and grows 2 cm per week. Its height h after w weeks is:", choices:["h = 8w","h = 6w + 2","h = 2w − 6","h = 2w + 6"], answer:3, hint:"" },
      { id:"sat_155", topic:"Word Problems & Modeling", difficulty:"Easy", question:"Tickets cost $8 each. The total cost t for n tickets is:", choices:["t = n + 8","t = 8 + n","t = n/8","t = 8n"], answer:3, hint:"" },
      { id:"sat_156", topic:"Word Problems & Modeling", difficulty:"Medium", question:"A pool has 200 gallons and drains 5 gal/min. After how many minutes is it empty?", choices:["35","50","45","40"], answer:3, hint:"" },
      { id:"sat_157", topic:"Word Problems & Modeling", difficulty:"Medium", question:"A phone plan costs $20 plus $0.10 per text. The cost of 150 texts is:", choices:["$30","$35","$15","$170"], answer:1, hint:"" },
      { id:"sat_158", topic:"Word Problems & Modeling", difficulty:"Medium", question:"Two numbers sum to 24, and one is 3 times the other. The larger number is:", choices:["21","12","6","18"], answer:3, hint:"" },
      { id:"sat_159", topic:"Word Problems & Modeling", difficulty:"Medium", question:"A car travels at 60 mph. How far does it go in 2.5 hours?", choices:["62.5 miles","150 miles","180 miles","120 miles"], answer:1, hint:"" },
      { id:"sat_160", topic:"Word Problems & Modeling", difficulty:"Medium", question:"A worker earns $15/hr plus a $50 bonus. To earn $200, how many hours are needed?", choices:["15","8","10","12"], answer:2, hint:"" },
      { id:"sat_161", topic:"Word Problems & Modeling", difficulty:"Medium", question:"In the model C = 2.5m + 4, what does the 4 represent?", choices:["Cost per mile","Number of miles","Initial cost when m = 0","Total cost"], answer:2, hint:"" },
      { id:"sat_162", topic:"Word Problems & Modeling", difficulty:"Medium", question:"A store sells pens at $2 and notebooks at $5. If 3 pens and n notebooks cost $26, find n.", choices:["5","6","3","4"], answer:3, hint:"" },
      { id:"sat_163", topic:"Word Problems & Modeling", difficulty:"Medium", question:"A candle burns down 0.5 inches per hour from 12 inches. After h hours its height is:", choices:["0.5h","12 + 0.5h","12 − 0.5h","0.5h − 12"], answer:2, hint:"" },
      { id:"sat_164", topic:"Word Problems & Modeling", difficulty:"Medium", question:"A baker uses 3 eggs per cake. With 27 eggs, how many cakes can be made?", choices:["6","8","10","9"], answer:3, hint:"" },
      { id:"sat_165", topic:"Word Problems & Modeling", difficulty:"Medium", question:"A membership is $100/year. The cost over y years (no change) is:", choices:["100/y","100y","y/100","100 + y"], answer:1, hint:"" },
      { id:"sat_166", topic:"Word Problems & Modeling", difficulty:"Hard", question:"A company's profit is P = 40x − 600, where x is units sold. How many units to break even (P = 0)?", choices:["10","15","25","20"], answer:1, hint:"" },
      { id:"sat_167", topic:"Word Problems & Modeling", difficulty:"Hard", question:"Train A leaves at 50 mph, Train B at 70 mph in the same direction 2 hours later. Hours for B to catch A:", choices:["6","5","3","4"], answer:1, hint:"" },
      { id:"sat_168", topic:"Word Problems & Modeling", difficulty:"Hard", question:"A rectangle's length is 4 more than twice its width. If perimeter is 38, the width is:", choices:["6","5","4","7"], answer:1, hint:"" },
      { id:"sat_169", topic:"Word Problems & Modeling", difficulty:"Hard", question:"Adult tickets are $12, child $7. 50 tickets sold for $480 total. Number of adult tickets:", choices:["20","30","24","26"], answer:3, hint:"" },
      { id:"sat_170", topic:"Word Problems & Modeling", difficulty:"Hard", question:"A solution is 30% salt. How many liters of pure water added to 6 L makes it 20% salt?", choices:["4","2","1","3"], answer:3, hint:"" },
      { id:"sat_171", topic:"Word Problems & Modeling", difficulty:"Hard", question:"Two cars start 300 miles apart heading toward each other at 60 and 40 mph. They meet after:", choices:["2 hours","3 hours","5 hours","4 hours"], answer:1, hint:"" },
      { id:"sat_172", topic:"Word Problems & Modeling", difficulty:"Hard", question:"A printer costs $80 plus $0.04 per page. The cost equation for p pages is C = 0.04p + 80. Cost for 500 pages:", choices:["$84","$580","$120","$100"], answer:3, hint:"" },
      { id:"sat_173", topic:"Word Problems & Modeling", difficulty:"Hard", question:"The sum of three consecutive even integers is 78. The largest is:", choices:["26","30","24","28"], answer:3, hint:"" },
      { id:"sat_174", topic:"Word Problems & Modeling", difficulty:"Hard", question:"A 15% tip on a meal is $9. What was the meal cost?", choices:["$135","$54","$60","$45"], answer:2, hint:"" },
      { id:"sat_175", topic:"Word Problems & Modeling", difficulty:"Hard", question:"A plumber charges a $45 fee plus $hr. A 3-hour job cost $165. The hourly rate is:", choices:["$35","$45","$40","$55"], answer:2, hint:"" },
      { id:"sat_176", topic:"Interpreting Models & Graphs", difficulty:"Easy", question:"In y = 5x + 20, what does the slope 5 represent?", choices:["x-intercept","Maximum","Starting value","Rate of change"], answer:3, hint:"" },
      { id:"sat_177", topic:"Interpreting Models & Graphs", difficulty:"Easy", question:"In C = 8h + 25, what does 25 represent?", choices:["Total cost","Fixed starting cost","Total hours","Cost per hour"], answer:1, hint:"" },
      { id:"sat_178", topic:"Interpreting Models & Graphs", difficulty:"Easy", question:"A line crosses the y-axis at 3. What is its y-intercept?", choices:["Undefined","3","-3","0"], answer:1, hint:"" },
      { id:"sat_179", topic:"Interpreting Models & Graphs", difficulty:"Easy", question:"If a graph shows a line going down left to right, the slope is:", choices:["Undefined","Zero","Negative","Positive"], answer:2, hint:"" },
      { id:"sat_180", topic:"Interpreting Models & Graphs", difficulty:"Easy", question:"A horizontal line has what slope?", choices:["Negative","Undefined","0","1"], answer:2, hint:"" },
      { id:"sat_181", topic:"Interpreting Models & Graphs", difficulty:"Medium", question:"In V = 60 − 4t (gallons over time), what does -4 mean?", choices:["4 gallons total","Draining 4 gal per unit time","Starting with 4 gal","Filling 4 gal"], answer:1, hint:"" },
      { id:"sat_182", topic:"Interpreting Models & Graphs", difficulty:"Medium", question:"A line passes through (0, 100) and (10, 0). What is its slope?", choices:["10","1","-1","-10"], answer:3, hint:"" },
      { id:"sat_183", topic:"Interpreting Models & Graphs", difficulty:"Medium", question:"In P = 25n − 300, the n-value where P = 0 represents:", choices:["Maximum profit","Starting profit","Break-even point","Loss per unit"], answer:2, hint:"" },
      { id:"sat_184", topic:"Interpreting Models & Graphs", difficulty:"Medium", question:"If f(x) = 2x + 7 models a savings account, f(0) = 7 represents:", choices:["Total saved","Weekly deposit","Initial amount","Interest rate"], answer:2, hint:"" },
      { id:"sat_185", topic:"Interpreting Models & Graphs", difficulty:"Medium", question:"A graph's line is steeper than y = 2x. Its slope could be:", choices:["-1","3","1","0"], answer:1, hint:"" },
      { id:"sat_186", topic:"Interpreting Models & Graphs", difficulty:"Medium", question:"In the equation d = 55t, what are the units of 55 if d is miles and t is hours?", choices:["miles","hours","miles per hour","hours per mile"], answer:2, hint:"" },
      { id:"sat_187", topic:"Interpreting Models & Graphs", difficulty:"Medium", question:"Two lines with the same slope but different y-intercepts are:", choices:["The same line","Intersecting once","Parallel","Perpendicular"], answer:2, hint:"" },
      { id:"sat_188", topic:"Interpreting Models & Graphs", difficulty:"Medium", question:"If the slope of a cost model increases, the cost per unit:", choices:["Becomes zero","Stays the same","Decreases","Increases"], answer:3, hint:"" },
      { id:"sat_189", topic:"Interpreting Models & Graphs", difficulty:"Medium", question:"A line passes through (2, 5) and (2, 9). What is its slope?", choices:["2","4","Undefined","0"], answer:2, hint:"" },
      { id:"sat_190", topic:"Interpreting Models & Graphs", difficulty:"Medium", question:"In y = -3x + 12, the x-intercept occurs at x =", choices:["-4","4","3","12"], answer:1, hint:"" },
      { id:"sat_191", topic:"Interpreting Models & Graphs", difficulty:"Hard", question:"A population model is P = 500 + 25t. In how many years will the population reach 750?", choices:["8","10","15","12"], answer:1, hint:"" },
      { id:"sat_192", topic:"Interpreting Models & Graphs", difficulty:"Hard", question:"The model C = 0.5m + 30 represents phone cost. If a bill was $55, how many minutes m?", choices:["60","45","25","50"], answer:3, hint:"" },
      { id:"sat_193", topic:"Interpreting Models & Graphs", difficulty:"Hard", question:"A line has positive slope and negative y-intercept. Which point must it pass through eventually?", choices:["Only Quadrant II","Only Quadrant III","The origin","A point in Quadrant I"], answer:3, hint:"" },
      { id:"sat_194", topic:"Interpreting Models & Graphs", difficulty:"Hard", question:"If a graph shows revenue R = 12u and cost C = 8u + 40, the break-even u is:", choices:["8","12","10","5"], answer:2, hint:"" },
      { id:"sat_195", topic:"Interpreting Models & Graphs", difficulty:"Hard", question:"In f(t) = 80 − 16t describing height, the value 80 represents:", choices:["Final height","Initial height","Rate of fall","Time to land"], answer:1, hint:"" },
      { id:"sat_196", topic:"Interpreting Models & Graphs", difficulty:"Hard", question:"Two quantities increase together at a constant ratio. Their graph is:", choices:["A horizontal line","A curve","A straight line through origin","A parabola"], answer:2, hint:"" },
      { id:"sat_197", topic:"Interpreting Models & Graphs", difficulty:"Hard", question:"If the y-values increase by 6 each time x increases by 2, the slope is:", choices:["6","2","3","12"], answer:2, hint:"" },
      { id:"sat_198", topic:"Interpreting Models & Graphs", difficulty:"Hard", question:"The line y = ax + b has a steeper negative slope than y = -2x. Value of a could be:", choices:["-1","0","-3","2"], answer:2, hint:"" },
      { id:"sat_199", topic:"Interpreting Models & Graphs", difficulty:"Hard", question:"A model A = 1200 − 50w tracks account balance over weeks. The account empties at w =", choices:["25","30","20","24"], answer:3, hint:"" },
      { id:"sat_200", topic:"Interpreting Models & Graphs", difficulty:"Hard", question:"If doubling x always doubles y and y = 0 when x = 0, the relationship is:", choices:["Inversely proportional","Directly proportional","Quadratic","Constant"], answer:1, hint:"" },
      { id:"sat_201", topic:"Functions & Formulas", difficulty:"Easy", question:"If f(x) = 2x + 5, what is f(3)?", choices:["8","10","11","13"], answer:2, hint:"" },
      { id:"sat_202", topic:"Functions & Formulas", difficulty:"Easy", question:"If g(x) = x² − 1, what is g(4)?", choices:["7","15","8","16"], answer:1, hint:"" },
      { id:"sat_203", topic:"Functions & Formulas", difficulty:"Easy", question:"If f(x) = 7 − x, what is f(2)?", choices:["-5","9","2","5"], answer:3, hint:"" },
      { id:"sat_204", topic:"Functions & Formulas", difficulty:"Easy", question:"If h(x) = 3x, what is h(0)?", choices:["3","0","1","-3"], answer:1, hint:"" },
      { id:"sat_205", topic:"Functions & Formulas", difficulty:"Medium", question:"If f(x) = 4x − 1 and f(a) = 11, what is a?", choices:["12","2","3","4"], answer:2, hint:"" },
      { id:"sat_206", topic:"Functions & Formulas", difficulty:"Medium", question:"If f(x) = x² + 2x, what is f(-3)?", choices:["-3","15","-15","3"], answer:3, hint:"" },
      { id:"sat_207", topic:"Functions & Formulas", difficulty:"Medium", question:"If f(x) = 2x + 1, what is f(x + 1)?", choices:["x + 2","2x + 3","2x + 2","2x + 1"], answer:1, hint:"" },
      { id:"sat_208", topic:"Functions & Formulas", difficulty:"Medium", question:"If g(x) = 5x − 2, what is g(2) − g(1)?", choices:["8","5","2","3"], answer:1, hint:"" },
      { id:"sat_209", topic:"Functions & Formulas", difficulty:"Medium", question:"If f(x) = x/2 + 4 and f(k) = 10, what is k?", choices:["3","14","12","6"], answer:2, hint:"" },
      { id:"sat_210", topic:"Functions & Formulas", difficulty:"Hard", question:"If f(x) = 3x − 4, what is f(f(2))?", choices:["8","2","-1","6"], answer:1, hint:"" },
      { id:"sat_211", topic:"Functions & Formulas", difficulty:"Hard", question:"If f(x) = ax + b, f(0) = 3, and f(2) = 11, what is f(5)?", choices:["20","23","26","18"], answer:1, hint:"" },
      { id:"sat_212", topic:"Functions & Formulas", difficulty:"Hard", question:"If f(2x) = 6x + 1, what is f(x)?", choices:["3x + 2","2x + 1","6x + 1","3x + 1"], answer:3, hint:"" },
      { id:"sat_213", topic:"Functions & Formulas", difficulty:"Hard", question:"The function f satisfies f(x+1) = f(x) + 3 and f(0) = 2. What is f(3)?", choices:["8","11","6","9"], answer:1, hint:"" },
      { id:"sat_214", topic:"Functions & Formulas", difficulty:"Easy", question:"Solve for y: 2x + y = 10", choices:["y = 10 + 2x","y = 2x − 10","y = 5 − x","y = 10 − 2x"], answer:3, hint:"" },
      { id:"sat_215", topic:"Functions & Formulas", difficulty:"Easy", question:"Solve for x: y = x − 4", choices:["x = 4y","x = y − 4","x = 4 − y","x = y + 4"], answer:3, hint:"" },
      { id:"sat_216", topic:"Functions & Formulas", difficulty:"Medium", question:"Solve for r in C = 2πr", choices:["r = 2π/C","r = C/(2π)","r = 2πC","r = C − 2π"], answer:1, hint:"" },
      { id:"sat_217", topic:"Functions & Formulas", difficulty:"Medium", question:"The area of a triangle is A = (1/2)bh. Solve for h.", choices:["h = A/(2b)","h = b/(2A)","h = 2Ab","h = 2A/b"], answer:3, hint:"" },
      { id:"sat_218", topic:"Functions & Formulas", difficulty:"Medium", question:"Solve for x: ax + b = c", choices:["x = a(c − b)","x = c/a − b","x = (c − b)/a","x = (c + b)/a"], answer:2, hint:"" },
      { id:"sat_219", topic:"Functions & Formulas", difficulty:"Medium", question:"Solve for F in C = (5/9)(F − 32)", choices:["F = (9/5)C − 32","F = (5/9)(C+32)","F = (9/5)C + 32","F = (5/9)C + 32"], answer:2, hint:"" },
      { id:"sat_220", topic:"Functions & Formulas", difficulty:"Medium", question:"Solve for t: d = rt", choices:["t = dr","t = d/r","t = r/d","t = d − r"], answer:1, hint:"" },
      { id:"sat_221", topic:"Functions & Formulas", difficulty:"Hard", question:"Solve for x: (x − a)/b = c", choices:["x = ab + c","x = bc + a","x = (c − a)/b","x = bc − a"], answer:1, hint:"" },
      { id:"sat_222", topic:"Functions & Formulas", difficulty:"Hard", question:"The perimeter of a rectangle is P = 2l + 2w. Solve for w.", choices:["w = (P − 2l)/2","w = P − 2l","Both A and B","w = P/2 − l"], answer:2, hint:"" },
      { id:"sat_223", topic:"Functions & Formulas", difficulty:"Hard", question:"Solve for n: S = n(n+1)/2 ... which expression equals 2S?", choices:["2n + 1","n + 1","n² − n","n² + n"], answer:3, hint:"" },
      { id:"sat_224", topic:"Functions & Formulas", difficulty:"Hard", question:"If v = u + at, solve for a.", choices:["a = (v + u)/t","a = (v − u)/t","a = t(v − u)","a = v/t − u"], answer:1, hint:"" },
      { id:"sat_225", topic:"Functions & Formulas", difficulty:"Hard", question:"The formula for simple interest is I = Prt. Solve for r.", choices:["r = Pt/I","r = I/(Pt)","r = I/(P + t)","r = IPt"], answer:1, hint:"" },
      { id:"sat_226", topic:"Exponential & Percent Growth", difficulty:"Easy", question:"A population doubles each year starting at 100. After 1 year, it is:", choices:["100","102","200","150"], answer:2, hint:"" },
      { id:"sat_227", topic:"Exponential & Percent Growth", difficulty:"Easy", question:"In y = 3(2)^x, what is y when x = 0?", choices:["2","0","6","3"], answer:3, hint:"" },
      { id:"sat_228", topic:"Exponential & Percent Growth", difficulty:"Easy", question:"A model y = 500(1.05)^x represents growth. The growth rate per period is:", choices:["105%","5%","50%","1.05%"], answer:1, hint:"" },
      { id:"sat_229", topic:"Exponential & Percent Growth", difficulty:"Easy", question:"In y = 200(0.9)^x, the quantity is:", choices:["Constant","Decaying by 90%","Growing by 90%","Decaying by 10% each period"], answer:3, hint:"" },
      { id:"sat_230", topic:"Exponential & Percent Growth", difficulty:"Medium", question:"A bacteria count triples every hour from 50. After 2 hours it is:", choices:["300","150","450","100"], answer:2, hint:"" },
      { id:"sat_231", topic:"Exponential & Percent Growth", difficulty:"Medium", question:"In y = a(b)^x with b = 1.2, the percent increase each step is:", choices:["120%","12%","20%","2%"], answer:2, hint:"" },
      { id:"sat_232", topic:"Exponential & Percent Growth", difficulty:"Medium", question:"A $1,000 investment grows 10% per year. After 1 year (no withdrawals) it is:", choices:["$1,010","$1,000","$1,100.10","$1,100"], answer:3, hint:"" },
      { id:"sat_233", topic:"Exponential & Percent Growth", difficulty:"Medium", question:"A car worth $20,000 loses 15% of its value yearly. Which models its value after x years?", choices:["20000(0.15)^x","20000 − 15x","20000(1.15)^x","20000(0.85)^x"], answer:3, hint:"" },
      { id:"sat_234", topic:"Exponential & Percent Growth", difficulty:"Medium", question:"Which equation shows exponential decay?", choices:["y = 100 − 5x","y = 100(2)^x","y = 100(0.5)^x","y = 5x + 100"], answer:2, hint:"" },
      { id:"sat_235", topic:"Exponential & Percent Growth", difficulty:"Medium", question:"In y = 80(1.5)^x, the initial value (x = 0) is:", choices:["0","80","120","1.5"], answer:1, hint:"" },
      { id:"sat_236", topic:"Exponential & Percent Growth", difficulty:"Hard", question:"A sample of 400 decays to half every 3 hours. After 6 hours, how much remains?", choices:["200","150","50","100"], answer:3, hint:"" },
      { id:"sat_237", topic:"Exponential & Percent Growth", difficulty:"Hard", question:"A town of 5,000 grows 4% per year. Which models the population after t years?", choices:["5000 + 4t","5000(0.04)^t","5000(1.04)^t","5000(1.4)^t"], answer:2, hint:"" },
      { id:"sat_238", topic:"Exponential & Percent Growth", difficulty:"Hard", question:"If a quantity is multiplied by 1.08 each year, the annual growth rate is:", choices:["1.08%","80%","8%","108%"], answer:2, hint:"" },
      { id:"sat_239", topic:"Exponential & Percent Growth", difficulty:"Hard", question:"A value follows y = 250(0.8)^x. By what percent does it decrease each step?", choices:["80%","25%","20%","8%"], answer:2, hint:"" },
      { id:"sat_240", topic:"Exponential & Percent Growth", difficulty:"Easy", question:"What is 25% of 80?", choices:["15","40","25","20"], answer:3, hint:"" },
      { id:"sat_241", topic:"Exponential & Percent Growth", difficulty:"Easy", question:"15 is what percent of 60?", choices:["45%","15%","25%","30%"], answer:2, hint:"" },
      { id:"sat_242", topic:"Exponential & Percent Growth", difficulty:"Medium", question:"A $50 item is discounted 20%. What is the sale price?", choices:["$45","$30","$40","$10"], answer:2, hint:"" },
      { id:"sat_243", topic:"Exponential & Percent Growth", difficulty:"Medium", question:"A price rises from $80 to $100. What is the percent increase?", choices:["80%","25%","125%","20%"], answer:1, hint:"" },
      { id:"sat_244", topic:"Exponential & Percent Growth", difficulty:"Medium", question:"After a 10% raise, a salary is $44,000. What was the original?", choices:["$39,600","$40,000","$48,400","$43,560"], answer:1, hint:"" },
      { id:"sat_245", topic:"Exponential & Percent Growth", difficulty:"Hard", question:"A shirt costs $36 after a 25% discount. What was the original price?", choices:["$45","$27","$48","$60"], answer:2, hint:"" },
      { id:"sat_246", topic:"Exponential & Percent Growth", difficulty:"Hard", question:"A population increased 20%, then decreased 20%. Compared to the start, it is now:", choices:["4% higher","20% lower","The same","4% lower"], answer:3, hint:"" },
      { id:"sat_247", topic:"Exponential & Percent Growth", difficulty:"Easy", question:"If 3 pencils cost $1.50, what is the cost of 1 pencil?", choices:["$1.00","$0.75","$0.45","$0.50"], answer:3, hint:"" },
      { id:"sat_248", topic:"Exponential & Percent Growth", difficulty:"Medium", question:"A car travels 150 miles in 3 hours. What is its rate?", choices:["45 mph","60 mph","50 mph","30 mph"], answer:2, hint:"" },
      { id:"sat_249", topic:"Exponential & Percent Growth", difficulty:"Medium", question:"The ratio of boys to girls is 3:5. If there are 24 students, how many are girls?", choices:["12","18","9","15"], answer:3, hint:"" },
      { id:"sat_250", topic:"Exponential & Percent Growth", difficulty:"Hard", question:"A recipe uses a 2:3 ratio of sugar to flour. With 12 cups of flour, how much sugar?", choices:["18 cups","10 cups","8 cups","6 cups"], answer:2, hint:"" },
      { id:"sat_251", topic:"Quadratics", difficulty:"Easy", question:"Solve: x² − 9 = 0", choices:["x = 3","x = 9","x = -9","x = 3 or x = -3"], answer:3, hint:"" },
      { id:"sat_252", topic:"Quadratics", difficulty:"Easy", question:"Solve: x² − 5x + 6 = 0", choices:["x = 5","x = 1 or x = 6","x = 2 or x = 3","x = -2 or x = -3"], answer:2, hint:"" },
      { id:"sat_253", topic:"Quadratics", difficulty:"Easy", question:"Solve: x² + 7x = 0", choices:["x = 7","x = -7","x = 0 or x = 7","x = 0 or x = -7"], answer:3, hint:"" },
      { id:"sat_254", topic:"Quadratics", difficulty:"Medium", question:"Solve: x² − 4x − 12 = 0", choices:["x = -6 or x = 2","x = 4 or x = 3","x = 6 or x = -2","x = 12"], answer:2, hint:"" },
      { id:"sat_255", topic:"Quadratics", difficulty:"Medium", question:"Solve: 2x² − 8 = 0", choices:["x = 4","x = 2","x = -4 or x = 4","x = 2 or x = -2"], answer:3, hint:"" },
      { id:"sat_256", topic:"Quadratics", difficulty:"Medium", question:"If (x − 3)(x + 5) = 0, what are the solutions?", choices:["x = -3 or x = 5","x = 15","x = 3 or x = 5","x = 3 or x = -5"], answer:3, hint:"" },
      { id:"sat_257", topic:"Quadratics", difficulty:"Medium", question:"Solve using the quadratic formula: x² + 2x − 1 = 0", choices:["x = -2 ± √2","x = 1 ± √2","x = -1 ± √2","x = -1 ± 2√2"], answer:2, hint:"" },
      { id:"sat_258", topic:"Quadratics", difficulty:"Hard", question:"Solve: x² − 6x + 7 = 0", choices:["x = 3 ± √7","x = 6 ± √2","x = 3 ± √2","x = -3 ± √2"], answer:2, hint:"" },
      { id:"sat_259", topic:"Quadratics", difficulty:"Hard", question:"How many real solutions does x² + 4x + 5 = 0 have?", choices:["1","Infinitely many","0","2"], answer:2, hint:"" },
      { id:"sat_260", topic:"Quadratics", difficulty:"Hard", question:"For 2x² + 3x − 2 = 0, what is the sum of the solutions?", choices:["-1","3/2","2","-3/2"], answer:3, hint:"" },
      { id:"sat_261", topic:"Quadratics", difficulty:"Medium", question:"The discriminant of x² + 4x + 4 = 0 is:", choices:["-4","16","4","0"], answer:3, hint:"" },
      { id:"sat_262", topic:"Quadratics", difficulty:"Hard", question:"For what value of k does x² + kx + 9 = 0 have exactly one solution?", choices:["k = 0","k = 9","k = 6 or k = -6","k = 3"], answer:2, hint:"" },
      { id:"sat_263", topic:"Quadratics", difficulty:"Hard", question:"If b² − 4ac < 0 for a quadratic, the graph:", choices:["Touches x-axis once","Is a line","Crosses x-axis twice","Does not cross the x-axis"], answer:3, hint:"" },
      { id:"sat_264", topic:"Quadratics", difficulty:"Easy", question:"What is the vertex of y = (x − 2)² + 5?", choices:["(2, -5)","(2, 5)","(5, 2)","(-2, 5)"], answer:1, hint:"" },
      { id:"sat_265", topic:"Quadratics", difficulty:"Medium", question:"The parabola y = x² − 6x + 8 has axis of symmetry at:", choices:["x = 6","x = 8","x = -3","x = 3"], answer:3, hint:"" },
      { id:"sat_266", topic:"Quadratics", difficulty:"Medium", question:"What are the x-intercepts of y = x² − 4?", choices:["(4,0)","(0,-4)","(2,0) and (-2,0)","(0,4)"], answer:2, hint:"" },
      { id:"sat_267", topic:"Quadratics", difficulty:"Medium", question:"The minimum value of y = x² + 2x + 5 occurs at x =", choices:["5","-2","1","-1"], answer:3, hint:"" },
      { id:"sat_268", topic:"Quadratics", difficulty:"Hard", question:"A parabola y = -(x − 1)² + 9 has a maximum value of:", choices:["1","-9","10","9"], answer:3, hint:"" },
      { id:"sat_269", topic:"Quadratics", difficulty:"Hard", question:"The graph of y = a(x − h)² + k opens downward when:", choices:["a = 0","h < 0","a < 0","a > 0"], answer:2, hint:"" },
      { id:"sat_270", topic:"Quadratics", difficulty:"Medium", question:"In vertex form y = 2(x − 4)² − 3, the vertex is:", choices:["(4, 3)","(4, -3)","(-4, -3)","(2, -3)"], answer:1, hint:"" },
      { id:"sat_271", topic:"Quadratics", difficulty:"Hard", question:"Which is the factored form of x² − 7x + 12?", choices:["(x + 3)(x + 4)","(x − 12)(x − 1)","(x − 3)(x − 4)","(x − 2)(x − 6)"], answer:2, hint:"" },
      { id:"sat_272", topic:"Quadratics", difficulty:"Hard", question:"A ball's height is h = -16t² + 32t. At what time t does it return to the ground (h = 0, t > 0)?", choices:["32 seconds","16 seconds","1 second","2 seconds"], answer:3, hint:"" },
      { id:"sat_273", topic:"Quadratics", difficulty:"Hard", question:"The product of two consecutive integers is 56. What is the smaller positive one?", choices:["8","14","7","6"], answer:2, hint:"" },
      { id:"sat_274", topic:"Quadratics", difficulty:"Hard", question:"A rectangle's length is 3 more than its width. If area is 40, the width is:", choices:["6","8","5","4"], answer:2, hint:"" },
      { id:"sat_275", topic:"Quadratics", difficulty:"Medium", question:"If x² = 49, what are all real solutions?", choices:["x = 24.5","x = 7 or x = -7","x = -7","x = 7"], answer:1, hint:"" },
      { id:"sat_276", topic:"Quadratics", difficulty:"Hard", question:"If x² + bx + 16 = 0 has exactly one real solution and b > 0, what is b?", choices:["16","4","8","2"], answer:2, hint:"" },
      { id:"sat_277", topic:"Quadratics", difficulty:"Hard", question:"The equation 3x² − 12x + c = 0 has exactly one solution. What is c?", choices:["9","12","6","4"], answer:1, hint:"" },
      { id:"sat_278", topic:"Quadratics", difficulty:"Hard", question:"If the parabola y = x² + bx + 7 has its vertex on the y-axis, what is b?", choices:["1","-7","7","0"], answer:3, hint:"" },
      { id:"sat_279", topic:"Quadratics", difficulty:"Hard", question:"For what value of a does ax² + 8x + 2 = 0 have one real solution?", choices:["16","2","8","4"], answer:2, hint:"" },
      { id:"sat_280", topic:"Quadratics", difficulty:"Hard", question:"If r and s are roots of x² − 6x + 4 = 0, what is r + s?", choices:["2","6","4","-6"], answer:1, hint:"" },
      { id:"sat_281", topic:"Quadratics", difficulty:"Hard", question:"If r and s are the roots of 2x² + 5x − 3 = 0, what is rs?", choices:["3/2","5/2","-3/2","-5/2"], answer:2, hint:"" },
      { id:"sat_282", topic:"Quadratics", difficulty:"Hard", question:"The quadratic y = x² − 4x + k has a minimum value of 1. What is k?", choices:["1","4","5","3"], answer:2, hint:"" },
      { id:"sat_283", topic:"Quadratics", difficulty:"Hard", question:"A quadratic passes through (0, 0) and (4, 0) with vertex at (2, -4). Its equation is:", choices:["y = x² − 4","y = x² + 4x","y = (x)(x − 4)","y = (x − 2)²"], answer:2, hint:"" },
      { id:"sat_284", topic:"Quadratics", difficulty:"Hard", question:"If x² − kx + 9 = 0 has two equal roots, what are the possible values of k?", choices:["9 or -9","6 or -6","Only 6","3 or -3"], answer:1, hint:"" },
      { id:"sat_285", topic:"Quadratics", difficulty:"Hard", question:"The graph of y = a(x − 2)(x + 6) has its axis of symmetry at x =", choices:["4","-6","-2","2"], answer:2, hint:"" },
      { id:"sat_286", topic:"Quadratics", difficulty:"Hard", question:"If f(x) = x² + 3x − 10, for what values of x is f(x) = 0?", choices:["x = -2 or x = 5","x = 10 or x = -1","x = 3","x = 2 or x = -5"], answer:3, hint:"" },
      { id:"sat_287", topic:"Quadratics", difficulty:"Hard", question:"A ball is thrown: h = -16t² + 48t + 4. What is its maximum height?", choices:["48","40","36","52"], answer:1, hint:"" },
      { id:"sat_288", topic:"Quadratics", difficulty:"Hard", question:"If (x − 3) is a factor of x² + bx − 6, what is b?", choices:["3","1","-1","-3"], answer:2, hint:"" },
      { id:"sat_289", topic:"Quadratics", difficulty:"Hard", question:"The system y = x² and y = 2x + 3 intersects where x =", choices:["-3 or 1","3 only","2 or 1","3 or -1"], answer:3, hint:"" },
      { id:"sat_290", topic:"Quadratics", difficulty:"Hard", question:"If x² + y² = 25 and y = x + 1, how many real solutions (x, y) are there?", choices:["0","2","1","4"], answer:1, hint:"" },
      { id:"sat_291", topic:"Polynomials", difficulty:"Easy", question:"Add: (3x² + 2x) + (x² − 5x)", choices:["4x² − 7x","3x² − 3x","4x² − 3x","4x² + 3x"], answer:2, hint:"" },
      { id:"sat_292", topic:"Polynomials", difficulty:"Easy", question:"Multiply: (x + 2)(x + 3)", choices:["x² + 5x + 5","x² + 6","x² + 6x + 5","x² + 5x + 6"], answer:3, hint:"" },
      { id:"sat_293", topic:"Polynomials", difficulty:"Medium", question:"Subtract: (4x³ − 2x + 1) − (x³ + 3x − 2)", choices:["5x³ − 5x + 3","3x³ − 5x + 3","3x³ − 5x − 1","3x³ + x − 1"], answer:1, hint:"" },
      { id:"sat_294", topic:"Polynomials", difficulty:"Medium", question:"Multiply: (x − 4)(x² + 2x − 1)", choices:["x³ − 6x² + 4","x³ − 2x² − 9x + 4","x³ + 2x² − 9x + 4","x³ − 2x² + 9x − 4"], answer:1, hint:"" },
      { id:"sat_295", topic:"Polynomials", difficulty:"Medium", question:"Factor completely: x³ − 4x", choices:["(x − 2)(x + 2)","x(x − 2)(x + 2)","x(x² − 4)","x²(x − 4)"], answer:1, hint:"" },
      { id:"sat_296", topic:"Polynomials", difficulty:"Medium", question:"What are the zeros of f(x) = (x − 1)(x + 3)(x − 5)?", choices:["1, 3, 5","-1, -3, -5","-1, 3, -5","1, -3, 5"], answer:3, hint:"" },
      { id:"sat_297", topic:"Polynomials", difficulty:"Medium", question:"Factor: x³ + 2x² − 3x", choices:["x(x − 3)(x + 1)","x(x + 3)(x + 1)","(x + 3)(x − 1)","x(x + 3)(x − 1)"], answer:3, hint:"" },
      { id:"sat_298", topic:"Polynomials", difficulty:"Hard", question:"If f(x) = x³ − 2x² − 5x + 6 and f(1) = 0, which is a factor?", choices:["(x + 1)","(x + 6)","(x − 1)","(x − 2)"], answer:2, hint:"" },
      { id:"sat_299", topic:"Polynomials", difficulty:"Hard", question:"A polynomial of degree 4 has at most how many real zeros?", choices:["3","4","8","5"], answer:1, hint:"" },
      { id:"sat_300", topic:"Polynomials", difficulty:"Hard", question:"The end behavior of f(x) = -2x³ + x is: as x → +∞, f(x) →", choices:["2","-∞","0","+∞"], answer:1, hint:"" },
      { id:"sat_301", topic:"Polynomials", difficulty:"Hard", question:"If (x + 2) is a factor of x³ + kx² − x + 6, what is k?", choices:["3","-2","2","-3"], answer:1, hint:"" },
      { id:"sat_302", topic:"Polynomials", difficulty:"Hard", question:"How many turning points can a degree-3 polynomial have at most?", choices:["3","1","2","4"], answer:2, hint:"" },
      { id:"sat_303", topic:"Polynomials", difficulty:"Hard", question:"If f(x) = x³ − 7x + 6, and x = 1 is a root, the other roots are:", choices:["-1 and -6","1 and 6","-2 and 3","2 and -3"], answer:3, hint:"" },
      { id:"sat_304", topic:"Polynomials", difficulty:"Medium", question:"The degree of (2x² + 1)(3x³ − x) is:", choices:["3","6","5","2"], answer:2, hint:"" },
      { id:"sat_305", topic:"Polynomials", difficulty:"Hard", question:"If a polynomial has roots 0, 2, and -2, which could it be?", choices:["x² − 4","x³ + 4x","x³ − 4","x³ − 4x"], answer:3, hint:"" },
      { id:"sat_306", topic:"Polynomials", difficulty:"Medium", question:"Expand: (x + 1)³", choices:["x³ + 3x + 1","x³ + x² + x + 1","x³ + 3x² + 3x + 1","x³ + 1"], answer:2, hint:"" },
      { id:"sat_307", topic:"Polynomials", difficulty:"Hard", question:"The remainder when x³ + 2x − 3 is divided by (x − 1) is:", choices:["-3","1","0","3"], answer:2, hint:"" },
      { id:"sat_308", topic:"Polynomials", difficulty:"Medium", question:"Factor: 4x² − 25", choices:["(4x − 5)(x + 5)","(2x − 5)(2x + 5)","(2x − 5)²","(2x + 5)²"], answer:1, hint:"" },
      { id:"sat_309", topic:"Polynomials", difficulty:"Hard", question:"If f(x) = (x − a)²(x + b), the graph touches (not crosses) the x-axis at:", choices:["x = -a","x = -b","x = a","x = b"], answer:2, hint:"" },
      { id:"sat_310", topic:"Polynomials", difficulty:"Medium", question:"Which is a difference of cubes factorization of x³ − 8?", choices:["(x − 2)³","(x − 2)(x² − 2x + 4)","(x − 2)(x² + 2x + 4)","(x − 2)(x + 2)(x + 2)"], answer:2, hint:"" },
      { id:"sat_311", topic:"Polynomials", difficulty:"Hard", question:"A cubic with positive leading coefficient and 3 distinct real roots crosses the x-axis how many times?", choices:["2","0","3","1"], answer:2, hint:"" },
      { id:"sat_312", topic:"Polynomials", difficulty:"Hard", question:"If x² − 5x + 6 divides evenly, its factors give roots that sum to:", choices:["-5","1","5","6"], answer:2, hint:"" },
      { id:"sat_313", topic:"Rational Expressions & Equations", difficulty:"Easy", question:"Simplify: (x² − 9)/(x − 3)", choices:["x²","x + 3","x − 3","x + 9"], answer:1, hint:"" },
      { id:"sat_314", topic:"Rational Expressions & Equations", difficulty:"Easy", question:"For what value is (x + 1)/(x − 2) undefined?", choices:["x = 0","x = 1","x = 2","x = -1"], answer:2, hint:"" },
      { id:"sat_315", topic:"Rational Expressions & Equations", difficulty:"Medium", question:"Simplify: (x² − 4)/(x² + 4x + 4)", choices:["(x − 2)/(x − 2)","x − 2","(x + 2)/(x − 2)","(x − 2)/(x + 2)"], answer:3, hint:"" },
      { id:"sat_316", topic:"Rational Expressions & Equations", difficulty:"Medium", question:"Solve: 1/x = 1/4", choices:["x = -4","x = 0","x = 4","x = 1/4"], answer:2, hint:"" },
      { id:"sat_317", topic:"Rational Expressions & Equations", difficulty:"Medium", question:"Solve: 3/(x − 1) = 6", choices:["x = 3","x = 3/2","x = 2","x = 1/2"], answer:1, hint:"" },
      { id:"sat_318", topic:"Rational Expressions & Equations", difficulty:"Medium", question:"Add: 1/x + 2/x", choices:["2/x²","1/3x","3/2x","3/x"], answer:3, hint:"" },
      { id:"sat_319", topic:"Rational Expressions & Equations", difficulty:"Medium", question:"Simplify: (2x)/(x² − x) ", choices:["2/(x + 1)","2","2/(x − 1)","2x/(x − 1)"], answer:2, hint:"" },
      { id:"sat_320", topic:"Rational Expressions & Equations", difficulty:"Hard", question:"Solve: (x)/(x − 2) = 3", choices:["x = 6","x = -3","x = 2","x = 3"], answer:3, hint:"" },
      { id:"sat_321", topic:"Rational Expressions & Equations", difficulty:"Hard", question:"Solve: 1/(x − 1) + 1/(x + 1) = 2/(x² − 1) ... how many valid solutions?", choices:["2","0 (extraneous)","Infinitely many","1"], answer:1, hint:"" },
      { id:"sat_322", topic:"Rational Expressions & Equations", difficulty:"Hard", question:"What value of x makes (x² − 1)/(x + 1) = 0?", choices:["x = 0","x = 1 or x = -1","x = 1","x = -1"], answer:2, hint:"" },
      { id:"sat_323", topic:"Rational Expressions & Equations", difficulty:"Medium", question:"The vertical asymptote of f(x) = 1/(x − 5) is:", choices:["y = 0","y = 5","x = -5","x = 5"], answer:3, hint:"" },
      { id:"sat_324", topic:"Rational Expressions & Equations", difficulty:"Medium", question:"The horizontal asymptote of f(x) = 3/(x + 2) is:", choices:["x = -2","y = 3","y = 2","y = 0"], answer:3, hint:"" },
      { id:"sat_325", topic:"Rational Expressions & Equations", difficulty:"Hard", question:"Simplify: (1/x − 1/y) ÷ (1/(xy))", choices:["x − y","y − x","xy","1/(x − y)"], answer:1, hint:"" },
      { id:"sat_326", topic:"Rational Expressions & Equations", difficulty:"Hard", question:"Solve: 2/(x) + 3/(x) = 1", choices:["x = 2","x = 5","x = 1/5","x = 6"], answer:1, hint:"" },
      { id:"sat_327", topic:"Rational Expressions & Equations", difficulty:"Hard", question:"If (x + 3)/(x − 1) = 2, what is x?", choices:["2","5","-3","3"], answer:1, hint:"" },
      { id:"sat_328", topic:"Rational Expressions & Equations", difficulty:"Medium", question:"Simplify: (6x³)/(2x)", choices:["12x²","3x²","3x³","3x"], answer:1, hint:"" },
      { id:"sat_329", topic:"Rational Expressions & Equations", difficulty:"Hard", question:"For (x − 4)/(x² − 16), the expression simplifies to:", choices:["x + 4","1/(x − 4)","1/(x + 4)","(x − 4)"], answer:2, hint:"" },
      { id:"sat_330", topic:"Rational Expressions & Equations", difficulty:"Hard", question:"Solve: 5/(x + 2) = 5/(2x − 1)", choices:["x = -2","x = 1","x = 2","x = 3"], answer:3, hint:"" },
      { id:"sat_331", topic:"Radical & Exponential Equations", difficulty:"Easy", question:"Solve: √x = 5", choices:["x = √5","x = 5","x = 25","x = 10"], answer:2, hint:"" },
      { id:"sat_332", topic:"Radical & Exponential Equations", difficulty:"Easy", question:"Solve: √(x + 1) = 3", choices:["x = 9","x = 8","x = 4","x = 2"], answer:1, hint:"" },
      { id:"sat_333", topic:"Radical & Exponential Equations", difficulty:"Medium", question:"Solve: √(2x − 1) = 3", choices:["x = 2","x = 10","x = 5","x = 4"], answer:2, hint:"" },
      { id:"sat_334", topic:"Radical & Exponential Equations", difficulty:"Medium", question:"Solve: √(x) + 2 = 6", choices:["x = 8","x = 16","x = 4","x = 64"], answer:1, hint:"" },
      { id:"sat_335", topic:"Radical & Exponential Equations", difficulty:"Hard", question:"Solve: √(x + 6) = x ... what is the valid solution?", choices:["x = -2","No solution","x = 3","x = 3 or x = -2"], answer:2, hint:"" },
      { id:"sat_336", topic:"Radical & Exponential Equations", difficulty:"Hard", question:"Solve: √(3x + 4) = x ... valid solution?", choices:["No solution","x = 4 or x = -1","x = -1","x = 4"], answer:3, hint:"" },
      { id:"sat_337", topic:"Radical & Exponential Equations", difficulty:"Medium", question:"Solve: x^(1/2) = 7", choices:["x = 14","x = 3.5","x = 49","x = 7"], answer:2, hint:"" },
      { id:"sat_338", topic:"Radical & Exponential Equations", difficulty:"Hard", question:"Solve: x^(2/3) = 4", choices:["x = 16","x = 8","x = 2","x = 6"], answer:1, hint:"" },
      { id:"sat_339", topic:"Radical & Exponential Equations", difficulty:"Easy", question:"Solve: 2^x = 16", choices:["x = 2","x = 8","x = 4","x = 32"], answer:2, hint:"" },
      { id:"sat_340", topic:"Radical & Exponential Equations", difficulty:"Medium", question:"Solve: 3^x = 81", choices:["x = 9","x = 3","x = 4","x = 27"], answer:2, hint:"" },
      { id:"sat_341", topic:"Radical & Exponential Equations", difficulty:"Medium", question:"Solve: 2^(x+1) = 32", choices:["x = 16","x = 3","x = 4","x = 5"], answer:2, hint:"" },
      { id:"sat_342", topic:"Radical & Exponential Equations", difficulty:"Hard", question:"Solve: 5^(2x) = 125", choices:["x = 5","x = 2/3","x = 3/2","x = 3"], answer:2, hint:"" },
      { id:"sat_343", topic:"Radical & Exponential Equations", difficulty:"Hard", question:"If 4^x = 8, what is x?", choices:["1/2","2","3","3/2"], answer:3, hint:"" },
      { id:"sat_344", topic:"Radical & Exponential Equations", difficulty:"Hard", question:"Solve: 9^x = 27", choices:["1/3","3","2","3/2"], answer:3, hint:"" },
      { id:"sat_345", topic:"Radical & Exponential Equations", difficulty:"Hard", question:"Solve: √(x − 2) = √(2x − 7)", choices:["x = 2","x = 7","x = 5","x = 3"], answer:2, hint:"" },
      { id:"sat_346", topic:"Nonlinear Systems & Composition", difficulty:"Medium", question:"If f(x) = 2x and g(x) = x + 3, what is f(g(2))?", choices:["7","10","12","8"], answer:1, hint:"" },
      { id:"sat_347", topic:"Nonlinear Systems & Composition", difficulty:"Medium", question:"If f(x) = x² and g(x) = x − 1, what is f(g(3))?", choices:["9","8","2","4"], answer:3, hint:"" },
      { id:"sat_348", topic:"Nonlinear Systems & Composition", difficulty:"Medium", question:"If f(x) = x + 5 and g(x) = 2x, what is g(f(1))?", choices:["11","7","12","6"], answer:2, hint:"" },
      { id:"sat_349", topic:"Nonlinear Systems & Composition", difficulty:"Hard", question:"If f(x) = x² − 1 and g(x) = x + 2, what is f(g(x))?", choices:["x² + 1","x² + 4x + 3","x² + 4x − 1","x² + 3"], answer:1, hint:"" },
      { id:"sat_350", topic:"Nonlinear Systems & Composition", difficulty:"Hard", question:"If f(g(x)) = 2x + 7 and g(x) = x + 3, what is f(x)?", choices:["2x + 4","x + 4","2x + 7","2x + 1"], answer:3, hint:"" },
      { id:"sat_351", topic:"Nonlinear Systems & Composition", difficulty:"Medium", question:"The system y = x² and y = 4 intersects at how many points?", choices:["4","2","0","1"], answer:1, hint:"" },
      { id:"sat_352", topic:"Nonlinear Systems & Composition", difficulty:"Hard", question:"Solve the system: y = x² − 3 and y = 2x. What are the x-values?", choices:["3 only","2 or 1","3 or -1","-3 or 1"], answer:2, hint:"" },
      { id:"sat_353", topic:"Nonlinear Systems & Composition", difficulty:"Hard", question:"Where does y = x² + 1 intersect y = x + 3?", choices:["x = 2 only","x = 2 or x = -1","No intersection","x = -2 or x = 1"], answer:1, hint:"" },
      { id:"sat_354", topic:"Nonlinear Systems & Composition", difficulty:"Hard", question:"If f(x) = 3x − 1 and f(g(x)) = 6x + 2, what is g(x)?", choices:["6x + 3","2x − 1","2x + 3","2x + 1"], answer:3, hint:"" },
      { id:"sat_355", topic:"Nonlinear Systems & Composition", difficulty:"Hard", question:"The graphs y = x² and y = -x² + 8 intersect where x =", choices:["4 or -4","2 only","2 or -2","0"], answer:2, hint:"" },
      { id:"sat_356", topic:"Nonlinear Systems & Composition", difficulty:"Medium", question:"If f(x) = √x and g(x) = x + 9, what is f(g(7))?", choices:["5","4","7","16"], answer:1, hint:"" },
      { id:"sat_357", topic:"Nonlinear Systems & Composition", difficulty:"Hard", question:"If h(x) = f(g(x)), f(x) = x², g(x) = 2x − 1, then h(2) =", choices:["4","9","5","3"], answer:1, hint:"" },
      { id:"sat_358", topic:"Nonlinear Systems & Composition", difficulty:"Hard", question:"A line y = x + k is tangent to y = x² when the system has exactly one solution. For k such that x² − x − k = 0 has one root, k =", choices:["0","1/4","-1/4","1"], answer:2, hint:"" },
      { id:"sat_359", topic:"Nonlinear Systems & Composition", difficulty:"Hard", question:"If f(x) = 1/x and g(x) = x − 2, what is f(g(5))?", choices:["5","3","1/5","1/3"], answer:3, hint:"" },
      { id:"sat_360", topic:"Nonlinear Systems & Composition", difficulty:"Hard", question:"The circle x² + y² = 10 and line y = 3 intersect where x =", choices:["3 or -3","±√10","1 or -1","No solution"], answer:2, hint:"" },
      { id:"sat_361", topic:"Statistics & Data", difficulty:"Easy", question:"The mean of 4, 8, 10, and 6 is:", choices:["6","7","28","8"], answer:1, hint:"" },
      { id:"sat_362", topic:"Statistics & Data", difficulty:"Easy", question:"What is the median of 3, 7, 9, 12, 15?", choices:["10","9","12","7"], answer:1, hint:"" },
      { id:"sat_363", topic:"Statistics & Data", difficulty:"Easy", question:"What is the mode of 2, 4, 4, 5, 7, 4?", choices:["2","7","4","5"], answer:2, hint:"" },
      { id:"sat_364", topic:"Statistics & Data", difficulty:"Easy", question:"The range of 12, 5, 20, 8 is:", choices:["8","12","20","15"], answer:3, hint:"" },
      { id:"sat_365", topic:"Statistics & Data", difficulty:"Easy", question:"A bag has 3 red and 7 blue marbles. P(red) = ?", choices:["7/10","3/7","1/3","3/10"], answer:3, hint:"" },
      { id:"sat_366", topic:"Statistics & Data", difficulty:"Medium", question:"If the mean of 5 numbers is 20, what is their sum?", choices:["20","4","25","100"], answer:3, hint:"" },
      { id:"sat_367", topic:"Statistics & Data", difficulty:"Medium", question:"A class of 20 has a mean score of 80. If one student scoring 80 leaves, the new mean is:", choices:["76","80","79","81"], answer:1, hint:"" },
      { id:"sat_368", topic:"Statistics & Data", difficulty:"Medium", question:"Adding the value 100 to the data set {2, 4, 6} most affects the:", choices:["Median","Range stays same","Mode","Mean"], answer:3, hint:"" },
      { id:"sat_369", topic:"Statistics & Data", difficulty:"Medium", question:"In a survey, 60 of 240 people prefer tea. What percent prefer tea?", choices:["60%","40%","25%","15%"], answer:2, hint:"" },
      { id:"sat_370", topic:"Statistics & Data", difficulty:"Medium", question:"A scatterplot shows points rising left to right. The correlation is:", choices:["Negative","Undefined","Positive","Zero"], answer:2, hint:"" },
      { id:"sat_371", topic:"Statistics & Data", difficulty:"Medium", question:"If 8 oz of juice costs $2, what is the unit rate per ounce?", choices:["$0.40","$0.16","$4.00","$0.25"], answer:3, hint:"" },
      { id:"sat_372", topic:"Statistics & Data", difficulty:"Medium", question:"A recipe ratio of flour to sugar is 3:2. With 9 cups flour, how much sugar?", choices:["13.5 cups","6 cups","4 cups","5 cups"], answer:1, hint:"" },
      { id:"sat_373", topic:"Statistics & Data", difficulty:"Medium", question:"The median of 4, 6, 8, 10 (even count) is:", choices:["9","8","6","7"], answer:3, hint:"" },
      { id:"sat_374", topic:"Statistics & Data", difficulty:"Medium", question:"A map scale is 1 inch = 50 miles. 3.5 inches represents:", choices:["150 miles","175 miles","17.5 miles","200 miles"], answer:1, hint:"" },
      { id:"sat_375", topic:"Statistics & Data", difficulty:"Medium", question:"Convert 90 km/h to meters per second (approx).", choices:["9 m/s","2.5 m/s","25 m/s","90 m/s"], answer:2, hint:"" },
      { id:"sat_376", topic:"Statistics & Data", difficulty:"Hard", question:"Data set A: {10, 20, 30}. Data set B: {18, 20, 22}. Which has the larger standard deviation?", choices:["Equal","Cannot tell","B","A"], answer:3, hint:"" },
      { id:"sat_377", topic:"Statistics & Data", difficulty:"Hard", question:"The mean of 6 numbers is 15. Five of them sum to 70. What is the sixth?", choices:["20","15","5","10"], answer:2, hint:"" },
      { id:"sat_378", topic:"Statistics & Data", difficulty:"Hard", question:"A study surveys only gym members about exercise habits. The main flaw is:", choices:["No control group","Too large a sample","Margin of error too small","Biased (non-random) sample"], answer:3, hint:"" },
      { id:"sat_379", topic:"Statistics & Data", difficulty:"Hard", question:"A poll reports 52% support with a margin of error of ±4%. The true value is likely between:", choices:["50% and 54%","48% and 56%","44% and 60%","52% and 56%"], answer:1, hint:"" },
      { id:"sat_380", topic:"Statistics & Data", difficulty:"Hard", question:"If every value in a data set is increased by 5, the standard deviation:", choices:["Increases by 5","Doubles","Stays the same","Decreases"], answer:2, hint:"" },
      { id:"sat_381", topic:"Statistics & Data", difficulty:"Hard", question:"A box plot's median is closer to Q1 than Q3. The distribution is:", choices:["Skewed left","Skewed right","Symmetric","Uniform"], answer:1, hint:"" },
      { id:"sat_382", topic:"Statistics & Data", difficulty:"Hard", question:"To conclude a treatment CAUSES an effect, you need a:", choices:["Large survey","Observational study","Randomized controlled experiment","Convenience sample"], answer:2, hint:"" },
      { id:"sat_383", topic:"Statistics & Data", difficulty:"Hard", question:"Two values are added to {4, 4, 4} so the mean stays 4 but the range becomes 6. The values could be:", choices:["0 and 6","1 and 7","3 and 5","2 and 8"], answer:1, hint:"" },
      { id:"sat_384", topic:"Statistics & Data", difficulty:"Hard", question:"A line of best fit is y = 2x + 5. It predicts y for x = 10 as:", choices:["20","25","15","52"], answer:1, hint:"" },
      { id:"sat_385", topic:"Statistics & Data", difficulty:"Hard", question:"A bag has 5 red, 3 blue. Two drawn without replacement. P(both red)?", choices:["25/64","5/8","10/16","5/14"], answer:3, hint:"" },
      { id:"sat_386", topic:"Geometry & Trigonometry", difficulty:"Easy", question:"A rectangle has length 8 and width 3. What is its area?", choices:["22","16","24","11"], answer:2, hint:"" },
      { id:"sat_387", topic:"Geometry & Trigonometry", difficulty:"Easy", question:"The area of a circle with radius 5 is:", choices:["10π","5π","25π","50π"], answer:2, hint:"" },
      { id:"sat_388", topic:"Geometry & Trigonometry", difficulty:"Easy", question:"Two angles of a triangle are 50° and 60°. The third is:", choices:["60°","80°","90°","70°"], answer:3, hint:"" },
      { id:"sat_389", topic:"Geometry & Trigonometry", difficulty:"Easy", question:"The volume of a cube with side 4 is:", choices:["12","64","48","16"], answer:1, hint:"" },
      { id:"sat_390", topic:"Geometry & Trigonometry", difficulty:"Easy", question:"The circumference of a circle with diameter 10 is:", choices:["5π","100π","10π","20π"], answer:2, hint:"" },
      { id:"sat_391", topic:"Geometry & Trigonometry", difficulty:"Medium", question:"A right triangle has legs 6 and 8. The hypotenuse is:", choices:["14","10","12","48"], answer:1, hint:"" },
      { id:"sat_392", topic:"Geometry & Trigonometry", difficulty:"Medium", question:"An equilateral triangle has each angle equal to:", choices:["45°","180°","90°","60°"], answer:3, hint:"" },
      { id:"sat_393", topic:"Geometry & Trigonometry", difficulty:"Medium", question:"The area of a triangle with base 10 and height 6 is:", choices:["16","60","36","30"], answer:3, hint:"" },
      { id:"sat_394", topic:"Geometry & Trigonometry", difficulty:"Medium", question:"A cylinder has radius 3 and height 10. Its volume is:", choices:["30π","90π","60π","900π"], answer:1, hint:"" },
      { id:"sat_395", topic:"Geometry & Trigonometry", difficulty:"Medium", question:"In a right triangle, if sinθ = 3/5, then cosθ (first quadrant) is:", choices:["3/4","5/4","5/3","4/5"], answer:3, hint:"" },
      { id:"sat_396", topic:"Geometry & Trigonometry", difficulty:"Medium", question:"Two similar triangles have a scale factor 2. The ratio of their areas is:", choices:["1:2","8:1","2:1","4:1"], answer:3, hint:"" },
      { id:"sat_397", topic:"Geometry & Trigonometry", difficulty:"Medium", question:"The sum of interior angles of a pentagon is:", choices:["720°","540°","450°","360°"], answer:1, hint:"" },
      { id:"sat_398", topic:"Geometry & Trigonometry", difficulty:"Medium", question:"A 45-45-90 triangle has legs of length 5. Its hypotenuse is:", choices:["5","10","5√2","5√3"], answer:2, hint:"" },
      { id:"sat_399", topic:"Geometry & Trigonometry", difficulty:"Medium", question:"Convert 180° to radians.", choices:["90","π","2π","π/2"], answer:1, hint:"" },
      { id:"sat_400", topic:"Geometry & Trigonometry", difficulty:"Medium", question:"The surface area of a cube with edge 2 is:", choices:["12","24","16","8"], answer:1, hint:"" },
      { id:"sat_401", topic:"Geometry & Trigonometry", difficulty:"Hard", question:"A circle has equation (x−2)² + (y+3)² = 16. Its center and radius are:", choices:["(2, -3), r=16","(-2, 3), r=4","(2, -3), r=4","(-2, 3), r=16"], answer:2, hint:"" },
      { id:"sat_402", topic:"Geometry & Trigonometry", difficulty:"Hard", question:"In a 30-60-90 triangle, the side opposite 30° is 5. The hypotenuse is:", choices:["15","5√2","5√3","10"], answer:3, hint:"" },
      { id:"sat_403", topic:"Geometry & Trigonometry", difficulty:"Hard", question:"A sector of a circle (radius 6) has a central angle of 60°. Its area is:", choices:["36π","6π","3π","12π"], answer:1, hint:"" },
      { id:"sat_404", topic:"Geometry & Trigonometry", difficulty:"Hard", question:"A cone has radius 3 and height 4. Its slant height is:", choices:["√7","5","7","12"], answer:1, hint:"" },
      { id:"sat_405", topic:"Geometry & Trigonometry", difficulty:"Hard", question:"If tanθ = 1 and θ is acute, then θ =", choices:["90°","45°","60°","30°"], answer:1, hint:"" },
      { id:"sat_406", topic:"Geometry & Trigonometry", difficulty:"Hard", question:"A rectangle inscribed in a circle has diagonal 10. The circle's area is:", choices:["100π","10π","50π","25π"], answer:3, hint:"" },
      { id:"sat_407", topic:"Geometry & Trigonometry", difficulty:"Hard", question:"The volume of a sphere with radius 3 is:", choices:["9π","27π","12π","36π"], answer:3, hint:"" },
      { id:"sat_408", topic:"Geometry & Trigonometry", difficulty:"Hard", question:"Two chords intersect in a circle; one is split 4 and 6, the other 3 and x. Find x.", choices:["6","8","12","2"], answer:1, hint:"" },
      { id:"sat_409", topic:"Geometry & Trigonometry", difficulty:"Hard", question:"An arc has length 4π in a circle of radius 12. Its central angle in degrees is:", choices:["90°","30°","60°","120°"], answer:2, hint:"" },
      { id:"sat_410", topic:"Geometry & Trigonometry", difficulty:"Hard", question:"A right triangle has hypotenuse 13 and one leg 5. The area is:", choices:["65","30","60","32.5"], answer:1, hint:"" },
    ],
  },

  calcab: {
    id: "calcab", label: "Calculus", emoji: "∫",
    color: "#4338CA", bg: "#EEF2FF", dark: "#3730A3",
    tagline: "AP Calc AB · 8 units · 200 problems",
    topics: [
      { name: "Limits & Continuity", icon: "", color: "#2563EB", bg: "#DBEAFE" },
      { name: "Derivatives: Basic Rules", icon: "", color: "#7C3AED", bg: "#EDE9FE" },
      { name: "Chain Rule & Implicit", icon: "", color: "#DB2777", bg: "#FCE7F3" },
      { name: "Applications of Derivatives", icon: "", color: "#D97706", bg: "#FEF3C7" },
      { name: "Analyzing Functions (Derivatives)", icon: "", color: "#0EA5A0", bg: "#DFF7F3" },
      { name: "Integration & Accumulation", icon: "", color: "#DC2626", bg: "#FEE2E2" },
      { name: "Differential Equations", icon: "", color: "#16A34A", bg: "#DCFCE7" },
      { name: "Applications of Integration", icon: "", color: "#0891B2", bg: "#CFFAFE" },
    ],
    seeds: [
      { id:"calc_1", topic:"Limits & Continuity", difficulty:"Easy", question:"Evaluate: lim(x→2) (3x + 1)", choices:["10","5","7","6"], answer:2, hint:"" },
      { id:"calc_2", topic:"Limits & Continuity", difficulty:"Easy", question:"Evaluate: lim(x→0) (x² + 4)", choices:["0","16","4","2"], answer:2, hint:"" },
      { id:"calc_3", topic:"Limits & Continuity", difficulty:"Easy", question:"Evaluate: lim(x→3) (x² − 9)/(x − 3)", choices:["3","9","6","0"], answer:2, hint:"" },
      { id:"calc_4", topic:"Limits & Continuity", difficulty:"Easy", question:"Evaluate: lim(x→∞) (1/x)", choices:["∞","0","1","−1"], answer:1, hint:"" },
      { id:"calc_5", topic:"Limits & Continuity", difficulty:"Easy", question:"Evaluate: lim(x→5) (2x − 3)", choices:["13","10","2","7"], answer:3, hint:"" },
      { id:"calc_6", topic:"Limits & Continuity", difficulty:"Medium", question:"Evaluate: lim(x→0) (sin x)/x", choices:["undefined","∞","0","1"], answer:3, hint:"" },
      { id:"calc_7", topic:"Limits & Continuity", difficulty:"Medium", question:"Evaluate: lim(x→∞) (3x² + 2)/(x² − 1)", choices:["0","∞","3","2"], answer:2, hint:"" },
      { id:"calc_8", topic:"Limits & Continuity", difficulty:"Medium", question:"Evaluate: lim(x→2) (x² − 4)/(x − 2)", choices:["2","0","4","undefined"], answer:2, hint:"" },
      { id:"calc_9", topic:"Limits & Continuity", difficulty:"Medium", question:"Evaluate: lim(x→∞) (5x + 1)/(2x + 3)", choices:["5","5/2","∞","0"], answer:1, hint:"" },
      { id:"calc_10", topic:"Limits & Continuity", difficulty:"Medium", question:"For what value is f(x) = (x² − 1)/(x − 1) discontinuous?", choices:["x = −1","nowhere","x = 0","x = 1"], answer:3, hint:"" },
      { id:"calc_11", topic:"Limits & Continuity", difficulty:"Medium", question:"Evaluate: lim(x→0) (1 − cos x)/x", choices:["1","1/2","∞","0"], answer:3, hint:"" },
      { id:"calc_12", topic:"Limits & Continuity", difficulty:"Medium", question:"Evaluate: lim(x→4) √x", choices:["1/2","4","2","16"], answer:2, hint:"" },
      { id:"calc_13", topic:"Limits & Continuity", difficulty:"Medium", question:"The function f(x)=1/x has what type of discontinuity at x=0?", choices:["Removable","None","Infinite (vertical asymptote)","Jump"], answer:2, hint:"" },
      { id:"calc_14", topic:"Limits & Continuity", difficulty:"Medium", question:"Evaluate: lim(x→∞) (2x³ + 1)/(x² + 5)", choices:["1/5","2","∞","0"], answer:2, hint:"" },
      { id:"calc_15", topic:"Limits & Continuity", difficulty:"Medium", question:"If lim(x→a) f(x) = L exists, and f(a) = L, then f is:", choices:["Discontinuous","Continuous at a","Increasing","Undefined"], answer:1, hint:"" },
      { id:"calc_16", topic:"Limits & Continuity", difficulty:"Hard", question:"Evaluate: lim(x→0) (√(x+4) − 2)/x", choices:["1/2","∞","1/4","0"], answer:2, hint:"" },
      { id:"calc_17", topic:"Limits & Continuity", difficulty:"Hard", question:"Evaluate: lim(x→∞) (√(x² + x))/x", choices:["0","1/2","1","∞"], answer:2, hint:"" },
      { id:"calc_18", topic:"Limits & Continuity", difficulty:"Hard", question:"Evaluate: lim(x→0⁺) (ln x)", choices:["0","−∞","1","∞"], answer:1, hint:"" },
      { id:"calc_19", topic:"Limits & Continuity", difficulty:"Hard", question:"Evaluate: lim(x→3) (x² − x − 6)/(x − 3)", choices:["6","1","5","0"], answer:2, hint:"" },
      { id:"calc_20", topic:"Limits & Continuity", difficulty:"Hard", question:"The Intermediate Value Theorem guarantees a root of a continuous f on [a,b] when:", choices:["f(a)=f(b)","f is increasing","f(a)>0","f(a) and f(b) have opposite signs"], answer:3, hint:"" },
      { id:"calc_21", topic:"Limits & Continuity", difficulty:"Hard", question:"Evaluate: lim(x→0) (tan x)/x", choices:["undefined","∞","1","0"], answer:2, hint:"" },
      { id:"calc_22", topic:"Limits & Continuity", difficulty:"Hard", question:"Evaluate: lim(x→2⁻) (x − 2)/|x − 2|", choices:["0","−1","undefined","1"], answer:1, hint:"" },
      { id:"calc_23", topic:"Limits & Continuity", difficulty:"Hard", question:"Evaluate: lim(x→∞) (e^(−x))", choices:["1","0","−1","∞"], answer:1, hint:"" },
      { id:"calc_24", topic:"Limits & Continuity", difficulty:"Hard", question:"By the Squeeze Theorem, lim(x→0) x² sin(1/x) =", choices:["undefined","∞","0","1"], answer:2, hint:"" },
      { id:"calc_25", topic:"Limits & Continuity", difficulty:"Hard", question:"Evaluate: lim(x→1) (x³ − 1)/(x − 1)", choices:["1","∞","0","3"], answer:3, hint:"" },
      { id:"calc_26", topic:"Derivatives: Basic Rules", difficulty:"Easy", question:"Find dy/dx: y = x³", choices:["x⁴/4","x²","3x","3x²"], answer:3, hint:"" },
      { id:"calc_27", topic:"Derivatives: Basic Rules", difficulty:"Easy", question:"Find dy/dx: y = 5x", choices:["5x","5","0","x"], answer:1, hint:"" },
      { id:"calc_28", topic:"Derivatives: Basic Rules", difficulty:"Easy", question:"Find dy/dx: y = 7 (constant)", choices:["x","0","1","7"], answer:1, hint:"" },
      { id:"calc_29", topic:"Derivatives: Basic Rules", difficulty:"Easy", question:"Find dy/dx: y = x² + 3x", choices:["2x","2x + 3x","x + 3","2x + 3"], answer:3, hint:"" },
      { id:"calc_30", topic:"Derivatives: Basic Rules", difficulty:"Easy", question:"Find dy/dx: y = 4x²", choices:["4x","2x","8x","8"], answer:2, hint:"" },
      { id:"calc_31", topic:"Derivatives: Basic Rules", difficulty:"Medium", question:"Find f'(x): f(x) = x⁵ − 2x³ + x", choices:["5x⁴ − 6x²","5x⁴ − 2x² + 1","x⁴ − x²","5x⁴ − 6x² + 1"], answer:3, hint:"" },
      { id:"calc_32", topic:"Derivatives: Basic Rules", difficulty:"Medium", question:"Find dy/dx: y = √x", choices:["1/√x","2√x","1/(2√x)","√x/2"], answer:2, hint:"" },
      { id:"calc_33", topic:"Derivatives: Basic Rules", difficulty:"Medium", question:"Find dy/dx: y = 1/x", choices:["−1/x","−1/x²","1/x²","ln x"], answer:1, hint:"" },
      { id:"calc_34", topic:"Derivatives: Basic Rules", difficulty:"Medium", question:"Find the derivative of y = 3x⁴ − 2x", choices:["12x³","12x³ − 2","3x³ − 2","12x⁴ − 2"], answer:1, hint:"" },
      { id:"calc_35", topic:"Derivatives: Basic Rules", difficulty:"Medium", question:"Find dy/dx: y = x^(1/2) + x^(−1)", choices:["x^(−1/2) − x^(−2)","x^(−1/2)","(1/2)x^(1/2)","(1/2)x^(−1/2) − x^(−2)"], answer:3, hint:"" },
      { id:"calc_36", topic:"Derivatives: Basic Rules", difficulty:"Medium", question:"Product rule: d/dx[x²·sin x] =", choices:["2x sin x","2x sin x + x² cos x","2x cos x","x² cos x"], answer:1, hint:"" },
      { id:"calc_37", topic:"Derivatives: Basic Rules", difficulty:"Medium", question:"Quotient rule: d/dx[x/(x+1)] =", choices:["1/(x+1)","x/(x+1)²","−1/(x+1)²","1/(x+1)²"], answer:3, hint:"" },
      { id:"calc_38", topic:"Derivatives: Basic Rules", difficulty:"Medium", question:"Find the slope of y = x² at x = 3", choices:["12","3","6","9"], answer:2, hint:"" },
      { id:"calc_39", topic:"Derivatives: Basic Rules", difficulty:"Medium", question:"Find dy/dx: y = e^x", choices:["e","e^x","1","x·e^(x−1)"], answer:1, hint:"" },
      { id:"calc_40", topic:"Derivatives: Basic Rules", difficulty:"Medium", question:"Find dy/dx: y = ln x", choices:["x","1/x","1","ln x"], answer:1, hint:"" },
      { id:"calc_41", topic:"Derivatives: Basic Rules", difficulty:"Medium", question:"Find dy/dx: y = sin x", choices:["sin x","cos x","−cos x","−sin x"], answer:1, hint:"" },
      { id:"calc_42", topic:"Derivatives: Basic Rules", difficulty:"Medium", question:"Find dy/dx: y = cos x", choices:["sin x","−sin x","cos x","−cos x"], answer:1, hint:"" },
      { id:"calc_43", topic:"Derivatives: Basic Rules", difficulty:"Hard", question:"Find f'(x): f(x) = x²·e^x", choices:["x²·e^x","e^x(x² − 2x)","e^x(x² + 2x)","2x·e^x"], answer:2, hint:"" },
      { id:"calc_44", topic:"Derivatives: Basic Rules", difficulty:"Hard", question:"Find dy/dx: y = (2x + 1)/(x − 3)", choices:["−5/(x−3)²","−7/(x − 3)²","2/(x−3)","7/(x − 3)²"], answer:1, hint:"" },
      { id:"calc_45", topic:"Derivatives: Basic Rules", difficulty:"Hard", question:"Find the equation of the tangent line to y = x² at x = 1", choices:["y = x − 1","y = 2x − 1","y = 2x","y = 2x + 1"], answer:1, hint:"" },
      { id:"calc_46", topic:"Derivatives: Basic Rules", difficulty:"Hard", question:"Find dy/dx: y = tan x", choices:["cot x","sec x tan x","−csc²x","sec²x"], answer:3, hint:"" },
      { id:"calc_47", topic:"Derivatives: Basic Rules", difficulty:"Hard", question:"Find f'(x): f(x) = x·ln x", choices:["ln x","x + 1","1/x","ln x + 1"], answer:3, hint:"" },
      { id:"calc_48", topic:"Derivatives: Basic Rules", difficulty:"Hard", question:"Find the second derivative of y = x⁴", choices:["4x³","24x","x²","12x²"], answer:3, hint:"" },
      { id:"calc_49", topic:"Derivatives: Basic Rules", difficulty:"Hard", question:"At what x does y = x² − 4x have a horizontal tangent?", choices:["−2","4","2","0"], answer:2, hint:"" },
      { id:"calc_50", topic:"Derivatives: Basic Rules", difficulty:"Hard", question:"Find dy/dx: y = √(x)·x = x^(3/2)", choices:["x^(1/2)","(3/2)x^(1/2)","(3/2)x^(3/2)","(1/2)x^(−1/2)"], answer:1, hint:"" },
      { id:"calc_51", topic:"Chain Rule & Implicit", difficulty:"Easy", question:"Find dy/dx: y = (2x + 1)³", choices:["3(2x+1)²","6(2x+1)","6(2x+1)²","2(2x+1)²"], answer:2, hint:"" },
      { id:"calc_52", topic:"Chain Rule & Implicit", difficulty:"Easy", question:"Find dy/dx: y = sin(3x)", choices:["3sin(3x)","cos(3x)","−3cos(3x)","3cos(3x)"], answer:3, hint:"" },
      { id:"calc_53", topic:"Chain Rule & Implicit", difficulty:"Easy", question:"Find dy/dx: y = e^(2x)", choices:["e^(2x)/2","2e^(2x)","2e^x","e^(2x)"], answer:1, hint:"" },
      { id:"calc_54", topic:"Chain Rule & Implicit", difficulty:"Easy", question:"Find dy/dx: y = (x² + 1)⁴", choices:["8x(x²+1)","4(x²+1)³","8x(x²+1)³","4x(x²+1)³"], answer:2, hint:"" },
      { id:"calc_55", topic:"Chain Rule & Implicit", difficulty:"Easy", question:"Find dy/dx: y = cos(5x)", choices:["5cos(5x)","−sin(5x)","5sin(5x)","−5sin(5x)"], answer:3, hint:"" },
      { id:"calc_56", topic:"Chain Rule & Implicit", difficulty:"Medium", question:"Find dy/dx: y = √(x² + 1)", choices:["1/√(x²+1)","2x/√(x²+1)","x/(2√(x²+1))","x/√(x²+1)"], answer:3, hint:"" },
      { id:"calc_57", topic:"Chain Rule & Implicit", difficulty:"Medium", question:"Find dy/dx: y = ln(3x)", choices:["3/x","3","1/(3x)","1/x"], answer:3, hint:"" },
      { id:"calc_58", topic:"Chain Rule & Implicit", difficulty:"Medium", question:"Find dy/dx: y = e^(x²)", choices:["e^(x²)","x²·e^(x²)","2x·e^(x²)","2x·e^(2x)"], answer:2, hint:"" },
      { id:"calc_59", topic:"Chain Rule & Implicit", difficulty:"Medium", question:"Find dy/dx: y = sin²(x)", choices:["2cos x","cos²x","2sin x cos x","2sin x"], answer:2, hint:"" },
      { id:"calc_60", topic:"Chain Rule & Implicit", difficulty:"Medium", question:"Find dy/dx: y = (3x − 2)⁵", choices:["15(3x−2)","15(3x−2)⁴","3(3x−2)⁴","5(3x−2)⁴"], answer:1, hint:"" },
      { id:"calc_61", topic:"Chain Rule & Implicit", difficulty:"Medium", question:"Find dy/dx: y = tan(2x)", choices:["2sec(2x)","2sec²(2x)","2tan(2x)","sec²(2x)"], answer:1, hint:"" },
      { id:"calc_62", topic:"Chain Rule & Implicit", difficulty:"Medium", question:"Find dy/dx: y = ln(x² + 1)", choices:["1/(2x)","2x","1/(x²+1)","2x/(x²+1)"], answer:3, hint:"" },
      { id:"calc_63", topic:"Chain Rule & Implicit", difficulty:"Medium", question:"Implicit: if x² + y² = 25, find dy/dx", choices:["x/y","−y/x","x/y²","−x/y"], answer:3, hint:"" },
      { id:"calc_64", topic:"Chain Rule & Implicit", difficulty:"Medium", question:"Find dy/dx: y = e^(sin x)", choices:["e^(cos x)","sin x · e^(cos x)","e^(sin x)","cos x · e^(sin x)"], answer:3, hint:"" },
      { id:"calc_65", topic:"Chain Rule & Implicit", difficulty:"Medium", question:"Find dy/dx: y = (ln x)²", choices:["(ln x)/x","2/x","2ln x","2ln x / x"], answer:3, hint:"" },
      { id:"calc_66", topic:"Chain Rule & Implicit", difficulty:"Hard", question:"Implicit: if xy = 4, find dy/dx", choices:["−x/y","y/x","−y/x","1/x"], answer:2, hint:"" },
      { id:"calc_67", topic:"Chain Rule & Implicit", difficulty:"Hard", question:"Implicit: x² + xy + y² = 7, find dy/dx", choices:["(2x+y)/(x+2y)","−(x+y)/(x+y)","−(2x+y)/(2y)","−(2x+y)/(x+2y)"], answer:3, hint:"" },
      { id:"calc_68", topic:"Chain Rule & Implicit", difficulty:"Hard", question:"Find dy/dx: y = x·sin(x²)", choices:["sin(x²)","sin(x²) + 2x²cos(x²)","x cos(x²)","2x cos(x²)"], answer:1, hint:"" },
      { id:"calc_69", topic:"Chain Rule & Implicit", difficulty:"Hard", question:"Find the derivative of the inverse: if f(x)=x³ and g=f⁻¹, g'(8)=", choices:["12","1/3","1/12","1/8"], answer:2, hint:"" },
      { id:"calc_70", topic:"Chain Rule & Implicit", difficulty:"Hard", question:"Find dy/dx: y = arcsin(x)", choices:["1/√(x²−1)","1/(1+x²)","−1/√(1−x²)","1/√(1−x²)"], answer:3, hint:"" },
      { id:"calc_71", topic:"Chain Rule & Implicit", difficulty:"Hard", question:"Find dy/dx: y = arctan(x)", choices:["−1/(1+x²)","1/(1−x²)","1/(1+x²)","1/√(1−x²)"], answer:2, hint:"" },
      { id:"calc_72", topic:"Chain Rule & Implicit", difficulty:"Hard", question:"Implicit: sin(y) = x, find dy/dx", choices:["−1/cos y","1/sin y","cos y","1/cos y"], answer:3, hint:"" },
      { id:"calc_73", topic:"Chain Rule & Implicit", difficulty:"Hard", question:"Find dy/dx: y = e^(3x)·cos(x)", choices:["3e^(3x)cos x","e^(3x)(3cos x − sin x)","e^(3x)(3cos x + sin x)","−e^(3x)sin x"], answer:1, hint:"" },
      { id:"calc_74", topic:"Chain Rule & Implicit", difficulty:"Hard", question:"Find d²y/dx²: y = sin(2x)", choices:["4sin(2x)","−2sin(2x)","2cos(2x)","−4sin(2x)"], answer:3, hint:"" },
      { id:"calc_75", topic:"Chain Rule & Implicit", difficulty:"Hard", question:"Find dy/dx: y = (x/(x+1))³", choices:["3(x/(x+1))²","(1/(x+1)²)","3x²/(x+1)²","3(x/(x+1))²·(1/(x+1)²)"], answer:3, hint:"" },
      { id:"calc_76", topic:"Applications of Derivatives", difficulty:"Easy", question:"A particle's position is s(t) = t² + 3t. Its velocity at t = 2 is:", choices:["2","10","4","7"], answer:3, hint:"" },
      { id:"calc_77", topic:"Applications of Derivatives", difficulty:"Easy", question:"If velocity v(t) = 6t, the acceleration is:", choices:["3t²","0","6","6t"], answer:2, hint:"" },
      { id:"calc_78", topic:"Applications of Derivatives", difficulty:"Easy", question:"The instantaneous rate of change of f at x=a is:", choices:["the average rate","f(a)","f'(a)","∫f"], answer:2, hint:"" },
      { id:"calc_79", topic:"Applications of Derivatives", difficulty:"Medium", question:"A particle has position s(t)=t³−6t². When is velocity zero (t>0)?", choices:["t = 2","t = 0","t = 6","t = 4"], answer:3, hint:"" },
      { id:"calc_80", topic:"Applications of Derivatives", difficulty:"Medium", question:"Position s(t)=t²−4t+3. The particle is at rest when t=", choices:["3","1","4","2"], answer:3, hint:"" },
      { id:"calc_81", topic:"Applications of Derivatives", difficulty:"Medium", question:"A balloon's radius grows at 2 cm/s. When r=5, dV/dt (V=(4/3)πr³) =", choices:["400π","200π cm³/s","50π","100π"], answer:1, hint:"" },
      { id:"calc_82", topic:"Applications of Derivatives", difficulty:"Medium", question:"A 10-ft ladder slides down a wall. Related rates problems use:", choices:["L'Hôpital","Integration","The power rule only","Implicit differentiation of a relationship"], answer:3, hint:"" },
      { id:"calc_83", topic:"Applications of Derivatives", difficulty:"Medium", question:"If s(t)=t³−3t, the speed at t=2 is:", choices:["3","6","9","12"], answer:2, hint:"" },
      { id:"calc_84", topic:"Applications of Derivatives", difficulty:"Medium", question:"Water fills a tank; V(t)=t². The rate dV/dt at t=5 is:", choices:["25","2","10","5"], answer:2, hint:"" },
      { id:"calc_85", topic:"Applications of Derivatives", difficulty:"Medium", question:"The linear approximation of f near x=a uses:", choices:["f'(a)","f''(a)","f(a) + f'(a)(x−a)","f(a)"], answer:2, hint:"" },
      { id:"calc_86", topic:"Applications of Derivatives", difficulty:"Medium", question:"A car's position is s(t)=4t². Its velocity at t=3 is:", choices:["36","24","8","12"], answer:1, hint:"" },
      { id:"calc_87", topic:"Applications of Derivatives", difficulty:"Medium", question:"If the radius of a circle grows at 3 cm/s, dA/dt when r=4 (A=πr²) is:", choices:["12π","16π","24π cm²/s","48π"], answer:2, hint:"" },
      { id:"calc_88", topic:"Applications of Derivatives", difficulty:"Medium", question:"Velocity is v(t)=t²−4. The particle moves left (v<0) when:", choices:["t > 2","t < −2","−2 < t < 2","all t"], answer:2, hint:"" },
      { id:"calc_89", topic:"Applications of Derivatives", difficulty:"Medium", question:"Acceleration is the derivative of:", choices:["distance","position","velocity","jerk"], answer:2, hint:"" },
      { id:"calc_90", topic:"Applications of Derivatives", difficulty:"Medium", question:"If f(x)=x², the average rate of change on [1,3] is:", choices:["2","3","4","8"], answer:2, hint:"" },
      { id:"calc_91", topic:"Applications of Derivatives", difficulty:"Hard", question:"A conical tank (r=h) fills at 4 m³/min. When h=2, dh/dt (V=(1/3)πh³) =", choices:["4/π","2/π","1/(4π)","1/π m/min"], answer:3, hint:"" },
      { id:"calc_92", topic:"Applications of Derivatives", difficulty:"Hard", question:"L'Hôpital: lim(x→0) (e^x − 1)/x =", choices:["0","e","∞","1"], answer:3, hint:"" },
      { id:"calc_93", topic:"Applications of Derivatives", difficulty:"Hard", question:"L'Hôpital: lim(x→∞) (ln x)/x =", choices:["∞","e","1","0"], answer:3, hint:"" },
      { id:"calc_94", topic:"Applications of Derivatives", difficulty:"Hard", question:"A particle's position s(t)=t³−6t²+9t. Total distance on [0,3]:", choices:["3","6","0","4"], answer:3, hint:"" },
      { id:"calc_95", topic:"Applications of Derivatives", difficulty:"Hard", question:"A shadow: a person walks from a lamppost. This is a classic:", choices:["integral problem","limit problem","optimization problem","related rates problem"], answer:3, hint:"" },
      { id:"calc_96", topic:"Applications of Derivatives", difficulty:"Hard", question:"lim(x→0) (sin(3x))/(2x) using L'Hôpital =", choices:["0","1","3/2","2/3"], answer:2, hint:"" },
      { id:"calc_97", topic:"Applications of Derivatives", difficulty:"Hard", question:"The rate of change of the area of a square (side s) with respect to s is:", choices:["4s","2s","s","s²"], answer:1, hint:"" },
      { id:"calc_98", topic:"Applications of Derivatives", difficulty:"Hard", question:"If s(t)=−16t²+64t, the maximum height occurs at t=", choices:["4","3","2","1"], answer:2, hint:"" },
      { id:"calc_99", topic:"Applications of Derivatives", difficulty:"Hard", question:"A spherical balloon: when does volume grow fastest relative to radius? dV/dr=", choices:["πr²","2πr","4πr²","(4/3)πr³"], answer:2, hint:"" },
      { id:"calc_100", topic:"Applications of Derivatives", difficulty:"Hard", question:"L'Hôpital: lim(x→0⁺) x·ln x =", choices:["−∞","0","1","∞"], answer:1, hint:"" },
      { id:"calc_101", topic:"Analyzing Functions (Derivatives)", difficulty:"Easy", question:"f(x)=x²−6x. The critical point is at x=", choices:["−3","0","6","3"], answer:3, hint:"" },
      { id:"calc_102", topic:"Analyzing Functions (Derivatives)", difficulty:"Easy", question:"If f'(x)>0 on an interval, f is:", choices:["constant","increasing","concave up","decreasing"], answer:1, hint:"" },
      { id:"calc_103", topic:"Analyzing Functions (Derivatives)", difficulty:"Easy", question:"If f''(x)>0, the graph is:", choices:["linear","concave up","concave down","decreasing"], answer:1, hint:"" },
      { id:"calc_104", topic:"Analyzing Functions (Derivatives)", difficulty:"Easy", question:"A relative maximum of f occurs where f' changes from:", choices:["zero to zero","negative to positive","undefined","positive to negative"], answer:3, hint:"" },
      { id:"calc_105", topic:"Analyzing Functions (Derivatives)", difficulty:"Easy", question:"f(x)=x³. An inflection point occurs at x=", choices:["−1","none","0","1"], answer:2, hint:"" },
      { id:"calc_106", topic:"Analyzing Functions (Derivatives)", difficulty:"Medium", question:"f(x)=x²−4x+1. Its minimum value is at x=", choices:["4","1","2","−2"], answer:2, hint:"" },
      { id:"calc_107", topic:"Analyzing Functions (Derivatives)", difficulty:"Medium", question:"f(x)=x³−3x. The local maximum is at x=", choices:["1","−1","0","3"], answer:1, hint:"" },
      { id:"calc_108", topic:"Analyzing Functions (Derivatives)", difficulty:"Medium", question:"Find intervals where f(x)=x³−3x² is decreasing:", choices:["all x","0 < x < 2","x > 2","x < 0"], answer:1, hint:"" },
      { id:"calc_109", topic:"Analyzing Functions (Derivatives)", difficulty:"Medium", question:"By the Mean Value Theorem, f(x)=x² on [0,4] has c=", choices:["1","0","4","2"], answer:3, hint:"" },
      { id:"calc_110", topic:"Analyzing Functions (Derivatives)", difficulty:"Medium", question:"f(x)=x⁴−2x². The inflection points are where f''=0, at x=", choices:["±2","±1/√3","±1","0"], answer:1, hint:"" },
      { id:"calc_111", topic:"Analyzing Functions (Derivatives)", difficulty:"Medium", question:"The absolute max of f(x)=−x²+4 on [−1,3] is:", choices:["3","−5","4","0"], answer:2, hint:"" },
      { id:"calc_112", topic:"Analyzing Functions (Derivatives)", difficulty:"Medium", question:"f'(x)=(x−1)(x+2). f has critical points at:", choices:["x=0","x=1 and x=−2","x=−1 and x=2","x=1 only"], answer:1, hint:"" },
      { id:"calc_113", topic:"Analyzing Functions (Derivatives)", difficulty:"Medium", question:"If f''(c)<0 at a critical point c, then c is a:", choices:["inflection point","local minimum","local maximum","saddle"], answer:2, hint:"" },
      { id:"calc_114", topic:"Analyzing Functions (Derivatives)", difficulty:"Medium", question:"Rolle's Theorem requires f(a)=f(b) and f to be:", choices:["increasing","positive","concave up","continuous and differentiable"], answer:3, hint:"" },
      { id:"calc_115", topic:"Analyzing Functions (Derivatives)", difficulty:"Medium", question:"f(x)=x²+2x+1 has its vertex (minimum) at x=", choices:["2","1","0","−1"], answer:3, hint:"" },
      { id:"calc_116", topic:"Analyzing Functions (Derivatives)", difficulty:"Hard", question:"Optimization: max area of a rectangle with perimeter 20. Dimensions:", choices:["10 by 0","5 by 5","2 by 8","4 by 6"], answer:1, hint:"" },
      { id:"calc_117", topic:"Analyzing Functions (Derivatives)", difficulty:"Hard", question:"A box with square base, volume 32, minimize surface area. Base side:", choices:["8","4","2","16"], answer:1, hint:"" },
      { id:"calc_118", topic:"Analyzing Functions (Derivatives)", difficulty:"Hard", question:"f(x)=x³−3x²+2. The point of inflection is at x=", choices:["0","−1","1","2"], answer:2, hint:"" },
      { id:"calc_119", topic:"Analyzing Functions (Derivatives)", difficulty:"Hard", question:"On [0,2π], f(x)=sin x has absolute max at x=", choices:["π","2π","π/2","0"], answer:2, hint:"" },
      { id:"calc_120", topic:"Analyzing Functions (Derivatives)", difficulty:"Hard", question:"A farmer has 100 ft of fence for a rectangular pen against a wall (3 sides). Max area width:", choices:["33","20","50","25"], answer:3, hint:"" },
      { id:"calc_121", topic:"Analyzing Functions (Derivatives)", difficulty:"Hard", question:"f(x)=x/(x²+1). The critical points are at x=", choices:["±2","0","±1","1 only"], answer:2, hint:"" },
      { id:"calc_122", topic:"Analyzing Functions (Derivatives)", difficulty:"Hard", question:"Minimize the distance from origin to line y=−x+4. Closest point:", choices:["(1, 3)","(2, 2)","(4, 0)","(0, 4)"], answer:1, hint:"" },
      { id:"calc_123", topic:"Analyzing Functions (Derivatives)", difficulty:"Hard", question:"If f'(x)=x²−4, f is concave up (f''>0) when:", choices:["all x","never","x > 0","x < 0"], answer:2, hint:"" },
      { id:"calc_124", topic:"Analyzing Functions (Derivatives)", difficulty:"Hard", question:"The second derivative test fails when f''(c)=", choices:["positive","0","undefined only","negative"], answer:1, hint:"" },
      { id:"calc_125", topic:"Analyzing Functions (Derivatives)", difficulty:"Hard", question:"A cylinder with volume 54π, minimize surface area. Radius:", choices:["2","6","9","3"], answer:3, hint:"" },
      { id:"calc_126", topic:"Integration & Accumulation", difficulty:"Easy", question:"∫ 2x dx =", choices:["x + C","x² + C","2x² + C","2 + C"], answer:1, hint:"" },
      { id:"calc_127", topic:"Integration & Accumulation", difficulty:"Easy", question:"∫ 3 dx =", choices:["0","3 + C","3x + C","x + C"], answer:2, hint:"" },
      { id:"calc_128", topic:"Integration & Accumulation", difficulty:"Easy", question:"∫ x² dx =", choices:["2x + C","3x² + C","x³ + C","x³/3 + C"], answer:3, hint:"" },
      { id:"calc_129", topic:"Integration & Accumulation", difficulty:"Easy", question:"∫₀¹ 2x dx =", choices:["0","1","2","1/2"], answer:1, hint:"" },
      { id:"calc_130", topic:"Integration & Accumulation", difficulty:"Easy", question:"∫ x³ dx =", choices:["4x³ + C","x⁴/4 + C","x⁴ + C","3x² + C"], answer:1, hint:"" },
      { id:"calc_131", topic:"Integration & Accumulation", difficulty:"Medium", question:"∫ (3x² + 2x) dx =", choices:["6x + 2 + C","3x³ + x² + C","x³ + x²","x³ + x² + C"], answer:3, hint:"" },
      { id:"calc_132", topic:"Integration & Accumulation", difficulty:"Medium", question:"∫ e^x dx =", choices:["e^(x+1)/(x+1)","e^x","e^x + C","x·e^x + C"], answer:2, hint:"" },
      { id:"calc_133", topic:"Integration & Accumulation", difficulty:"Medium", question:"∫ (1/x) dx =", choices:["1/x + C","ln|x| + C","−1/x² + C","x + C"], answer:1, hint:"" },
      { id:"calc_134", topic:"Integration & Accumulation", difficulty:"Medium", question:"∫ cos x dx =", choices:["−cos x + C","−sin x + C","sin x + C","cos x + C"], answer:2, hint:"" },
      { id:"calc_135", topic:"Integration & Accumulation", difficulty:"Medium", question:"∫₀² x² dx =", choices:["2/3","4","8/3","8"], answer:2, hint:"" },
      { id:"calc_136", topic:"Integration & Accumulation", difficulty:"Medium", question:"∫ sin x dx =", choices:["sin x + C","−cos x + C","cos x + C","−sin x + C"], answer:1, hint:"" },
      { id:"calc_137", topic:"Integration & Accumulation", difficulty:"Medium", question:"A left Riemann sum with 2 rectangles for f(x)=x on [0,4]:", choices:["8","4","2","6"], answer:1, hint:"" },
      { id:"calc_138", topic:"Integration & Accumulation", difficulty:"Medium", question:"By FTC, if F'(x)=f(x), then ∫ₐᵇ f(x)dx =", choices:["f(b) − f(a)","F(b) − F(a)","F(b) + F(a)","F(a) − F(b)"], answer:1, hint:"" },
      { id:"calc_139", topic:"Integration & Accumulation", difficulty:"Medium", question:"∫ 4x³ dx =", choices:["x⁴/4 + C","x⁴ + C","12x² + C","4x⁴ + C"], answer:1, hint:"" },
      { id:"calc_140", topic:"Integration & Accumulation", difficulty:"Medium", question:"d/dx ∫₀ˣ sin(t) dt =", choices:["cos x","−cos x","sin x + C","sin x"], answer:3, hint:"" },
      { id:"calc_141", topic:"Integration & Accumulation", difficulty:"Hard", question:"∫ 2x·(x²+1)³ dx  (u-sub) =", choices:["2(x²+1)⁴","(x²+1)³/3 + C","(x²+1)⁴/4 + C","(x²+1)⁴ + C"], answer:2, hint:"" },
      { id:"calc_142", topic:"Integration & Accumulation", difficulty:"Hard", question:"∫₀^(π/2) cos x dx =", choices:["−1","1","π/2","0"], answer:1, hint:"" },
      { id:"calc_143", topic:"Integration & Accumulation", difficulty:"Hard", question:"∫ x·e^(x²) dx =", choices:["2e^(x²)","x²·e^(x²)","e^(x²) + C","(1/2)e^(x²) + C"], answer:3, hint:"" },
      { id:"calc_144", topic:"Integration & Accumulation", difficulty:"Hard", question:"∫ (2x)/(x²+1) dx =", choices:["1/(x²+1)","ln(x²+1) + C","2ln(x²+1)","2x·ln(x²+1)"], answer:1, hint:"" },
      { id:"calc_145", topic:"Integration & Accumulation", difficulty:"Hard", question:"∫₁ᵉ (1/x) dx =", choices:["e−1","1","0","e"], answer:1, hint:"" },
      { id:"calc_146", topic:"Integration & Accumulation", difficulty:"Hard", question:"The average value of f(x)=x² on [0,3] is:", choices:["6","9","1","3"], answer:3, hint:"" },
      { id:"calc_147", topic:"Integration & Accumulation", difficulty:"Hard", question:"∫ sec²x dx =", choices:["cot x + C","tan x + C","−tan x","sec x + C"], answer:1, hint:"" },
      { id:"calc_148", topic:"Integration & Accumulation", difficulty:"Hard", question:"If g(x)=∫₀ˣ (t²+1)dt, then g'(2) =", choices:["3","5","2","4"], answer:1, hint:"" },
      { id:"calc_149", topic:"Integration & Accumulation", difficulty:"Hard", question:"∫ (3x² + 1)/(x³ + x) dx =", choices:["3x + C","ln(x²+1)","1/(x³+x)","ln|x³+x| + C"], answer:3, hint:"" },
      { id:"calc_150", topic:"Integration & Accumulation", difficulty:"Hard", question:"∫₀^4 |x − 2| dx =", choices:["2","0","4","8"], answer:2, hint:"" },
      { id:"calc_151", topic:"Differential Equations", difficulty:"Easy", question:"The general solution of dy/dx = 2 is:", choices:["y = 2 + C","y = C","y = 2x + C","y = x² + C"], answer:2, hint:"" },
      { id:"calc_152", topic:"Differential Equations", difficulty:"Easy", question:"dy/dx = x means y =", choices:["x + C","x² + C","x²/2 + C","1 + C"], answer:2, hint:"" },
      { id:"calc_153", topic:"Differential Equations", difficulty:"Easy", question:"dy/dx = y describes:", choices:["constant","exponential growth","linear growth","decay only"], answer:1, hint:"" },
      { id:"calc_154", topic:"Differential Equations", difficulty:"Easy", question:"A slope field shows dy/dx as:", choices:["a single curve","little slope segments at points","the area","the antiderivative"], answer:1, hint:"" },
      { id:"calc_155", topic:"Differential Equations", difficulty:"Easy", question:"The solution of dy/dx = ky is:", choices:["y = Cx^k","y = kx + C","y = Ce^(kx)","y = k + Cx"], answer:2, hint:"" },
      { id:"calc_156", topic:"Differential Equations", difficulty:"Medium", question:"Solve dy/dx = 3y. General solution:", choices:["y = 3x + C","y = Ce^(3x)","y = Cx³","y = e^(3x)"], answer:1, hint:"" },
      { id:"calc_157", topic:"Differential Equations", difficulty:"Medium", question:"Separate variables: dy/dx = xy. First step gives:", choices:["dy = xy dx only","dy/y = dx","y dy = x dx","(1/y)dy = x dx"], answer:3, hint:"" },
      { id:"calc_158", topic:"Differential Equations", difficulty:"Medium", question:"Population grows: dP/dt = 0.05P, P(0)=100. Then P(t)=", choices:["0.05t","100e^(0.05t)","100·0.05^t","100 + 0.05t"], answer:1, hint:"" },
      { id:"calc_159", topic:"Differential Equations", difficulty:"Medium", question:"dy/dx = −2y models:", choices:["constant","oscillation","linear growth","exponential decay"], answer:3, hint:"" },
      { id:"calc_160", topic:"Differential Equations", difficulty:"Medium", question:"Solve dy/dx = x/y. Separating:", choices:["dy = x/y dx only","y dy = x dx","y dx = x dy","(1/y)dy = x dx"], answer:1, hint:"" },
      { id:"calc_161", topic:"Differential Equations", difficulty:"Medium", question:"If dy/dx = 6x² and y(0)=1, then y =", choices:["6x³ + 1","2x³ + 1","2x³","x³ + 1"], answer:1, hint:"" },
      { id:"calc_162", topic:"Differential Equations", difficulty:"Medium", question:"Exponential decay half-life relates to which model?", choices:["y = y₀/t","y = kt²","y = y₀ + kt","y = y₀e^(−kt)"], answer:3, hint:"" },
      { id:"calc_163", topic:"Differential Equations", difficulty:"Medium", question:"A slope field with horizontal segments along y=0 suggests dy/dx=0 when:", choices:["never","x = 0","always","y = 0"], answer:3, hint:"" },
      { id:"calc_164", topic:"Differential Equations", difficulty:"Medium", question:"dy/dx = 2x, y(1)=3. Find y(x):", choices:["x² + 3","2x² + 1","x² + 2","x²"], answer:2, hint:"" },
      { id:"calc_165", topic:"Differential Equations", difficulty:"Medium", question:"Newton's Law of Cooling uses a differential equation of the form:", choices:["dT/dt = kT²","dT/dt = −k(T − Tₛ)","dT/dt = k","dT/dt = kt"], answer:1, hint:"" },
      { id:"calc_166", topic:"Differential Equations", difficulty:"Hard", question:"Solve dy/dx = xy, y(0)=2. Then y =", choices:["2 + x²","2e^(x²/2)","2e^x","e^(x²)+1"], answer:1, hint:"" },
      { id:"calc_167", topic:"Differential Equations", difficulty:"Hard", question:"Solve dy/dx = y², y(0)=1. Then y =", choices:["1+x","x²","1/(1−x)","e^x"], answer:2, hint:"" },
      { id:"calc_168", topic:"Differential Equations", difficulty:"Hard", question:"A tank's salt: dA/dt = 5 − A/10. The equilibrium (dA/dt=0) is A=", choices:["10","50","25","5"], answer:1, hint:"" },
      { id:"calc_169", topic:"Differential Equations", difficulty:"Hard", question:"If dy/dx = (2x)/y and y(0)=3, find y²:", choices:["x² + 3","x² + 9","2x² + 9","2x² + 3"], answer:2, hint:"" },
      { id:"calc_170", topic:"Differential Equations", difficulty:"Hard", question:"Bacteria triple every hour: N=N₀·3^t. As a diff eq, dN/dt =", choices:["3N","N/3","N·ln 3","N + 3"], answer:2, hint:"" },
      { id:"calc_171", topic:"Differential Equations", difficulty:"Hard", question:"dy/dx = cos x, y(0)=2. Then y =", choices:["sin x","cos x + 1","−sin x + 2","sin x + 2"], answer:3, hint:"" },
      { id:"calc_172", topic:"Differential Equations", difficulty:"Hard", question:"The logistic model dP/dt = kP(1 − P/M) levels off at P=", choices:["M/2","M","k","0"], answer:1, hint:"" },
      { id:"calc_173", topic:"Differential Equations", difficulty:"Hard", question:"Solve dy/dx = 3x²y, y(0)=1:", choices:["e^(3x)","x³ + 1","e^(x³)","3x³"], answer:2, hint:"" },
      { id:"calc_174", topic:"Differential Equations", difficulty:"Hard", question:"A slope field where all slopes depend only on x means dy/dx=", choices:["f(y)","f(x)","constant","xy"], answer:1, hint:"" },
      { id:"calc_175", topic:"Differential Equations", difficulty:"Hard", question:"If dy/dt = −0.1y and y(0)=500, then y(t)=", choices:["500 − 0.1t","500(0.1)^t","500e^(−0.1t)","50t"], answer:2, hint:"" },
      { id:"calc_176", topic:"Applications of Integration", difficulty:"Easy", question:"The area under f(x)=x from 0 to 4 is:", choices:["16","8","4","2"], answer:1, hint:"" },
      { id:"calc_177", topic:"Applications of Integration", difficulty:"Easy", question:"Area under f(x)=2 from 0 to 5 is:", choices:["2","10","7","5"], answer:1, hint:"" },
      { id:"calc_178", topic:"Applications of Integration", difficulty:"Easy", question:"The area between a curve and the x-axis is found using:", choices:["a limit only","the slope","a definite integral","a derivative"], answer:2, hint:"" },
      { id:"calc_179", topic:"Applications of Integration", difficulty:"Easy", question:"∫₀³ x dx gives the area =", choices:["3","9","9/2","6"], answer:2, hint:"" },
      { id:"calc_180", topic:"Applications of Integration", difficulty:"Easy", question:"Displacement is the integral of:", choices:["acceleration","position","distance","velocity"], answer:3, hint:"" },
      { id:"calc_181", topic:"Applications of Integration", difficulty:"Medium", question:"Area between y=x² and y=x from 0 to 1:", choices:["1/2","1/3","1/6","1"], answer:2, hint:"" },
      { id:"calc_182", topic:"Applications of Integration", difficulty:"Medium", question:"The volume of revolution (disk method) uses:", choices:["∫[R]²dx","2π∫R dx","∫R(x)dx","π∫[R(x)]²dx"], answer:3, hint:"" },
      { id:"calc_183", topic:"Applications of Integration", difficulty:"Medium", question:"A particle's velocity v(t)=2t. Displacement from t=0 to 3:", choices:["18","9","3","6"], answer:1, hint:"" },
      { id:"calc_184", topic:"Applications of Integration", difficulty:"Medium", question:"Average value of f(x)=x on [0,4]:", choices:["8","2","4","1"], answer:1, hint:"" },
      { id:"calc_185", topic:"Applications of Integration", difficulty:"Medium", question:"Area under f(x)=x² from 0 to 3:", choices:["3","9","27","18"], answer:1, hint:"" },
      { id:"calc_186", topic:"Applications of Integration", difficulty:"Medium", question:"Total distance = ∫|v(t)|dt. If v(t)=t−2 on [0,4], total distance =", choices:["8","4","2","0"], answer:1, hint:"" },
      { id:"calc_187", topic:"Applications of Integration", difficulty:"Medium", question:"The region bounded by y=√x, y=0, x=4. Its area:", choices:["8","4","16/3","8/3"], answer:2, hint:"" },
      { id:"calc_188", topic:"Applications of Integration", difficulty:"Medium", question:"Volume when y=x² is revolved about x-axis, 0 to 1 (disk):", choices:["π/2","π/3","π/5","π"], answer:2, hint:"" },
      { id:"calc_189", topic:"Applications of Integration", difficulty:"Medium", question:"Net change: ∫₀ᵀ R(t)dt represents:", choices:["instantaneous rate","the derivative","average rate","accumulated change"], answer:3, hint:"" },
      { id:"calc_190", topic:"Applications of Integration", difficulty:"Medium", question:"Area between y=4 and y=x² from x=−2 to 2:", choices:["16/3","32/3","16","8"], answer:1, hint:"" },
      { id:"calc_191", topic:"Applications of Integration", difficulty:"Hard", question:"Area between y=x² and y=2x (0 to 2):", choices:["2","4","8/3","4/3"], answer:3, hint:"" },
      { id:"calc_192", topic:"Applications of Integration", difficulty:"Hard", question:"Volume of solid with square cross-sections, base y=√x, x=0 to 4 (∫[√x]²dx):", choices:["4","16","8","32"], answer:2, hint:"" },
      { id:"calc_193", topic:"Applications of Integration", difficulty:"Hard", question:"A particle: v(t)=3t²−12. Total distance on [0,3]:", choices:["−9","23","9","0"], answer:1, hint:"" },
      { id:"calc_194", topic:"Applications of Integration", difficulty:"Hard", question:"Volume: region under y=1/x from x=1 to 2 revolved about x-axis (disk):", choices:["π/4","π","π/2","2π"], answer:2, hint:"" },
      { id:"calc_195", topic:"Applications of Integration", difficulty:"Hard", question:"Area between y=sin x and x-axis from 0 to π:", choices:["1","2","0","π"], answer:1, hint:"" },
      { id:"calc_196", topic:"Applications of Integration", difficulty:"Hard", question:"The average value of f(x)=x² on [0,2]:", choices:["2","4/3","8/3","1"], answer:1, hint:"" },
      { id:"calc_197", topic:"Applications of Integration", difficulty:"Hard", question:"Volume by disks: y=√x revolved about x-axis from 0 to 4:", choices:["16π","4π","2π","8π"], answer:3, hint:"" },
      { id:"calc_198", topic:"Applications of Integration", difficulty:"Hard", question:"Area between curves y=x³ and y=x from 0 to 1:", choices:["1/3","1/2","1/12","1/4"], answer:3, hint:"" },
      { id:"calc_199", topic:"Applications of Integration", difficulty:"Hard", question:"If a(t)=6t and v(0)=0, s(0)=0, find s(2):", choices:["12","8","4","6"], answer:1, hint:"" },
      { id:"calc_200", topic:"Applications of Integration", difficulty:"Hard", question:"The region bounded by y=x, y=x², revolved about x-axis (washers) 0 to 1: ∫π(x²−x⁴)dx =", choices:["π/15","π/3","2π/15","π/6"], answer:2, hint:"" },
    ],
  },

  calcbc: {
    id: "calcbc", label: "Calc BC Bridge", emoji: "∬",
    color: "#6D28D9", bg: "#F5F3FF", dark: "#5B21B6",
    tagline: "BC Bridge · parametrics & advanced integration",
    topics: [
      { name: "Parametric Equations", icon: "", color: "#7C3AED", bg: "#EDE9FE" },
      { name: "Integration by u-Substitution", icon: "", color: "#0891B2", bg: "#CFFAFE" },
      { name: "Integration by Parts", icon: "", color: "#DB2777", bg: "#FCE7F3" },
    ],
    seeds: [
      { id:"bc_1", topic:"Parametric Equations", difficulty:"Easy", question:"Given x = t and y = t², eliminate the parameter to get y in terms of x.", choices:["x = y²","y = 2x","y = x²","y = x"], answer:2, hint:"" },
      { id:"bc_2", topic:"Parametric Equations", difficulty:"Easy", question:"For x = 2t, y = t + 1, find the point when t = 1.", choices:["(1, 2)","(1, 1)","(2, 2)","(2, 1)"], answer:2, hint:"" },
      { id:"bc_3", topic:"Parametric Equations", difficulty:"Easy", question:"Given x = t + 3 and y = 2t, solve for t from the x-equation.", choices:["t = 3 − x","t = x/3","t = x + 3","t = x − 3"], answer:3, hint:"" },
      { id:"bc_4", topic:"Parametric Equations", difficulty:"Easy", question:"If x = cos t and y = sin t, then x² + y² =", choices:["2","0","1","t"], answer:2, hint:"" },
      { id:"bc_5", topic:"Parametric Equations", difficulty:"Medium", question:"For x = t², y = t³, eliminate the parameter.", choices:["y = x³","y = x²","y = x^(3/2)","y = x^(2/3)"], answer:2, hint:"" },
      { id:"bc_6", topic:"Parametric Equations", difficulty:"Medium", question:"Given x = 3t, y = 9t², express y in terms of x.", choices:["y = 9x²","y = x²/3","y = x²","y = 3x²"], answer:2, hint:"" },
      { id:"bc_7", topic:"Parametric Equations", difficulty:"Medium", question:"Parametric: x = t + 1, y = t − 1. Eliminating t gives:", choices:["y = x + 2","y = 2x","y = x","y = x − 2"], answer:3, hint:"" },
      { id:"bc_8", topic:"Parametric Equations", difficulty:"Medium", question:"For x = 2cos t, y = 2sin t, the curve is a:", choices:["line","parabola","circle of radius 2","ellipse a≠b"], answer:2, hint:"" },
      { id:"bc_9", topic:"Parametric Equations", difficulty:"Medium", question:"The parametric derivative dy/dx = (dy/dt)/(dx/dt). If x = t², y = t³, find dy/dx.", choices:["3t²","t","(3t)/2","(2t)/3"], answer:2, hint:"" },
      { id:"bc_10", topic:"Parametric Equations", difficulty:"Medium", question:"If x = t and y = t², find dy/dx at t = 2.", choices:["1","8","4","2"], answer:2, hint:"" },
      { id:"bc_11", topic:"Parametric Equations", difficulty:"Medium", question:"For x = sin t, y = cos t, find dx/dt.", choices:["−cos t","−sin t","cos t","sin t"], answer:2, hint:"" },
      { id:"bc_12", topic:"Parametric Equations", difficulty:"Medium", question:"Given x = e^t, y = e^(2t), then y in terms of x is:", choices:["y = x^(1/2)","y = e·x","y = 2x","y = x²"], answer:3, hint:"" },
      { id:"bc_13", topic:"Parametric Equations", difficulty:"Hard", question:"For x = t², y = t³ − t, find dy/dx.", choices:["(2t)/(3t² − 1)","(3t² − 1)/(2t)","6t","3t² − 1"], answer:1, hint:"" },
      { id:"bc_14", topic:"Parametric Equations", difficulty:"Hard", question:"Parametric curve x = cos t, y = sin t. Find dy/dx.", choices:["cot t","−tan t","−cot t","tan t"], answer:2, hint:"" },
      { id:"bc_15", topic:"Parametric Equations", difficulty:"Hard", question:"For x = t³, y = t², the second derivative d²y/dx² involves d/dt(dy/dx) ÷ (dx/dt). First find dy/dx.", choices:["2t","2/(3t)","(2t)/(3t²)","3t/2"], answer:1, hint:"" },
      { id:"bc_16", topic:"Parametric Equations", difficulty:"Hard", question:"The speed of a parametric particle is √((dx/dt)² + (dy/dt)²). For x = 3t, y = 4t, speed =", choices:["1","5","7","25"], answer:1, hint:"" },
      { id:"bc_17", topic:"Parametric Equations", difficulty:"Hard", question:"At what t does the parametric curve x = t² − 4t, y = t have a vertical tangent (dx/dt = 0)?", choices:["t = 0","t = 4","t = 2","t = −2"], answer:2, hint:"" },
      { id:"bc_18", topic:"Parametric Equations", difficulty:"Hard", question:"Arc length of a parametric curve uses ∫√((dx/dt)² + (dy/dt)²) dt. For x = t, y = t, from 0 to 1, length =", choices:["2","1","√2/2","√2"], answer:3, hint:"" },
      { id:"bc_19", topic:"Integration by u-Substitution", difficulty:"Easy", question:"∫ 2x(x² + 1)³ dx. Let u = x² + 1. Then du =", choices:["x dx","x² dx","2 dx","2x dx"], answer:3, hint:"" },
      { id:"bc_20", topic:"Integration by u-Substitution", difficulty:"Easy", question:"∫ 2x·e^(x²) dx. Best substitution is u =", choices:["2x","x","x²","e^(x²)"], answer:2, hint:"" },
      { id:"bc_21", topic:"Integration by u-Substitution", difficulty:"Easy", question:"∫ (2x)/(x² + 1) dx. Let u = x² + 1; the integral becomes ∫(1/u)du =", choices:["2ln|x| + C","1/(x²+1) + C","x² + 1 + C","ln|x² + 1| + C"], answer:3, hint:"" },
      { id:"bc_22", topic:"Integration by u-Substitution", difficulty:"Easy", question:"∫ cos(x)·e^(sin x) dx. Let u = sin x. Then du =", choices:["e^(sin x) dx","cos x dx","sin x dx","−cos x dx"], answer:1, hint:"" },
      { id:"bc_23", topic:"Integration by u-Substitution", difficulty:"Medium", question:"Evaluate ∫ 2x(x² + 1)³ dx.", choices:["(x² + 1)⁴ + C","(x² + 1)⁴/4 + C","(x²+1)³/3 + C","2(x²+1)⁴ + C"], answer:1, hint:"" },
      { id:"bc_24", topic:"Integration by u-Substitution", difficulty:"Medium", question:"Evaluate ∫ x·e^(x²) dx.", choices:["x²e^(x²) + C","(1/2)e^(x²) + C","2e^(x²) + C","e^(x²) + C"], answer:1, hint:"" },
      { id:"bc_25", topic:"Integration by u-Substitution", difficulty:"Medium", question:"Evaluate ∫ (3x²)(x³ + 1)⁵ dx.", choices:["(x³+1)⁵/5 + C","(x³ + 1)⁶/6 + C","(x³+1)⁶ + C","3(x³+1)⁶ + C"], answer:1, hint:"" },
      { id:"bc_26", topic:"Integration by u-Substitution", difficulty:"Medium", question:"Evaluate ∫ cos(3x) dx.", choices:["sin(3x) + C","−(1/3)sin(3x) + C","(1/3)sin(3x) + C","3sin(3x) + C"], answer:2, hint:"" },
      { id:"bc_27", topic:"Integration by u-Substitution", difficulty:"Medium", question:"Evaluate ∫ sin(x)cos(x) dx (let u = sin x).", choices:["(1/2)cos²x + C","(1/2)sin²x + C","−cos²x + C","sin²x + C"], answer:1, hint:"" },
      { id:"bc_28", topic:"Integration by u-Substitution", difficulty:"Medium", question:"Evaluate ∫ (1/(x ln x)) dx (let u = ln x).", choices:["1/(ln x) + C","ln|ln x| + C","ln x + C","(ln x)² + C"], answer:1, hint:"" },
      { id:"bc_29", topic:"Integration by u-Substitution", difficulty:"Medium", question:"Evaluate ∫ e^(3x) dx.", choices:["e^(3x) + C","e^(3x)/x + C","3e^(3x) + C","(1/3)e^(3x) + C"], answer:3, hint:"" },
      { id:"bc_30", topic:"Integration by u-Substitution", difficulty:"Medium", question:"Evaluate ∫ (2x + 3)⁴ dx.", choices:["(2x+3)⁵ + C","(2x + 3)⁵/10 + C","2(2x+3)⁵ + C","(2x+3)⁵/5 + C"], answer:1, hint:"" },
      { id:"bc_31", topic:"Integration by u-Substitution", difficulty:"Hard", question:"Evaluate ∫₀¹ 2x(x² + 1)³ dx.", choices:["(x²+1)⁴/4","4","8","15/4"], answer:3, hint:"" },
      { id:"bc_32", topic:"Integration by u-Substitution", difficulty:"Hard", question:"Evaluate ∫ x√(x² + 1) dx.", choices:["(x²+1)^(1/2) + C","(1/3)(x² + 1)^(3/2) + C","(x²+1)^(3/2) + C","(2/3)(x²+1)^(3/2)"], answer:1, hint:"" },
      { id:"bc_33", topic:"Integration by u-Substitution", difficulty:"Hard", question:"Evaluate ∫ tan x dx (write as ∫ sin x / cos x dx).", choices:["ln|cos x| + C","−ln|cos x| + C","ln|sin x| + C","sec²x + C"], answer:1, hint:"" },
      { id:"bc_34", topic:"Integration by u-Substitution", difficulty:"Hard", question:"Evaluate ∫ (x)/(√(1 − x²)) dx.", choices:["arcsin x + C","−√(1 − x²) + C","√(1 − x²) + C","(1−x²)^(3/2) + C"], answer:1, hint:"" },
      { id:"bc_35", topic:"Integration by u-Substitution", difficulty:"Hard", question:"Evaluate ∫₀^(π/2) cos x · e^(sin x) dx.", choices:["e + 1","1","e − 1","e"], answer:2, hint:"" },
      { id:"bc_36", topic:"Integration by u-Substitution", difficulty:"Hard", question:"Evaluate ∫ (ln x)²/x dx (let u = ln x).", choices:["(ln x)³ + C","(ln x)³/3 + C","3(ln x)³ + C","(ln x)²/2 + C"], answer:1, hint:"" },
      { id:"bc_37", topic:"Integration by Parts", difficulty:"Easy", question:"Integration by parts formula: ∫u dv =", choices:["uv + ∫v du","u·v·du","uv − ∫v du","∫v du − uv"], answer:2, hint:"" },
      { id:"bc_38", topic:"Integration by Parts", difficulty:"Easy", question:"For ∫ x·e^x dx, a good choice is u = x and dv =", choices:["x dx","e^x dx","e^x","1 dx"], answer:1, hint:"" },
      { id:"bc_39", topic:"Integration by Parts", difficulty:"Easy", question:"In ∫ x·cos x dx, using LIATE, u should be:", choices:["cos x","1","sin x","x"], answer:3, hint:"" },
      { id:"bc_40", topic:"Integration by Parts", difficulty:"Easy", question:"For ∫ ln x dx, choose u = ln x and dv =", choices:["x dx","dx","ln x dx","1/x dx"], answer:1, hint:"" },
      { id:"bc_41", topic:"Integration by Parts", difficulty:"Medium", question:"Evaluate ∫ x·e^x dx.", choices:["x²e^x/2 + C","x·e^x − e^x + C","x·e^x + e^x + C","e^x + C"], answer:1, hint:"" },
      { id:"bc_42", topic:"Integration by Parts", difficulty:"Medium", question:"Evaluate ∫ x·cos x dx.", choices:["x·sin x − cos x + C","−x·sin x + cos x + C","sin x + C","x·sin x + cos x + C"], answer:3, hint:"" },
      { id:"bc_43", topic:"Integration by Parts", difficulty:"Medium", question:"Evaluate ∫ x·sin x dx.", choices:["x·cos x − sin x + C","−x·cos x + sin x + C","cos x + C","−x·cos x − sin x + C"], answer:1, hint:"" },
      { id:"bc_44", topic:"Integration by Parts", difficulty:"Medium", question:"Evaluate ∫ ln x dx.", choices:["x ln x + x + C","x ln x + C","x ln x − x + C","1/x + C"], answer:2, hint:"" },
      { id:"bc_45", topic:"Integration by Parts", difficulty:"Medium", question:"For ∫ x²·e^x dx, integration by parts must be applied how many times?", choices:["1","2","0","3"], answer:1, hint:"" },
      { id:"bc_46", topic:"Integration by Parts", difficulty:"Medium", question:"Evaluate ∫ x·e^(2x) dx.", choices:["(x/2)e^(2x) + (1/4)e^(2x) + C","x·e^(2x) − e^(2x) + C","(x/2)e^(2x) − (1/4)e^(2x) + C","(1/2)e^(2x) + C"], answer:2, hint:"" },
      { id:"bc_47", topic:"Integration by Parts", difficulty:"Medium", question:"In ∫ x·ln x dx, choose u = ln x, dv = x dx. Then v =", choices:["ln x","1/x","x²","x²/2"], answer:3, hint:"" },
      { id:"bc_48", topic:"Integration by Parts", difficulty:"Medium", question:"Evaluate ∫ x·ln x dx.", choices:["(x²/2)ln x + x²/4 + C","(x²/2)ln x − x²/4 + C","(x²/2)ln x + C","x²ln x − x² + C"], answer:1, hint:"" },
      { id:"bc_49", topic:"Integration by Parts", difficulty:"Hard", question:"Evaluate ∫ x²·e^x dx.", choices:["(x³/3)e^x + C","x²e^x − 2e^x + C","x²e^x + 2x·e^x + C","x²e^x − 2x·e^x + 2e^x + C"], answer:3, hint:"" },
      { id:"bc_50", topic:"Integration by Parts", difficulty:"Hard", question:"Evaluate ∫ e^x·sin x dx.", choices:["e^x·cos x + C","e^x·sin x + C","(e^x/2)(sin x − cos x) + C","(e^x/2)(sin x + cos x) + C"], answer:2, hint:"" },
      { id:"bc_51", topic:"Integration by Parts", difficulty:"Hard", question:"Evaluate ∫ arctan x dx.", choices:["x·arctan x + (1/2)ln(1 + x²) + C","arctan x + C","x·arctan x − (1/2)ln(1 + x²) + C","1/(1+x²) + C"], answer:2, hint:"" },
      { id:"bc_52", topic:"Integration by Parts", difficulty:"Hard", question:"Evaluate ∫₀¹ x·e^x dx.", choices:["2e","e","e − 1","1"], answer:3, hint:"" },
      { id:"bc_53", topic:"Integration by Parts", difficulty:"Hard", question:"Evaluate ∫ x²·ln x dx.", choices:["x³ln x − x³ + C","(x³/3)ln x − x³/9 + C","(x³/3)ln x + C","(x³/3)ln x + x³/9 + C"], answer:1, hint:"" },
      { id:"bc_54", topic:"Integration by Parts", difficulty:"Hard", question:"Evaluate ∫ arcsin x dx.", choices:["1/√(1−x²) + C","x·arcsin x + √(1 − x²) + C","arcsin x + C","x·arcsin x − √(1 − x²) + C"], answer:1, hint:"" },
    ],
  },

  integrals: {
    id: "integrals", label: "Integrals", emoji: "∫",
    color: "#1D4ED8", bg: "#EFF6FF", dark: "#1E40AF",
    tagline: "9 integration techniques · 270 problems",
    topics: [
      { name: "Improper Integrals", icon: "", color: "#2563EB", bg: "#DBEAFE" },
      { name: "U-Substitution", icon: "", color: "#7C3AED", bg: "#EDE9FE" },
      { name: "Integration by Parts", icon: "", color: "#DB2777", bg: "#FCE7F3" },
      { name: "Definite Integral Properties", icon: "", color: "#D97706", bg: "#FEF3C7" },
      { name: "Partial Fractions", icon: "", color: "#0EA5A0", bg: "#DFF7F3" },
      { name: "Long Division Techniques", icon: "", color: "#DC2626", bg: "#FEE2E2" },
      { name: "Completing the Square", icon: "", color: "#16A34A", bg: "#DCFCE7" },
      { name: "Adding Zero Technique", icon: "", color: "#0891B2", bg: "#CFFAFE" },
      { name: "Trig Substitution & Identities", icon: "", color: "#9333EA", bg: "#F3E8FF" },
    ],
    seeds: [
      { id:"intg_1", topic:"Improper Integrals", difficulty:"Easy", question:"An improper integral has at least one of these features:", choices:["a constant","two variables","a polynomial","infinite limit or discontinuity"], answer:3, hint:"" },
      { id:"intg_2", topic:"Improper Integrals", difficulty:"Easy", question:"∫₁^∞ (1/x²) dx converges to:", choices:["0","∞","1","2"], answer:2, hint:"" },
      { id:"intg_3", topic:"Improper Integrals", difficulty:"Easy", question:"∫₁^∞ (1/x) dx:", choices:["= 1","= ln 2","= 0","diverges"], answer:3, hint:"" },
      { id:"intg_4", topic:"Improper Integrals", difficulty:"Medium", question:"∫₁^∞ (1/x³) dx =", choices:["1/3","1/2","∞","1"], answer:1, hint:"" },
      { id:"intg_5", topic:"Improper Integrals", difficulty:"Medium", question:"∫₀^∞ e^(−x) dx =", choices:["e","1","0","∞"], answer:1, hint:"" },
      { id:"intg_6", topic:"Improper Integrals", difficulty:"Medium", question:"∫₀^∞ e^(−2x) dx =", choices:["2","1","1/2","∞"], answer:2, hint:"" },
      { id:"intg_7", topic:"Improper Integrals", difficulty:"Medium", question:"The p-integral ∫₁^∞ (1/x^p) dx converges when:", choices:["p < 1","p = 1","p ≥ 0","p > 1"], answer:3, hint:"" },
      { id:"intg_8", topic:"Improper Integrals", difficulty:"Medium", question:"∫₁^∞ (1/x^(1/2)) dx:", choices:["= 1","= 2","diverges","= 1/2"], answer:2, hint:"" },
      { id:"intg_9", topic:"Improper Integrals", difficulty:"Medium", question:"∫₀¹ (1/√x) dx =", choices:["1/2","1","2","∞"], answer:2, hint:"" },
      { id:"intg_10", topic:"Improper Integrals", difficulty:"Medium", question:"∫₀¹ (1/x) dx:", choices:["= 1","= 0","diverges","= ln 2"], answer:2, hint:"" },
      { id:"intg_11", topic:"Improper Integrals", difficulty:"Medium", question:"To evaluate ∫₁^∞ f dx, we compute:", choices:["the derivative","∫₁^b directly","lim(b→∞) ∫₁^b f dx","f(∞) − f(1)"], answer:2, hint:"" },
      { id:"intg_12", topic:"Improper Integrals", difficulty:"Medium", question:"∫₂^∞ (1/x²) dx =", choices:["1","2","∞","1/2"], answer:3, hint:"" },
      { id:"intg_13", topic:"Improper Integrals", difficulty:"Hard", question:"∫₀^∞ x·e^(−x) dx =", choices:["∞","2","0","1"], answer:3, hint:"" },
      { id:"intg_14", topic:"Improper Integrals", difficulty:"Hard", question:"∫₋∞^∞ e^(−x²) dx = √π. This integral is:", choices:["undefined","zero","convergent","divergent"], answer:2, hint:"" },
      { id:"intg_15", topic:"Improper Integrals", difficulty:"Hard", question:"∫₁^∞ (1/x^(3/2)) dx =", choices:["1","1/2","∞","2"], answer:3, hint:"" },
      { id:"intg_16", topic:"Improper Integrals", difficulty:"Hard", question:"∫₀^∞ (1/(1 + x²)) dx =", choices:["π","∞","π/2","1"], answer:2, hint:"" },
      { id:"intg_17", topic:"Improper Integrals", difficulty:"Hard", question:"∫₀^1 ln x dx =", choices:["1","0","−1","∞"], answer:2, hint:"" },
      { id:"intg_18", topic:"Improper Integrals", difficulty:"Hard", question:"∫₁^∞ (1/x^0.5) dx behaves how (p = 0.5 < 1)?", choices:["converges to 2","diverges","converges to 1","= 0"], answer:1, hint:"" },
      { id:"intg_19", topic:"Improper Integrals", difficulty:"Hard", question:"∫₃^∞ (1/(x − 2)²) dx =", choices:["1/2","1","∞","2"], answer:1, hint:"" },
      { id:"intg_20", topic:"Improper Integrals", difficulty:"Hard", question:"If ∫ₐ^∞ f dx = lim gives a finite number, the integral is:", choices:["undefined","improper only","divergent","convergent"], answer:3, hint:"" },
      { id:"intg_21", topic:"Improper Integrals", difficulty:"Medium", question:"∫₀^∞ e^(−x) dx represents area that is:", choices:["negative","finite","infinite","zero"], answer:1, hint:"" },
      { id:"intg_22", topic:"Improper Integrals", difficulty:"Hard", question:"∫₁^∞ (2/x³) dx =", choices:["2","1/2","1","∞"], answer:2, hint:"" },
      { id:"intg_23", topic:"Improper Integrals", difficulty:"Hard", question:"Does ∫₁^∞ (1/x) dx converge?", choices:["Yes","Only near 1","No","Yes, to 1"], answer:2, hint:"" },
      { id:"intg_24", topic:"Improper Integrals", difficulty:"Hard", question:"∫₀^4 (1/√x) dx =", choices:["2","∞","4","8"], answer:2, hint:"" },
      { id:"intg_25", topic:"Improper Integrals", difficulty:"Hard", question:"∫₀^∞ 3e^(−3x) dx =", choices:["1/3","1","3","∞"], answer:1, hint:"" },
      { id:"intg_26", topic:"Improper Integrals", difficulty:"Medium", question:"An integral with a discontinuity in the interval is improper of:", choices:["no kind","the second kind","the first kind","a definite kind"], answer:1, hint:"" },
      { id:"intg_27", topic:"Improper Integrals", difficulty:"Hard", question:"∫₅^∞ (1/x²) dx =", choices:["5","1/5","1","∞"], answer:1, hint:"" },
      { id:"intg_28", topic:"Improper Integrals", difficulty:"Hard", question:"∫₀^∞ cos x dx:", choices:["= 0","diverges","= π","= 1"], answer:1, hint:"" },
      { id:"intg_29", topic:"Improper Integrals", difficulty:"Medium", question:"∫₁^∞ (1/x⁴) dx =", choices:["∞","1/3","1/4","1"], answer:1, hint:"" },
      { id:"intg_30", topic:"Improper Integrals", difficulty:"Hard", question:"By comparison, since 1/(x²+1) ≤ 1/x², ∫₁^∞ 1/(x²+1) dx is:", choices:["undefined","convergent","divergent","zero"], answer:1, hint:"" },
      { id:"intg_31", topic:"U-Substitution", difficulty:"Easy", question:"∫ 2x(x²+1)³ dx: let u =", choices:["2x","x² + 1","x","(x²+1)³"], answer:1, hint:"" },
      { id:"intg_32", topic:"U-Substitution", difficulty:"Easy", question:"If u = x² + 1, then du =", choices:["2 dx","2x dx","dx","x dx"], answer:1, hint:"" },
      { id:"intg_33", topic:"U-Substitution", difficulty:"Easy", question:"∫ cos(x) e^(sin x) dx: let u =", choices:["cos x","x","sin x","e^(sin x)"], answer:2, hint:"" },
      { id:"intg_34", topic:"U-Substitution", difficulty:"Easy", question:"∫ (2x)/(x²+1) dx =", choices:["x²+1 + C","2 ln x + C","ln|x²+1| + C","1/(x²+1) + C"], answer:2, hint:"" },
      { id:"intg_35", topic:"U-Substitution", difficulty:"Medium", question:"∫ 2x(x²+1)³ dx =", choices:["(x²+1)³/3 + C","(x²+1)⁴ + C","(x²+1)⁴/4 + C","2(x²+1)⁴ + C"], answer:2, hint:"" },
      { id:"intg_36", topic:"U-Substitution", difficulty:"Medium", question:"∫ x·e^(x²) dx =", choices:["x²e^(x²) + C","e^(x²) + C","2e^(x²) + C","(1/2)e^(x²) + C"], answer:3, hint:"" },
      { id:"intg_37", topic:"U-Substitution", difficulty:"Medium", question:"∫ 3x²(x³+1)⁵ dx =", choices:["3(x³+1)⁶ + C","(x³+1)⁵/5 + C","(x³+1)⁶ + C","(x³+1)⁶/6 + C"], answer:3, hint:"" },
      { id:"intg_38", topic:"U-Substitution", difficulty:"Medium", question:"∫ cos(5x) dx =", choices:["sin(5x) + C","5 sin(5x) + C","(1/5)sin(5x) + C","−(1/5)sin(5x) + C"], answer:2, hint:"" },
      { id:"intg_39", topic:"U-Substitution", difficulty:"Medium", question:"∫ sin(x)cos(x) dx (u = sin x) =", choices:["(1/2)cos²x + C","sin²x + C","−cos²x + C","(1/2)sin²x + C"], answer:3, hint:"" },
      { id:"intg_40", topic:"U-Substitution", difficulty:"Medium", question:"∫ (2x+3)⁴ dx =", choices:["(2x+3)⁵ + C","(2x+3)⁵/5 + C","(2x+3)⁵/10 + C","2(2x+3)⁵ + C"], answer:2, hint:"" },
      { id:"intg_41", topic:"U-Substitution", difficulty:"Medium", question:"∫ 1/(x ln x) dx (u = ln x) =", choices:["(ln x)² + C","ln|ln x| + C","1/ln x + C","ln x + C"], answer:1, hint:"" },
      { id:"intg_42", topic:"U-Substitution", difficulty:"Medium", question:"∫ e^(3x) dx =", choices:["e^(3x)/x + C","3e^(3x) + C","(1/3)e^(3x) + C","e^(3x) + C"], answer:2, hint:"" },
      { id:"intg_43", topic:"U-Substitution", difficulty:"Medium", question:"∫ x√(x²+1) dx =", choices:["(2/3)(x²+1)^(3/2) + C","(x²+1)^(1/2) + C","(x²+1)^(3/2) + C","(1/3)(x²+1)^(3/2) + C"], answer:3, hint:"" },
      { id:"intg_44", topic:"U-Substitution", difficulty:"Medium", question:"∫ sec²(x) tan(x) dx (u = tan x) =", choices:["(1/2)sec²x + C","tan²x + C","(1/2)tan²x + C","sec²x + C"], answer:2, hint:"" },
      { id:"intg_45", topic:"U-Substitution", difficulty:"Medium", question:"∫ (ln x)/x dx (u = ln x) =", choices:["ln x + C","1/x + C","(ln x)²/2 + C","(ln x)² + C"], answer:2, hint:"" },
      { id:"intg_46", topic:"U-Substitution", difficulty:"Hard", question:"∫₀¹ 2x(x²+1)³ dx =", choices:["2","15/4","4","8"], answer:1, hint:"" },
      { id:"intg_47", topic:"U-Substitution", difficulty:"Hard", question:"∫ tan x dx =", choices:["ln|cos x| + C","sec²x + C","ln|sin x| + C","−ln|cos x| + C"], answer:3, hint:"" },
      { id:"intg_48", topic:"U-Substitution", difficulty:"Hard", question:"∫ x/(√(1−x²)) dx =", choices:["√(1−x²) + C","arcsin x + C","(1−x²)^(3/2) + C","−√(1−x²) + C"], answer:3, hint:"" },
      { id:"intg_49", topic:"U-Substitution", difficulty:"Hard", question:"∫₀^(π/2) cos x·e^(sin x) dx =", choices:["e + 1","1","e","e − 1"], answer:3, hint:"" },
      { id:"intg_50", topic:"U-Substitution", difficulty:"Hard", question:"∫ (ln x)²/x dx =", choices:["(ln x)²/2 + C","(ln x)³/3 + C","3(ln x)³ + C","(ln x)³ + C"], answer:1, hint:"" },
      { id:"intg_51", topic:"U-Substitution", difficulty:"Hard", question:"∫ x²(x³+2)⁴ dx =", choices:["(x³+2)⁵/5 + C","(x³+2)⁵ + C","3(x³+2)⁵ + C","(x³+2)⁵/15 + C"], answer:3, hint:"" },
      { id:"intg_52", topic:"U-Substitution", difficulty:"Hard", question:"∫ e^x/(e^x + 1) dx =", choices:["e^x + 1 + C","ln(e^x) + C","1/(e^x+1) + C","ln(e^x + 1) + C"], answer:3, hint:"" },
      { id:"intg_53", topic:"U-Substitution", difficulty:"Hard", question:"∫ sin³x cos x dx (u = sin x) =", choices:["−cos⁴x/4 + C","sin⁴x + C","(1/3)sin³x + C","(1/4)sin⁴x + C"], answer:3, hint:"" },
      { id:"intg_54", topic:"U-Substitution", difficulty:"Hard", question:"∫ (6x+4)/(3x²+4x) dx =", choices:["2 ln x + C","ln|3x²+4x| + C","3x²+4x + C","1/(3x²+4x) + C"], answer:1, hint:"" },
      { id:"intg_55", topic:"U-Substitution", difficulty:"Medium", question:"∫ 4x³(x⁴+1)² dx =", choices:["(x⁴+1)²/2 + C","4(x⁴+1)³ + C","(x⁴+1)³/3 + C","(x⁴+1)³ + C"], answer:2, hint:"" },
      { id:"intg_56", topic:"U-Substitution", difficulty:"Hard", question:"∫₁^e (ln x)/x dx =", choices:["e","1/2","1","0"], answer:1, hint:"" },
      { id:"intg_57", topic:"U-Substitution", difficulty:"Medium", question:"∫ (x)/(x²+4) dx =", choices:["ln(x²+4) + C","1/(x²+4) + C","(1/2)ln(x²+4) + C","2 ln x + C"], answer:2, hint:"" },
      { id:"intg_58", topic:"U-Substitution", difficulty:"Hard", question:"∫ cos³x sin x dx (u = cos x) =", choices:["sin⁴x/4 + C","(1/3)cos³x + C","(1/4)cos⁴x + C","−(1/4)cos⁴x + C"], answer:3, hint:"" },
      { id:"intg_59", topic:"U-Substitution", difficulty:"Medium", question:"∫ 2x·cos(x²) dx =", choices:["cos(x²) + C","2sin(x²) + C","−sin(x²) + C","sin(x²) + C"], answer:3, hint:"" },
      { id:"intg_60", topic:"U-Substitution", difficulty:"Hard", question:"∫ (2x−1)/(x²−x+3) dx =", choices:["1/(x²−x+3) + C","x²−x+3 + C","ln|x²−x+3| + C","2 ln x + C"], answer:2, hint:"" },
      { id:"intg_61", topic:"Integration by Parts", difficulty:"Easy", question:"∫ u dv =", choices:["u·v·du","∫v du − uv","uv + ∫v du","uv − ∫v du"], answer:3, hint:"" },
      { id:"intg_62", topic:"Integration by Parts", difficulty:"Easy", question:"∫ x·e^x dx: choose u = x, dv =", choices:["e^x","x dx","1 dx","e^x dx"], answer:3, hint:"" },
      { id:"intg_63", topic:"Integration by Parts", difficulty:"Easy", question:"LIATE: in ∫ x·cos x dx, u should be:", choices:["1","cos x","x","sin x"], answer:2, hint:"" },
      { id:"intg_64", topic:"Integration by Parts", difficulty:"Easy", question:"∫ ln x dx: choose u = ln x, dv =", choices:["1/x dx","x dx","dx","ln x dx"], answer:2, hint:"" },
      { id:"intg_65", topic:"Integration by Parts", difficulty:"Medium", question:"∫ x·e^x dx =", choices:["e^x + C","x e^x − e^x + C","x²e^x/2 + C","x e^x + e^x + C"], answer:1, hint:"" },
      { id:"intg_66", topic:"Integration by Parts", difficulty:"Medium", question:"∫ x·cos x dx =", choices:["−x sin x + cos x + C","x sin x + cos x + C","sin x + C","x sin x − cos x + C"], answer:1, hint:"" },
      { id:"intg_67", topic:"Integration by Parts", difficulty:"Medium", question:"∫ x·sin x dx =", choices:["−x cos x − sin x + C","x cos x − sin x + C","−x cos x + sin x + C","cos x + C"], answer:2, hint:"" },
      { id:"intg_68", topic:"Integration by Parts", difficulty:"Medium", question:"∫ ln x dx =", choices:["1/x + C","x ln x + C","x ln x − x + C","x ln x + x + C"], answer:2, hint:"" },
      { id:"intg_69", topic:"Integration by Parts", difficulty:"Medium", question:"∫ x·e^(2x) dx =", choices:["(1/2)e^(2x) + C","x e^(2x) − e^(2x) + C","(x/2)e^(2x) − (1/4)e^(2x) + C","(x/2)e^(2x) + (1/4)e^(2x) + C"], answer:2, hint:"" },
      { id:"intg_70", topic:"Integration by Parts", difficulty:"Medium", question:"∫ x·ln x dx: u = ln x, dv = x dx, so v =", choices:["1/x","x²/2","ln x","x²"], answer:1, hint:"" },
      { id:"intg_71", topic:"Integration by Parts", difficulty:"Medium", question:"∫ x·ln x dx =", choices:["(x²/2)ln x + C","(x²/2)ln x + x²/4 + C","(x²/2)ln x − x²/4 + C","x²ln x − x² + C"], answer:2, hint:"" },
      { id:"intg_72", topic:"Integration by Parts", difficulty:"Medium", question:"∫ x²·e^x dx requires parts applied how many times?", choices:["0","3","1","2"], answer:3, hint:"" },
      { id:"intg_73", topic:"Integration by Parts", difficulty:"Hard", question:"∫ x²·e^x dx =", choices:["x²e^x + 2xe^x + C","x²e^x − 2xe^x + 2e^x + C","(x³/3)e^x + C","x²e^x − 2e^x + C"], answer:1, hint:"" },
      { id:"intg_74", topic:"Integration by Parts", difficulty:"Hard", question:"∫ e^x·sin x dx =", choices:["e^x sin x + C","(e^x/2)(sin x + cos x) + C","(e^x/2)(sin x − cos x) + C","e^x cos x + C"], answer:2, hint:"" },
      { id:"intg_75", topic:"Integration by Parts", difficulty:"Hard", question:"∫ arctan x dx =", choices:["x arctan x + (1/2)ln(1+x²) + C","x arctan x − (1/2)ln(1+x²) + C","arctan x + C","1/(1+x²) + C"], answer:1, hint:"" },
      { id:"intg_76", topic:"Integration by Parts", difficulty:"Hard", question:"∫₀¹ x·e^x dx =", choices:["2e","1","e","e − 1"], answer:1, hint:"" },
      { id:"intg_77", topic:"Integration by Parts", difficulty:"Hard", question:"∫ x²·ln x dx =", choices:["x³ln x − x³ + C","(x³/3)ln x − x³/9 + C","(x³/3)ln x + C","(x³/3)ln x + x³/9 + C"], answer:1, hint:"" },
      { id:"intg_78", topic:"Integration by Parts", difficulty:"Hard", question:"∫ arcsin x dx =", choices:["x arcsin x − √(1−x²) + C","x arcsin x + √(1−x²) + C","arcsin x + C","1/√(1−x²) + C"], answer:1, hint:"" },
      { id:"intg_79", topic:"Integration by Parts", difficulty:"Medium", question:"∫ x·sin(2x) dx =", choices:["(x/2)cos(2x) + C","(1/2)sin(2x) + C","−x cos(2x) + C","−(x/2)cos(2x) + (1/4)sin(2x) + C"], answer:3, hint:"" },
      { id:"intg_80", topic:"Integration by Parts", difficulty:"Hard", question:"∫ e^x·cos x dx =", choices:["(e^x/2)(cos x − sin x) + C","e^x sin x + C","(e^x/2)(sin x + cos x) + C","e^x cos x + C"], answer:2, hint:"" },
      { id:"intg_81", topic:"Integration by Parts", difficulty:"Hard", question:"∫ x²·cos x dx =", choices:["2x cos x + C","x²sin x + 2 sin x + C","x²sin x + 2x cos x − 2 sin x + C","x²sin x − 2x cos x + C"], answer:2, hint:"" },
      { id:"intg_82", topic:"Integration by Parts", difficulty:"Medium", question:"∫ ln(2x) dx =", choices:["2 ln x + C","x ln(2x) − x + C","x ln(2x) + x + C","1/(2x) + C"], answer:1, hint:"" },
      { id:"intg_83", topic:"Integration by Parts", difficulty:"Hard", question:"∫ x³·ln x dx =", choices:["(x⁴/4)ln x + x⁴/16 + C","(x⁴/4)ln x − x⁴/16 + C","(x⁴/4)ln x + C","x⁴ln x − x⁴ + C"], answer:1, hint:"" },
      { id:"intg_84", topic:"Integration by Parts", difficulty:"Hard", question:"∫ x·sec²x dx =", choices:["x tan x + ln|cos x| + C","tan x + C","x tan x + C","x tan x − ln|sec x| + C"], answer:3, hint:"" },
      { id:"intg_85", topic:"Integration by Parts", difficulty:"Medium", question:"∫ x·e^(−x) dx =", choices:["−x e^(−x) + e^(−x) + C","x e^(−x) + C","−e^(−x) + C","−x e^(−x) − e^(−x) + C"], answer:3, hint:"" },
      { id:"intg_86", topic:"Integration by Parts", difficulty:"Hard", question:"∫₁^e ln x dx =", choices:["0","e − 1","1","e"], answer:2, hint:"" },
      { id:"intg_87", topic:"Integration by Parts", difficulty:"Hard", question:"∫ (ln x)² dx =", choices:["(ln x)³/3 + C","x(ln x)² − 2x ln x + 2x + C","x(ln x)² + C","2 ln x + C"], answer:1, hint:"" },
      { id:"intg_88", topic:"Integration by Parts", difficulty:"Medium", question:"In ∫ x·cos x dx, dv = cos x dx means v =", choices:["−cos x","−sin x","cos x","sin x"], answer:3, hint:"" },
      { id:"intg_89", topic:"Integration by Parts", difficulty:"Hard", question:"∫ 2x·ln x dx =", choices:["2x ln x − 2x + C","x²ln x − x²/2 + C","x²ln x + x²/2 + C","x² ln x + C"], answer:1, hint:"" },
      { id:"intg_90", topic:"Integration by Parts", difficulty:"Hard", question:"∫ x·2^x dx uses parts with u = x and dv = 2^x dx; v =", choices:["x·2^x","2^x·ln 2","2^x/ln 2","2^x"], answer:2, hint:"" },
      { id:"intg_91", topic:"Definite Integral Properties", difficulty:"Easy", question:"∫ₐ^a f(x) dx =", choices:["1","f(a)","0","∞"], answer:2, hint:"" },
      { id:"intg_92", topic:"Definite Integral Properties", difficulty:"Easy", question:"∫ₐ^b f(x) dx = ___ ∫_b^a f(x) dx", choices:["2×","+","0×","−"], answer:3, hint:"" },
      { id:"intg_93", topic:"Definite Integral Properties", difficulty:"Easy", question:"∫ₐ^b [f + g] dx =", choices:["∫f − ∫g","∫f · ∫g","∫f dx + ∫g dx","f + g"], answer:2, hint:"" },
      { id:"intg_94", topic:"Definite Integral Properties", difficulty:"Easy", question:"∫ₐ^b c·f(x) dx = c·___", choices:["1","f(a)","f(b)","∫ₐ^b f dx"], answer:3, hint:"" },
      { id:"intg_95", topic:"Definite Integral Properties", difficulty:"Medium", question:"∫₀^2 f dx = 5 and ∫₂^5 f dx = 3. Then ∫₀^5 f dx =", choices:["15","5","8","2"], answer:2, hint:"" },
      { id:"intg_96", topic:"Definite Integral Properties", difficulty:"Medium", question:"∫₀^3 f dx = 10 and ∫₀^1 f dx = 4. Then ∫₁^3 f dx =", choices:["10","6","14","4"], answer:1, hint:"" },
      { id:"intg_97", topic:"Definite Integral Properties", difficulty:"Medium", question:"By FTC, ∫ₐ^b f dx = ___ where F' = f", choices:["f(b) − f(a)","F(b) − F(a)","F(b) + F(a)","F(a) − F(b)"], answer:1, hint:"" },
      { id:"intg_98", topic:"Definite Integral Properties", difficulty:"Medium", question:"∫₋₂^2 x³ dx (odd function) =", choices:["4","8","0","16"], answer:2, hint:"" },
      { id:"intg_99", topic:"Definite Integral Properties", difficulty:"Medium", question:"∫₋₂^2 x² dx = 2·∫₀^2 x² dx because x² is:", choices:["constant","odd","linear","even"], answer:3, hint:"" },
      { id:"intg_100", topic:"Definite Integral Properties", difficulty:"Medium", question:"d/dx ∫ₐ^x f(t) dt =", choices:["F(x)","f(x)","f(a)","f'(x)"], answer:1, hint:"" },
      { id:"intg_101", topic:"Definite Integral Properties", difficulty:"Medium", question:"∫₀^4 3 dx =", choices:["7","12","3","4"], answer:1, hint:"" },
      { id:"intg_102", topic:"Definite Integral Properties", difficulty:"Medium", question:"If ∫ₐ^b f dx = 7, then ∫ₐ^b 2f dx =", choices:["9","14","3.5","7"], answer:1, hint:"" },
      { id:"intg_103", topic:"Definite Integral Properties", difficulty:"Medium", question:"∫₀^2 f dx = 6. Then ∫₂^0 f dx =", choices:["0","−6","12","6"], answer:1, hint:"" },
      { id:"intg_104", topic:"Definite Integral Properties", difficulty:"Hard", question:"d/dx ∫₀^(x²) sin t dt =", choices:["2x cos(x²)","2x sin(x²)","sin(x²)","cos(x²)"], answer:1, hint:"" },
      { id:"intg_105", topic:"Definite Integral Properties", difficulty:"Hard", question:"∫₋₃^3 (x⁵ − x) dx =", choices:["243","6","0","−6"], answer:2, hint:"" },
      { id:"intg_106", topic:"Definite Integral Properties", difficulty:"Hard", question:"If ∫₁^4 f dx = 9 and ∫₁^4 g dx = 2, then ∫₁^4 (f − 3g) dx =", choices:["6","15","11","3"], answer:3, hint:"" },
      { id:"intg_107", topic:"Definite Integral Properties", difficulty:"Hard", question:"The average value of f on [a,b] is:", choices:["∫ₐ^b f dx","f(b) − f(a)","(b−a)∫f","(1/(b−a))∫ₐ^b f dx"], answer:3, hint:"" },
      { id:"intg_108", topic:"Definite Integral Properties", difficulty:"Hard", question:"The average value of f(x) = x² on [0,3] is:", choices:["9","6","1","3"], answer:3, hint:"" },
      { id:"intg_109", topic:"Definite Integral Properties", difficulty:"Hard", question:"d/dx ∫_x^5 f(t) dt =", choices:["f(x)","f(5)","0","−f(x)"], answer:3, hint:"" },
      { id:"intg_110", topic:"Definite Integral Properties", difficulty:"Medium", question:"∫₀^1 (2x + 1) dx =", choices:["1","3","1/2","2"], answer:3, hint:"" },
      { id:"intg_111", topic:"Definite Integral Properties", difficulty:"Medium", question:"∫₀^π sin x dx =", choices:["0","π","1","2"], answer:3, hint:"" },
      { id:"intg_112", topic:"Definite Integral Properties", difficulty:"Medium", question:"∫₀^(π/2) cos x dx =", choices:["−1","1","0","π/2"], answer:1, hint:"" },
      { id:"intg_113", topic:"Definite Integral Properties", difficulty:"Hard", question:"If f is even, ∫₋₂^2 f dx = 2·∫₀^2 f dx. If ∫₀^2 f = 5, then ∫₋₂^2 f =", choices:["2.5","5","0","10"], answer:3, hint:"" },
      { id:"intg_114", topic:"Definite Integral Properties", difficulty:"Hard", question:"∫₀^2 f dx + ∫₂^2 f dx =", choices:["2∫₀^2 f dx","∫₀^2 f dx","∫₀^4 f dx","0"], answer:1, hint:"" },
      { id:"intg_115", topic:"Definite Integral Properties", difficulty:"Medium", question:"∫₁^3 x dx =", choices:["2","9/2","3","4"], answer:3, hint:"" },
      { id:"intg_116", topic:"Definite Integral Properties", difficulty:"Hard", question:"d/dx ∫₀^(sin x) t² dt =", choices:["cos x","sin²x","sin²x · cos x","sin³x/3"], answer:2, hint:"" },
      { id:"intg_117", topic:"Definite Integral Properties", difficulty:"Hard", question:"∫₀^2 |x − 1| dx =", choices:["4","1","0","2"], answer:1, hint:"" },
      { id:"intg_118", topic:"Definite Integral Properties", difficulty:"Medium", question:"∫₂^2 (x³ + 5x) dx =", choices:["undefined","10","2","0"], answer:3, hint:"" },
      { id:"intg_119", topic:"Definite Integral Properties", difficulty:"Hard", question:"If ∫₀^b f dx = 0 for f > 0 somewhere, what must be true?", choices:["impossible","f < 0 elsewhere to cancel","b = 0","f = 0 always"], answer:1, hint:"" },
      { id:"intg_120", topic:"Definite Integral Properties", difficulty:"Medium", question:"∫₀^1 x² dx =", choices:["1","1/2","3","1/3"], answer:3, hint:"" },
      { id:"intg_121", topic:"Partial Fractions", difficulty:"Easy", question:"Partial fractions decompose a rational function into:", choices:["a product","a sum of simpler fractions","a single fraction","a polynomial only"], answer:1, hint:"" },
      { id:"intg_122", topic:"Partial Fractions", difficulty:"Easy", question:"1/((x−1)(x+1)) = A/(x−1) + B/(x+1). This setup is:", choices:["integration by parts","partial fraction decomposition","long division","u-substitution"], answer:1, hint:"" },
      { id:"intg_123", topic:"Partial Fractions", difficulty:"Medium", question:"For 1/((x−1)(x+1)), the value of A (at x=1) is:", choices:["−1/2","2","1","1/2"], answer:3, hint:"" },
      { id:"intg_124", topic:"Partial Fractions", difficulty:"Medium", question:"For 1/((x−1)(x+1)), the value of B (at x=−1) is:", choices:["1/2","−1/2","−1","1"], answer:1, hint:"" },
      { id:"intg_125", topic:"Partial Fractions", difficulty:"Medium", question:"∫ 1/((x−1)(x+1)) dx = (1/2)ln|x−1| − (1/2)ln|x+1| + C. This came from:", choices:["completing square","partial fractions","parts","trig sub"], answer:1, hint:"" },
      { id:"intg_126", topic:"Partial Fractions", difficulty:"Medium", question:"Decompose: 5/((x)(x−5)) = A/x + B/(x−5). A =", choices:["1","−1","5","−5"], answer:1, hint:"" },
      { id:"intg_127", topic:"Partial Fractions", difficulty:"Medium", question:"Before partial fractions, the degree of numerator must be:", choices:["greater","equal","any","less than denominator"], answer:3, hint:"" },
      { id:"intg_128", topic:"Partial Fractions", difficulty:"Medium", question:"If numerator degree ≥ denominator degree, first do:", choices:["substitution","parts","trig sub","long division"], answer:3, hint:"" },
      { id:"intg_129", topic:"Partial Fractions", difficulty:"Medium", question:"∫ 1/(x² − 1) dx =", choices:["ln|x²−1| + C","arctan x + C","(1/2)ln|(x−1)/(x+1)| + C","1/(x²−1) + C"], answer:2, hint:"" },
      { id:"intg_130", topic:"Partial Fractions", difficulty:"Medium", question:"For a repeated factor (x−2)², the decomposition includes:", choices:["A/(x−2)²  only","A/(x−2) + B/(x−2)²","A(x−2)","A/(x−2) only"], answer:1, hint:"" },
      { id:"intg_131", topic:"Partial Fractions", difficulty:"Medium", question:"3/((x+1)(x+2)) = A/(x+1) + B/(x+2). A =", choices:["−3","1","2","3"], answer:3, hint:"" },
      { id:"intg_132", topic:"Partial Fractions", difficulty:"Medium", question:"3/((x+1)(x+2)): B =", choices:["3","2","−3","1"], answer:2, hint:"" },
      { id:"intg_133", topic:"Partial Fractions", difficulty:"Hard", question:"∫ (x+7)/((x−1)(x+3)) dx uses A/(x−1)+B/(x+3). A =", choices:["1","2","−1","3"], answer:1, hint:"" },
      { id:"intg_134", topic:"Partial Fractions", difficulty:"Hard", question:"For x/((x−1)(x−2)), A (at x=1) =", choices:["−2","2","1","−1"], answer:3, hint:"" },
      { id:"intg_135", topic:"Partial Fractions", difficulty:"Hard", question:"For x/((x−1)(x−2)), B (at x=2) =", choices:["−1","1","2","−2"], answer:2, hint:"" },
      { id:"intg_136", topic:"Partial Fractions", difficulty:"Medium", question:"An irreducible quadratic factor x²+1 gets a numerator of the form:", choices:["Ax","Ax + B","A","A/x"], answer:1, hint:"" },
      { id:"intg_137", topic:"Partial Fractions", difficulty:"Hard", question:"∫ 1/(x(x+1)) dx =", choices:["arctan x + C","ln|x(x+1)| + C","1/(x(x+1)) + C","ln|x/(x+1)| + C"], answer:3, hint:"" },
      { id:"intg_138", topic:"Partial Fractions", difficulty:"Hard", question:"2/((x−2)(x+2)) = A/(x−2)+B/(x+2). A =", choices:["2","−1/2","1/2","1"], answer:2, hint:"" },
      { id:"intg_139", topic:"Partial Fractions", difficulty:"Medium", question:"The 'cover-up' method quickly finds:", choices:["the derivative","the constants A, B","the roots","the integral value"], answer:1, hint:"" },
      { id:"intg_140", topic:"Partial Fractions", difficulty:"Hard", question:"Decompose (3x+1)/(x²+x): factor denom = x(x+1). A (at x=0) =", choices:["2","−1","1","3"], answer:2, hint:"" },
      { id:"intg_141", topic:"Partial Fractions", difficulty:"Hard", question:"∫ (2x)/((x−1)(x+1)) dx =", choices:["2 arctan x + C","(1/2)ln|x²−1| + C","ln|x²−1| + C","ln|x−1| + C"], answer:2, hint:"" },
      { id:"intg_142", topic:"Partial Fractions", difficulty:"Medium", question:"4/((x)(x−4)) = A/x + B/(x−4). B =", choices:["−1","−4","1","4"], answer:2, hint:"" },
      { id:"intg_143", topic:"Partial Fractions", difficulty:"Hard", question:"For 1/(x²(x−1)), the decomposition form is:", choices:["A/x²(x−1)","A/x² + B/(x−1)","A/x + B/x² + C/(x−1)","A/x + B/(x−1)"], answer:2, hint:"" },
      { id:"intg_144", topic:"Partial Fractions", difficulty:"Hard", question:"∫ 5/((x−2)(x+3)) dx involves A=1, B=−1. The result is:", choices:["5 ln|x−2| + C","ln|x²+x−6| + C","arctan + C","ln|(x−2)/(x+3)| + C"], answer:3, hint:"" },
      { id:"intg_145", topic:"Partial Fractions", difficulty:"Medium", question:"Partial fractions is most useful before integrating:", choices:["polynomials","rational functions","exponentials","trig functions"], answer:1, hint:"" },
      { id:"intg_146", topic:"Partial Fractions", difficulty:"Hard", question:"(x−1)/((x+1)(x+2)): A (at x=−1) =", choices:["2","1","−1","−2"], answer:3, hint:"" },
      { id:"intg_147", topic:"Partial Fractions", difficulty:"Hard", question:"(x−1)/((x+1)(x+2)): B (at x=−2) =", choices:["2","1","3","−3"], answer:2, hint:"" },
      { id:"intg_148", topic:"Partial Fractions", difficulty:"Medium", question:"6/((x−1)(x+2)) = A/(x−1)+B/(x+2). A =", choices:["3","2","−2","6"], answer:1, hint:"" },
      { id:"intg_149", topic:"Partial Fractions", difficulty:"Hard", question:"∫ 1/((x−3)(x−1)) dx = (1/2)ln|(x−3)/(x−1)| + C uses:", choices:["long division","partial fractions","parts","trig sub"], answer:1, hint:"" },
      { id:"intg_150", topic:"Partial Fractions", difficulty:"Medium", question:"A proper rational function has numerator degree:", choices:["= 0","= denominator","< denominator degree","> denominator"], answer:2, hint:"" },
      { id:"intg_151", topic:"Long Division Techniques", difficulty:"Easy", question:"When the numerator degree ≥ denominator degree, first use:", choices:["partial fractions","trig sub","u-substitution","polynomial long division"], answer:3, hint:"" },
      { id:"intg_152", topic:"Long Division Techniques", difficulty:"Easy", question:"Divide: (x² + 3x + 2)/(x + 1). Quotient is:", choices:["x + 3","x − 2","x + 2","x + 1"], answer:2, hint:"" },
      { id:"intg_153", topic:"Long Division Techniques", difficulty:"Medium", question:"Divide: (x² − 1)/(x − 1). Result:", choices:["x − 1","x + 1","x + 2","x"], answer:1, hint:"" },
      { id:"intg_154", topic:"Long Division Techniques", difficulty:"Medium", question:"∫ (x²)/(x+1) dx: after long division, x²/(x+1) =", choices:["x² − 1","x + 1","x + 1/(x+1)","x − 1 + 1/(x+1)"], answer:3, hint:"" },
      { id:"intg_155", topic:"Long Division Techniques", difficulty:"Medium", question:"Divide (x³)/(x−1): the quotient starts with:", choices:["x","1","x³","x²"], answer:3, hint:"" },
      { id:"intg_156", topic:"Long Division Techniques", difficulty:"Medium", question:"(2x² + x)/(x): simplifies to:", choices:["2x² + 1","2x","2x + 1","x + 1"], answer:2, hint:"" },
      { id:"intg_157", topic:"Long Division Techniques", difficulty:"Medium", question:"∫ (x+3)/(x+1) dx: rewrite (x+3)/(x+1) =", choices:["1 − 2/(x+1)","x + 2","1 + 2/(x+1)","1 + 3/(x+1)"], answer:2, hint:"" },
      { id:"intg_158", topic:"Long Division Techniques", difficulty:"Medium", question:"Long division of (x² + 2x + 1)/(x + 1) gives quotient:", choices:["x + 2","x","x + 1","x − 1"], answer:2, hint:"" },
      { id:"intg_159", topic:"Long Division Techniques", difficulty:"Medium", question:"∫ (x²+1)/(x) dx = ∫(x + 1/x) dx =", choices:["ln|x| + C","x² + ln x + C","x²/2 + ln|x| + C","x²/2 + C"], answer:2, hint:"" },
      { id:"intg_160", topic:"Long Division Techniques", difficulty:"Medium", question:"(3x² − 2x)/(x): equals:", choices:["3x","3x − 2","3x² − 2","x − 2"], answer:1, hint:"" },
      { id:"intg_161", topic:"Long Division Techniques", difficulty:"Hard", question:"∫ (x²)/(x+1) dx =", choices:["x²/2 + ln|x+1| + C","ln|x+1| + C","x²/2 − x + ln|x+1| + C","x² − x + C"], answer:2, hint:"" },
      { id:"intg_162", topic:"Long Division Techniques", difficulty:"Hard", question:"Divide (x³ − 1)/(x − 1). Quotient:", choices:["x² − x + 1","x² + x + 1","x² − 1","x² + 1"], answer:1, hint:"" },
      { id:"intg_163", topic:"Long Division Techniques", difficulty:"Hard", question:"∫ (x³)/(x²+1) dx: long division gives x³/(x²+1) =", choices:["x + x/(x²+1)","x + 1","x²","x − x/(x²+1)"], answer:3, hint:"" },
      { id:"intg_164", topic:"Long Division Techniques", difficulty:"Hard", question:"(x² + 5x + 6)/(x + 2) simplifies to:", choices:["x + 6","x + 3","x + 2","x − 3"], answer:1, hint:"" },
      { id:"intg_165", topic:"Long Division Techniques", difficulty:"Hard", question:"∫ (2x² + 3)/(x) dx =", choices:["2x + 3 ln x + C","x² + C","x² + 3 ln|x| + C","x²/2 + 3 ln x"], answer:2, hint:"" },
      { id:"intg_166", topic:"Long Division Techniques", difficulty:"Medium", question:"The remainder in (x² + 1)/(x − 1) long division is:", choices:["−1","0","1","2"], answer:3, hint:"" },
      { id:"intg_167", topic:"Long Division Techniques", difficulty:"Hard", question:"∫ (x² − 4)/(x − 2) dx = ∫(x + 2) dx =", choices:["(x−2)² + C","x²/2 + 2x + C","x² + 2x + C","x²/2 + C"], answer:1, hint:"" },
      { id:"intg_168", topic:"Long Division Techniques", difficulty:"Medium", question:"(4x³ + 2x)/(2x) =", choices:["x² + 1","2x² + 1","2x²","4x² + 1"], answer:1, hint:"" },
      { id:"intg_169", topic:"Long Division Techniques", difficulty:"Hard", question:"Divide (2x² + 3x − 2)/(x + 2). Quotient:", choices:["x − 1","2x − 2","2x + 1","2x − 1"], answer:3, hint:"" },
      { id:"intg_170", topic:"Long Division Techniques", difficulty:"Hard", question:"∫ (x² + x)/(x + 1) dx = ∫ x dx =", choices:["ln|x+1| + C","x²/2 + C","x² + C","x + C"], answer:1, hint:"" },
      { id:"intg_171", topic:"Long Division Techniques", difficulty:"Medium", question:"Before integrating (x³+x)/(x²+1), use long division to get:", choices:["x²","x³","x + [remainder]/(x²+1)","1/(x²+1)"], answer:2, hint:"" },
      { id:"intg_172", topic:"Long Division Techniques", difficulty:"Hard", question:"(x³ + x)/(x²+1) simplifies to:", choices:["x²","x + 1","x + 1/(x²+1)","x"], answer:3, hint:"" },
      { id:"intg_173", topic:"Long Division Techniques", difficulty:"Medium", question:"When you divide and get quotient q(x) + r/d(x), you integrate:", choices:["only q(x)","the product","only r/d(x)","each piece separately"], answer:3, hint:"" },
      { id:"intg_174", topic:"Long Division Techniques", difficulty:"Hard", question:"∫ (x³)/(x²+1) dx =", choices:["ln(x²+1) + C","x² + ln(x²+1) + C","x²/2 − (1/2)ln(x²+1) + C","x²/2 + (1/2)ln(x²+1) + C"], answer:2, hint:"" },
      { id:"intg_175", topic:"Long Division Techniques", difficulty:"Medium", question:"(6x² − 3x)/(3x) =", choices:["2x² − 1","2x","2x − 1","x − 1"], answer:2, hint:"" },
      { id:"intg_176", topic:"Long Division Techniques", difficulty:"Hard", question:"Divide (x² + 4x + 4)/(x + 2). Quotient and remainder:", choices:["x, r 4","x + 4, r 0","x + 2, r 4","x + 2, r 0"], answer:3, hint:"" },
      { id:"intg_177", topic:"Long Division Techniques", difficulty:"Hard", question:"∫ (x² − 1)/(x + 1) dx = ∫(x − 1) dx =", choices:["x²/2 + x + C","x²/2 − x + C","x² − x + C","(x−1)² + C"], answer:1, hint:"" },
      { id:"intg_178", topic:"Long Division Techniques", difficulty:"Medium", question:"The improper (top-heavy) fraction (x²+1)/x becomes:", choices:["x² + 1","1 + 1/x","x + x","x + 1/x"], answer:3, hint:"" },
      { id:"intg_179", topic:"Long Division Techniques", difficulty:"Hard", question:"Divide (3x³ − 2x² + x)/(x). Result:", choices:["3x³ − 2x","3x² − 2x","3x² − 2x + 1","x² − 2x + 1"], answer:2, hint:"" },
      { id:"intg_180", topic:"Long Division Techniques", difficulty:"Medium", question:"Long division is needed when the rational function is:", choices:["proper","a polynomial","already simple","improper (top-heavy)"], answer:3, hint:"" },
      { id:"intg_181", topic:"Completing the Square", difficulty:"Easy", question:"Complete the square: x² + 6x = (x + 3)² − ?", choices:["6","9","3","36"], answer:1, hint:"" },
      { id:"intg_182", topic:"Completing the Square", difficulty:"Easy", question:"x² + 4x + ? is a perfect square. The blank is:", choices:["8","4","2","16"], answer:1, hint:"" },
      { id:"intg_183", topic:"Completing the Square", difficulty:"Easy", question:"x² − 10x + ? is a perfect square. The blank:", choices:["10","25","5","100"], answer:1, hint:"" },
      { id:"intg_184", topic:"Completing the Square", difficulty:"Medium", question:"Rewrite x² + 6x + 13 by completing the square:", choices:["(x+3)² + 13","(x+3)² + 4","(x+6)² + 13","(x+3)² − 4"], answer:1, hint:"" },
      { id:"intg_185", topic:"Completing the Square", difficulty:"Medium", question:"∫ 1/(x² + 6x + 13) dx uses completing the square to get denominator:", choices:["(x+3)² − 4","x² + 4","(x+3)²","(x+3)² + 4"], answer:3, hint:"" },
      { id:"intg_186", topic:"Completing the Square", difficulty:"Medium", question:"x² − 4x + 7 = (x − 2)² + ?", choices:["−3","7","3","4"], answer:2, hint:"" },
      { id:"intg_187", topic:"Completing the Square", difficulty:"Medium", question:"∫ 1/(x² + 4) dx =", choices:["arctan x + C","(1/2)arctan(x/2) + C","arctan(x/2) + C","(1/2)ln(x²+4) + C"], answer:1, hint:"" },
      { id:"intg_188", topic:"Completing the Square", difficulty:"Medium", question:"To integrate 1/(x²+2x+5), complete the square: x²+2x+5 =", choices:["(x+2)² + 5","(x+1)²","(x+1)² − 4","(x+1)² + 4"], answer:3, hint:"" },
      { id:"intg_189", topic:"Completing the Square", difficulty:"Medium", question:"∫ 1/((x+1)² + 4) dx =", choices:["arctan((x+1)/2) + C","arctan(x+1) + C","(1/2)ln((x+1)²+4) + C","(1/2)arctan((x+1)/2) + C"], answer:3, hint:"" },
      { id:"intg_190", topic:"Completing the Square", difficulty:"Medium", question:"x² + 8x + 20 = (x + 4)² + ?", choices:["16","−4","20","4"], answer:3, hint:"" },
      { id:"intg_191", topic:"Completing the Square", difficulty:"Medium", question:"x² − 6x + 10 = (x − 3)² + ?", choices:["−1","10","1","9"], answer:2, hint:"" },
      { id:"intg_192", topic:"Completing the Square", difficulty:"Hard", question:"∫ 1/(x² − 4x + 8) dx: denominator = (x−2)²+4, so integral =", choices:["arctan((x−2)/2) + C","arctan(x−2) + C","(1/2)arctan((x−2)/2) + C","(1/2)ln + C"], answer:2, hint:"" },
      { id:"intg_193", topic:"Completing the Square", difficulty:"Hard", question:"∫ 1/√(4 − x²) dx =", choices:["arcsin x + C","(1/2)arcsin(x/2) + C","arcsin(x/2) + C","arctan(x/2) + C"], answer:2, hint:"" },
      { id:"intg_194", topic:"Completing the Square", difficulty:"Medium", question:"2x² + 8x: factor out 2 first: 2(x² + 4x) = 2((x+2)² − ?)", choices:["16","2","4","8"], answer:2, hint:"" },
      { id:"intg_195", topic:"Completing the Square", difficulty:"Hard", question:"x² + 3x + 5 = (x + 3/2)² + ?", choices:["9/4","11/4","3/2","5"], answer:1, hint:"" },
      { id:"intg_196", topic:"Completing the Square", difficulty:"Hard", question:"∫ 1/(x²+2x+2) dx = arctan(x+1) + C because x²+2x+2 =", choices:["(x+1)² − 1","(x+1)²","(x+1)² + 1","(x+2)² + 2"], answer:2, hint:"" },
      { id:"intg_197", topic:"Completing the Square", difficulty:"Medium", question:"Completing the square is useful for integrals resembling:", choices:["exponentials","trig products","polynomials","1/(quadratic) or 1/√(quadratic)"], answer:3, hint:"" },
      { id:"intg_198", topic:"Completing the Square", difficulty:"Hard", question:"∫ 1/√(x² + 6x + 13) dx: rewrite radicand as:", choices:["x² + 4","(x+3)² − 4","(x+3)² + 4","(x+3)²"], answer:2, hint:"" },
      { id:"intg_199", topic:"Completing the Square", difficulty:"Medium", question:"x² − 2x = (x − 1)² − ?", choices:["−1","0","1","2"], answer:2, hint:"" },
      { id:"intg_200", topic:"Completing the Square", difficulty:"Hard", question:"∫ 1/(9 + (x−1)²) dx =", choices:["(1/3)ln + C","arctan(x−1) + C","(1/3)arctan((x−1)/3) + C","arctan((x−1)/3) + C"], answer:2, hint:"" },
      { id:"intg_201", topic:"Completing the Square", difficulty:"Medium", question:"x² + 10x + 30 = (x+5)² + ?", choices:["−5","5","25","30"], answer:1, hint:"" },
      { id:"intg_202", topic:"Completing the Square", difficulty:"Hard", question:"To integrate 1/√(−x²+4x), complete the square: −x²+4x = 4 − (x−2)². Integral form:", choices:["ln + C","arcsin((x−2)/2) + C","arcsin(x−2)","arctan((x−2)/2)"], answer:1, hint:"" },
      { id:"intg_203", topic:"Completing the Square", difficulty:"Medium", question:"x² − 8x + 20 = (x − 4)² + ?", choices:["−4","20","16","4"], answer:3, hint:"" },
      { id:"intg_204", topic:"Completing the Square", difficulty:"Hard", question:"∫ 1/(x²−6x+13) dx: (x−3)²+4 gives:", choices:["ln + C","(1/2)arctan((x−3)/2) + C","arctan((x−3)/2) + C","arctan(x−3)"], answer:1, hint:"" },
      { id:"intg_205", topic:"Completing the Square", difficulty:"Medium", question:"The constant added to complete x² + bx is:", choices:["b²","b/2","(b/2)²","2b"], answer:2, hint:"" },
      { id:"intg_206", topic:"Completing the Square", difficulty:"Hard", question:"x² + 5x + 4 = (x + 5/2)² − ?", choices:["5/2","9/4","4","25/4"], answer:1, hint:"" },
      { id:"intg_207", topic:"Completing the Square", difficulty:"Medium", question:"∫ 1/(x²+1) dx = arctan x + C. For x²+9 it's:", choices:["arctan(3x)","(1/3)arctan(x/3) + C","arctan(x/3) + C","(1/3)ln + C"], answer:1, hint:"" },
      { id:"intg_208", topic:"Completing the Square", difficulty:"Hard", question:"∫ 1/√(1 − (x+2)²) dx =", choices:["(1/2)arcsin(x+2)","arcsin(x+2) + C","arccos(x+2)","arctan(x+2) + C"], answer:1, hint:"" },
      { id:"intg_209", topic:"Completing the Square", difficulty:"Medium", question:"(x + 4)² expands to x² + 8x + ?", choices:["32","4","8","16"], answer:3, hint:"" },
      { id:"intg_210", topic:"Completing the Square", difficulty:"Hard", question:"∫ 1/(4x² + 1) dx =", choices:["arctan(x/2)","(1/2)arctan(2x) + C","arctan(2x) + C","(1/2)ln + C"], answer:1, hint:"" },
      { id:"intg_211", topic:"Adding Zero Technique", difficulty:"Easy", question:"The 'add and subtract' trick means adding a term and subtracting it, effectively adding:", choices:["a constant","one","the answer","zero"], answer:3, hint:"" },
      { id:"intg_212", topic:"Adding Zero Technique", difficulty:"Medium", question:"To integrate x/(x+1), rewrite x as (x+1) − 1. Then x/(x+1) =", choices:["x − 1","1/(x+1)","1 − 1/(x+1)","1 + 1/(x+1)"], answer:2, hint:"" },
      { id:"intg_213", topic:"Adding Zero Technique", difficulty:"Medium", question:"∫ x/(x+1) dx =", choices:["x²/2 + C","x + ln|x+1| + C","ln|x+1| + C","x − ln|x+1| + C"], answer:3, hint:"" },
      { id:"intg_214", topic:"Adding Zero Technique", difficulty:"Medium", question:"Rewrite (x+2)/(x+1) by adding zero: = 1 + ?/(x+1)", choices:["−1","x","1","2"], answer:2, hint:"" },
      { id:"intg_215", topic:"Adding Zero Technique", difficulty:"Medium", question:"∫ (x+2)/(x+1) dx =", choices:["ln|x+1| + C","x − ln|x+1| + C","x + ln|x+1| + C","x² + C"], answer:2, hint:"" },
      { id:"intg_216", topic:"Adding Zero Technique", difficulty:"Medium", question:"To integrate x/(x−3), write x = (x−3) + 3. Then =", choices:["3/(x−3)","1 − 3/(x−3)","1 + 3/(x−3)","x + 3"], answer:2, hint:"" },
      { id:"intg_217", topic:"Adding Zero Technique", difficulty:"Medium", question:"∫ x/(x−3) dx =", choices:["x²/2 + C","x + 3 ln|x−3| + C","x − 3 ln|x−3| + C","3 ln|x−3| + C"], answer:1, hint:"" },
      { id:"intg_218", topic:"Adding Zero Technique", difficulty:"Hard", question:"For ∫ x²/(x²+1) dx, write x² = (x²+1) − 1. Then integrand =", choices:["1/(x²+1)","1 + 1/(x²+1)","1 − 1/(x²+1)","x² − 1"], answer:2, hint:"" },
      { id:"intg_219", topic:"Adding Zero Technique", difficulty:"Hard", question:"∫ x²/(x²+1) dx =", choices:["x + arctan x + C","x²/2 + C","arctan x + C","x − arctan x + C"], answer:3, hint:"" },
      { id:"intg_220", topic:"Adding Zero Technique", difficulty:"Medium", question:"(x−1)/(x+1): rewrite (x−1) = (x+1) − 2. Then =", choices:["2/(x+1)","x − 2","1 − 2/(x+1)","1 + 2/(x+1)"], answer:2, hint:"" },
      { id:"intg_221", topic:"Adding Zero Technique", difficulty:"Hard", question:"∫ (x−1)/(x+1) dx =", choices:["x² + C","x − 2 ln|x+1| + C","ln|x+1| + C","x + 2 ln|x+1| + C"], answer:1, hint:"" },
      { id:"intg_222", topic:"Adding Zero Technique", difficulty:"Medium", question:"The point of adding zero is to create a form that is:", choices:["longer","exact","undefined","easier to integrate"], answer:3, hint:"" },
      { id:"intg_223", topic:"Adding Zero Technique", difficulty:"Hard", question:"∫ x/(x²+1) can also be done by u-sub, but x²/(x²+1) needs:", choices:["trig sub","adding zero (split off 1)","long division only","parts"], answer:1, hint:"" },
      { id:"intg_224", topic:"Adding Zero Technique", difficulty:"Medium", question:"Rewrite 2x/(x+1) = 2·[(x+1)−1]/(x+1) = 2 − ?/(x+1)", choices:["x","1","2","−2"], answer:2, hint:"" },
      { id:"intg_225", topic:"Adding Zero Technique", difficulty:"Hard", question:"∫ 2x/(x+1) dx =", choices:["2 ln|x+1| + C","2x − 2 ln|x+1| + C","x² + C","2x + 2 ln|x+1| + C"], answer:1, hint:"" },
      { id:"intg_226", topic:"Adding Zero Technique", difficulty:"Medium", question:"Adding zero is a form of algebraic:", choices:["factoring only","substitution by parts","differentiation","rewriting"], answer:3, hint:"" },
      { id:"intg_227", topic:"Adding Zero Technique", difficulty:"Hard", question:"∫ x³/(x²+1) dx: split x³ = x(x²+1) − x, giving ∫x dx − ∫x/(x²+1) dx =", choices:["x² − ln(x²+1) + C","ln(x²+1) + C","x²/2 − (1/2)ln(x²+1) + C","x²/2 + (1/2)ln(x²+1) + C"], answer:2, hint:"" },
      { id:"intg_228", topic:"Adding Zero Technique", difficulty:"Medium", question:"(3x)/(x−2) = 3·[(x−2)+2]/(x−2) = 3 + ?/(x−2)", choices:["3","6","−6","2"], answer:1, hint:"" },
      { id:"intg_229", topic:"Adding Zero Technique", difficulty:"Hard", question:"∫ 3x/(x−2) dx =", choices:["3x − 6 ln|x−2| + C","6 ln|x−2| + C","3 ln|x−2| + C","3x + 6 ln|x−2| + C"], answer:3, hint:"" },
      { id:"intg_230", topic:"Adding Zero Technique", difficulty:"Medium", question:"To split (x+5)/(x+2): x+5 = (x+2) + 3, so =", choices:["1 − 3/(x+2)","1 + 3/(x+2)","3/(x+2)","x + 3"], answer:1, hint:"" },
      { id:"intg_231", topic:"Adding Zero Technique", difficulty:"Hard", question:"∫ (x+5)/(x+2) dx =", choices:["3 ln|x+2| + C","x − 3 ln|x+2| + C","x² + C","x + 3 ln|x+2| + C"], answer:3, hint:"" },
      { id:"intg_232", topic:"Adding Zero Technique", difficulty:"Medium", question:"Adding zero helps rewrite improper rational expressions without full:", choices:["factoring","substitution","long division","integration by parts"], answer:2, hint:"" },
      { id:"intg_233", topic:"Adding Zero Technique", difficulty:"Hard", question:"∫ x²/(x−1) dx: x² = (x−1)(x+1) + 1, so integrand = x + 1 + 1/(x−1). Integral =", choices:["x²/2 + ln|x−1| + C","x + ln|x−1| + C","x²/2 + x + ln|x−1| + C","x² + x + C"], answer:2, hint:"" },
      { id:"intg_234", topic:"Adding Zero Technique", difficulty:"Medium", question:"The technique 'add and subtract the same quantity' preserves:", choices:["the sign","the value of the expression","the derivative only","nothing"], answer:1, hint:"" },
      { id:"intg_235", topic:"Adding Zero Technique", difficulty:"Hard", question:"∫ x/(2x+1) dx: x = (1/2)(2x+1) − 1/2. Integral =", choices:["ln|2x+1| + C","x²/2 + C","(x/2) − (1/4)ln|2x+1| + C","(x/2) + (1/4)ln|2x+1| + C"], answer:2, hint:"" },
      { id:"intg_236", topic:"Adding Zero Technique", difficulty:"Medium", question:"Rewrite (4x)/(x+3): 4x = 4(x+3) − 12, so =", choices:["12/(x+3)","4x − 12","4 − 12/(x+3)","4 + 12/(x+3)"], answer:2, hint:"" },
      { id:"intg_237", topic:"Adding Zero Technique", difficulty:"Hard", question:"∫ 4x/(x+3) dx =", choices:["4 ln|x+3| + C","12 ln|x+3| + C","4x + 12 ln|x+3| + C","4x − 12 ln|x+3| + C"], answer:3, hint:"" },
      { id:"intg_238", topic:"Adding Zero Technique", difficulty:"Medium", question:"When you write x = (x+a) − a, you have added and subtracted:", choices:["1","a","x","0 literally"], answer:1, hint:"" },
      { id:"intg_239", topic:"Adding Zero Technique", difficulty:"Hard", question:"∫ (2x−3)/(x−1) dx: 2x−3 = 2(x−1) − 1, integral =", choices:["2 ln|x−1| + C","2x − ln|x−1| + C","ln|x−1| + C","2x + ln|x−1| + C"], answer:1, hint:"" },
      { id:"intg_240", topic:"Adding Zero Technique", difficulty:"Medium", question:"The 'adding zero' and 'long division' methods both handle:", choices:["trig integrals","top-heavy rational functions","radicals","exponentials"], answer:1, hint:"" },
      { id:"intg_241", topic:"Trig Substitution & Identities", difficulty:"Easy", question:"For √(a² − x²), the substitution is x =", choices:["a sec θ","a cos θ","a sin θ","a tan θ"], answer:2, hint:"" },
      { id:"intg_242", topic:"Trig Substitution & Identities", difficulty:"Easy", question:"For √(a² + x²), substitute x =", choices:["a cos θ","a sec θ","a sin θ","a tan θ"], answer:3, hint:"" },
      { id:"intg_243", topic:"Trig Substitution & Identities", difficulty:"Easy", question:"For √(x² − a²), substitute x =", choices:["a sin θ","a tan θ","a cos θ","a sec θ"], answer:3, hint:"" },
      { id:"intg_244", topic:"Trig Substitution & Identities", difficulty:"Easy", question:"The identity sin²θ + cos²θ =", choices:["sin 2θ","0","2","1"], answer:3, hint:"" },
      { id:"intg_245", topic:"Trig Substitution & Identities", difficulty:"Medium", question:"1 + tan²θ =", choices:["csc²θ","cos²θ","sec²θ","1"], answer:2, hint:"" },
      { id:"intg_246", topic:"Trig Substitution & Identities", difficulty:"Medium", question:"∫ 1/√(1 − x²) dx =", choices:["arcsec x + C","arcsin x + C","−arcsin x + C","arctan x + C"], answer:1, hint:"" },
      { id:"intg_247", topic:"Trig Substitution & Identities", difficulty:"Medium", question:"∫ 1/(1 + x²) dx =", choices:["ln(1+x²) + C","arcsin x + C","arcsec x + C","arctan x + C"], answer:3, hint:"" },
      { id:"intg_248", topic:"Trig Substitution & Identities", difficulty:"Medium", question:"For ∫ √(4 − x²) dx, substitute x =", choices:["2 sec θ","4 sin θ","2 sin θ","2 tan θ"], answer:2, hint:"" },
      { id:"intg_249", topic:"Trig Substitution & Identities", difficulty:"Medium", question:"sin²θ = (1 − cos 2θ)/? (power reduction):", choices:["4","2","3","1"], answer:1, hint:"" },
      { id:"intg_250", topic:"Trig Substitution & Identities", difficulty:"Medium", question:"cos²θ = (1 + cos 2θ)/?", choices:["1","4","2","3"], answer:2, hint:"" },
      { id:"intg_251", topic:"Trig Substitution & Identities", difficulty:"Medium", question:"∫ sin²x dx = x/2 − (sin 2x)/4 + C uses:", choices:["parts","trig sub","power reduction identity","u-sub"], answer:2, hint:"" },
      { id:"intg_252", topic:"Trig Substitution & Identities", difficulty:"Medium", question:"For √(x² + 9), substitute x =", choices:["3 sec θ","3 sin θ","3 tan θ","9 tan θ"], answer:2, hint:"" },
      { id:"intg_253", topic:"Trig Substitution & Identities", difficulty:"Medium", question:"For √(x² − 16), substitute x =", choices:["16 sec θ","4 sec θ","4 sin θ","4 tan θ"], answer:1, hint:"" },
      { id:"intg_254", topic:"Trig Substitution & Identities", difficulty:"Hard", question:"∫ 1/(x²√(x²−1)) dx after x = sec θ becomes ∫ cos θ dθ =", choices:["sec θ + C","cos θ + C","sin θ + C","tan θ + C"], answer:2, hint:"" },
      { id:"intg_255", topic:"Trig Substitution & Identities", difficulty:"Medium", question:"After x = a sin θ, √(a² − x²) simplifies to:", choices:["a sin θ","a sec θ","a cos θ","a tan θ"], answer:2, hint:"" },
      { id:"intg_256", topic:"Trig Substitution & Identities", difficulty:"Medium", question:"After x = a tan θ, √(a² + x²) becomes:", choices:["a tan θ","a sin θ","a sec θ","a cos θ"], answer:2, hint:"" },
      { id:"intg_257", topic:"Trig Substitution & Identities", difficulty:"Medium", question:"After x = a sec θ, √(x² − a²) becomes:", choices:["a cos θ","a sec θ","a sin θ","a tan θ"], answer:3, hint:"" },
      { id:"intg_258", topic:"Trig Substitution & Identities", difficulty:"Hard", question:"∫ cos²x dx =", choices:["x/2 − (sin 2x)/4 + C","sin²x + C","(cos 2x)/2 + C","x/2 + (sin 2x)/4 + C"], answer:3, hint:"" },
      { id:"intg_259", topic:"Trig Substitution & Identities", difficulty:"Hard", question:"∫ 1/√(9 − x²) dx =", choices:["(1/3)arcsin(x/3)","arcsin(x/3) + C","arcsin x + C","arctan(x/3) + C"], answer:1, hint:"" },
      { id:"intg_260", topic:"Trig Substitution & Identities", difficulty:"Hard", question:"∫ 1/(4 + x²) dx =", choices:["(1/2)ln(4+x²)","(1/2)arctan(x/2) + C","arctan(x/2) + C","arcsin(x/2)"], answer:1, hint:"" },
      { id:"intg_261", topic:"Trig Substitution & Identities", difficulty:"Medium", question:"sin 2θ =", choices:["sin²θ − cos²θ","2 cos²θ","1 − 2sin²θ","2 sin θ cos θ"], answer:3, hint:"" },
      { id:"intg_262", topic:"Trig Substitution & Identities", difficulty:"Medium", question:"cos 2θ can be written as:", choices:["2 sin θ cos θ","sin²θ + cos²θ","2 tan θ","1 − 2 sin²θ"], answer:3, hint:"" },
      { id:"intg_263", topic:"Trig Substitution & Identities", difficulty:"Hard", question:"∫ sin²x cos²x dx uses the identity sin²x cos²x = (1/4)sin²(2x), then:", choices:["trig sub","power reduction again","long division","parts"], answer:1, hint:"" },
      { id:"intg_264", topic:"Trig Substitution & Identities", difficulty:"Hard", question:"∫ tan²x dx = ∫(sec²x − 1) dx =", choices:["tan²x/2 + C","tan x + x + C","sec x + C","tan x − x + C"], answer:3, hint:"" },
      { id:"intg_265", topic:"Trig Substitution & Identities", difficulty:"Hard", question:"∫ sec²x dx =", choices:["cot x + C","ln|sec x| + C","sec x + C","tan x + C"], answer:3, hint:"" },
      { id:"intg_266", topic:"Trig Substitution & Identities", difficulty:"Medium", question:"The identity for ∫ tan x dx uses sin x / cos x, giving:", choices:["sec x + C","tan x + C","−ln|cos x| + C","ln|sin x| + C"], answer:2, hint:"" },
      { id:"intg_267", topic:"Trig Substitution & Identities", difficulty:"Hard", question:"∫ 1/√(x²+4) dx = ln|x + √(x²+4)| + C uses x =", choices:["2 sin θ","4 tan θ","2 sec θ","2 tan θ"], answer:3, hint:"" },
      { id:"intg_268", topic:"Trig Substitution & Identities", difficulty:"Hard", question:"∫ √(1 − x²) dx = (1/2)(arcsin x + x√(1−x²)) + C uses x =", choices:["tan θ","sec θ","sin θ","cos θ"], answer:2, hint:"" },
      { id:"intg_269", topic:"Trig Substitution & Identities", difficulty:"Medium", question:"csc²θ = 1 + ?", choices:["sec²θ","tan²θ","cot²θ","sin²θ"], answer:2, hint:"" },
      { id:"intg_270", topic:"Trig Substitution & Identities", difficulty:"Hard", question:"∫ 1/(x²+a²) dx =", choices:["arcsin(x/a)","arctan(x/a) + C","(1/a)ln + C","(1/a)arctan(x/a) + C"], answer:3, hint:"" },
    ],
  },
};

/* ═══════════════════════════════════════════════════════════
   STORAGE KEYS
═══════════════════════════════════════════════════════════ */
const KEYS = {
  settings: "mathplatform-settings", // { teacherPin, courseSettings }
  students: "mathplatform-students", // { [studentId]: StudentProfile }
  course: (id) => `mathplatform-v2-${id}`, // { problems, flags }
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
  return course.topics.find(t => t.name === name) || { color: C.violet, bg: C.lavender, icon: "" };
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
          style={{ background: C.cream }}></div>
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
  const studentsLoadedRef = useRef(false); // true only after a successful read

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(KEYS.students, true);
        setStudents(JSON.parse(r.value));
        studentsLoadedRef.current = true;
      } catch {
        // read failed (missing doc is fine; network error is NOT) — leave unloaded.
        // If the doc simply doesn't exist yet, a first successful set will create it.
      }
    })();
  }, []);

  // SAFE persist: never write the in-memory list back unless we know we loaded it,
  // and never overwrite an existing non-empty list with an empty one.
  const persist = async (s) => {
    // Re-read the current stored value and merge, so a stale/empty in-memory
    // object can never clobber real data.
    let current = {};
    let readOk = false;
    try { const r = await window.storage.get(KEYS.students, true); current = JSON.parse(r.value) || {}; readOk = true; }
    catch { readOk = false; }
    if (!readOk && !studentsLoadedRef.current) {
      // We've never successfully seen the data — refuse to write, to avoid wiping it.
      throw new Error("Cannot save: student data hasn't loaded yet.");
    }
    const merged = { ...current, ...s };
    await window.storage.set(KEYS.students, JSON.stringify(merged), true);
    setStudents(merged);
  };

  const register = async () => {
    if (!firstName.trim() || !lastName.trim()) return setErr("Please enter your first and last name.");
    if (username.trim().length < 3) return setErr("Username must be at least 3 characters.");
    if (password.length < 4) return setErr("Password must be at least 4 characters.");
    const id = username.toLowerCase().trim();
    // Check for a duplicate username against FRESH stored data, not the (possibly stale) in-memory list.
    try {
      const r = await window.storage.get(KEYS.students, true);
      const existing = JSON.parse(r.value) || {};
      if (existing[id]) return setErr("That username is already taken.");
    } catch {
      // couldn't read — fall back to in-memory check
      if (students[id]) return setErr("That username is already taken.");
    }
    const profile = {
      id, username: id, firstName: firstName.trim(), lastName: lastName.trim(),
      password, // NOTE: stored as plain text — low-stakes classroom tool only
      enrolledCourses: [courseId],
      accessRevoked: [],
      status: "pending", // pending | approved — teacher must approve before practice
      joinedAt: new Date().toLocaleDateString(),
      scores: {}, // { [courseId]: { right, tried, streak } }
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
              {m === "login" ? "Log in" : "Sign up"}
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

        {err && <p className="text-xs font-bold mb-3 px-1" style={{ color: C.coral }}> {err}</p>}

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
function StudentView({ course, student, problems, flags, onHelp, onPersistScore, onRecordAttempt }) {
  const [topicFilter, setTopicFilter] = useState("All");
  const [diffFilter, setDiffFilter] = useState("All");
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(null);     // null | "correct" | "wrong" after submitting a typed answer
  const [typedAnswer, setTypedAnswer] = useState("");
  const [score, setScore] = useState(() => student.scores?.[course.id] || { right: 0, tried: 0, streak: 0 });
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpReason, setHelpReason] = useState(HELP_REASONS[0]);
  const [helpNote, setHelpNote] = useState("");
  const [helpSent, setHelpSent] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [scratchpadText, setScratchpadText] = useState("");
  const [scratchMode, setScratchMode] = useState("draw"); // draw | type
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPtRef = useRef(null);
  const [showCalc, setShowCalc] = useState(false);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcError, setCalcError] = useState(false);
  const calcContainerRef = useRef(null);
  const calcInstanceRef = useRef(null);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const timerIntervalRef = useRef(null);
  const questionStartRef = useRef(Date.now()); // when the current question first appeared

  const visible = problems.filter(
    p => (topicFilter === "All" || p.topic === topicFilter) && (diffFilter === "All" || p.difficulty === diffFilter)
  );
  const current = visible[Math.min(idx, Math.max(visible.length - 1, 0))];

  // Timer effect
  useEffect(() => {
    if (!current || picked !== null) return;
    questionStartRef.current = Date.now(); // mark when this question appeared
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, picked]);

  // Restore saved scratch work whenever the question changes or the pad opens
  useEffect(() => {
    if (showScratchpad) {
      // small delay so the canvas is mounted/visible before we draw onto it
      const t = setTimeout(loadScratch, 30);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, showScratchpad]);

  // ── Desmos graphing calculator (lazy-loaded from CDN when first opened) ──
  useEffect(() => {
    if (!showCalc) return;
    let cancelled = false;

    const mountCalc = () => {
      if (cancelled || !calcContainerRef.current) return;
      if (calcInstanceRef.current) return; // already mounted
      try {
        // eslint-disable-next-line no-undef
        calcInstanceRef.current = Desmos.GraphingCalculator(calcContainerRef.current, {
          expressions: true,
          settingsMenu: false,
          zoomButtons: true,
          border: false,
          lockViewport: false,
          images: false,
          folders: false,
        });
        setCalcLoading(false);
      } catch (e) {
        setCalcError(true); setCalcLoading(false);
      }
    };

    if (window.Desmos) {
      mountCalc();
    } else {
      setCalcLoading(true);
      let script = document.getElementById("desmos-api");
      if (!script) {
        script = document.createElement("script");
        script.id = "desmos-api";
        // Desmos demo API key — fine for development; for production, request your own at partnerships@desmos.com
        script.src = "https://www.desmos.com/api/v1.6/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6";
        script.async = true;
        script.onload = () => { if (!cancelled) mountCalc(); };
        script.onerror = () => { if (!cancelled) { setCalcError(true); setCalcLoading(false); } };
        document.body.appendChild(script);
      } else {
        // script tag exists but Desmos not ready yet — poll briefly
        const t = setInterval(() => {
          if (window.Desmos) { clearInterval(t); mountCalc(); }
        }, 150);
        setTimeout(() => clearInterval(t), 6000);
      }
    }

    return () => { cancelled = true; };
  }, [showCalc]);

  // Tear down the calculator instance when the panel closes (frees memory)
  useEffect(() => {
    if (!showCalc && calcInstanceRef.current) {
      try { calcInstanceRef.current.destroy(); } catch {}
      calcInstanceRef.current = null;
    }
  }, [showCalc]);

  // ── Scratchpad drawing helpers ──
  const getCanvasPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return {
      x: (touch.clientX - rect.left) * (canvas.width / rect.width),
      y: (touch.clientY - rect.top) * (canvas.height / rect.height),
    };
  };
  const startDraw = (e) => { e.preventDefault(); drawingRef.current = true; lastPtRef.current = getCanvasPos(e); };
  const moveDraw = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const pt = getCanvasPos(e);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y); ctx.lineTo(pt.x, pt.y); ctx.stroke();
    lastPtRef.current = pt;
  };
  const endDraw = () => { drawingRef.current = false; saveScratch(); };

  // ── Scratch persistence (survives refresh) — stored locally per student + question ──
  const scratchKey = () => current ? `scratch:${student.id}:${course.id}:${current.id}` : null;
  const saveScratch = () => {
    const key = scratchKey();
    if (!key) return;
    try {
      let drawing = "";
      if (canvasRef.current && canvasHasInk()) {
        drawing = canvasRef.current.toDataURL("image/png");
      }
      const payload = { text: scratchpadText, drawing };
      if (!payload.text && !payload.drawing) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(payload));
    } catch {}
  };
  const loadScratch = () => {
    const key = scratchKey();
    if (!key) return;
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) { setScratchpadText(""); return; }
      const { text, drawing } = JSON.parse(raw);
      setScratchpadText(text || "");
      if (drawing && canvas) {
        const img = new Image();
        img.onload = () => canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        img.src = drawing;
      }
    } catch { setScratchpadText(""); }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    saveScratch();
  };
  const canvasHasInk = () => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
    return false;
  };
  const captureWork = () => {
    let drawing = "";
    if (canvasHasInk()) {
      try {
        // Downscale to keep the data URL small (Firestore docs cap at ~1MB)
        const src = canvasRef.current;
        const scale = 0.5;
        const tmp = document.createElement("canvas");
        tmp.width = src.width * scale; tmp.height = src.height * scale;
        const tctx = tmp.getContext("2d");
        tctx.fillStyle = "#ffffff"; tctx.fillRect(0, 0, tmp.width, tmp.height);
        tctx.drawImage(src, 0, 0, tmp.width, tmp.height);
        drawing = tmp.toDataURL("image/jpeg", 0.6);
      } catch {}
    }
    return { workText: scratchpadText.trim(), workDrawing: drawing };
  };

  const submitAnswer = () => {
    if (picked !== null) return;
    if (!typedAnswer.trim()) return;
    const correctText = current.choices[current.answer];
    const correct = answersMatch(typedAnswer, correctText);
    const secondsTaken = Math.max(0, Math.round((Date.now() - questionStartRef.current) / 1000));
    setPicked("recorded"); // neutral — we don't reveal right/wrong to the student
    const nextScore = { right: score.right + (correct?1:0), tried: score.tried + 1, streak: correct ? score.streak+1 : 0 };
    setScore(nextScore);
    onPersistScore(nextScore);
    // Record the full attempt so the teacher can review it later
    onRecordAttempt({
      problemId: current.id,
      topic: current.topic,
      difficulty: current.difficulty,
      questionText: current.question,
      typedAnswer: typedAnswer.trim(),
      correctAnswer: correctText,
      wasCorrect: correct,
      secondsTaken,
      date: new Date().toLocaleString(),
    });
  };

  const next = () => {
    setPicked(null); setTypedAnswer(""); setHelpSent(false);
    // reset the visible scratch surface WITHOUT deleting the saved work for the question we're leaving
    setScratchpadText("");
    if (canvasRef.current) canvasRef.current.getContext("2d").clearRect(0,0,canvasRef.current.width,canvasRef.current.height);
    setIdx(i => (i+1) % Math.max(visible.length,1));
  };

  const submitHelp = () => {
    const work = captureWork();
    onHelp({ problemId: current.id, questionText: current.question, reason: helpReason, note: helpNote.trim(),
      studentName: `${student.firstName} ${student.lastName}`, studentId: student.id, ...work });
    setHelpOpen(false); setHelpNote(""); setHelpReason(HELP_REASONS[0]); setHelpSent(true);
  };

  const sendWorkOnly = () => {
    const work = captureWork();
    if (!work.workText && !work.workDrawing) { setShowScratchpad(false); return; }
    onHelp({ problemId: current.id, questionText: current.question, reason: "Sharing my work",
      note: "", studentName: `${student.firstName} ${student.lastName}`, studentId: student.id, ...work });
    setShowScratchpad(false);
  };

  const ts = current ? topicStyleFor(course, current.topic) : {};

  return (
    <div className="max-w-3xl mx-auto px-4 py-6" style={{ paddingBottom: (showScratchpad || showCalc) ? "56vh" : undefined }}>
      {/* Top bar: avatar + profile */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-3 items-center">
          {[
            { label: "Answered", value: score.tried, color: C.sky, bg: "#E5F2FF" },
          ].map(s => (
            <div key={s.label} className="rounded-2xl px-3 py-2 text-center" style={{ background: s.bg, minWidth: 80 }}>
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
            <div className="text-xs opacity-50">{score.tried} answered</div>
          </div>
        </button>
      </div>

      {/* Topic chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
        <Chip label="All" icon="" active={topicFilter === "All"} color={course.color} bg={course.bg}
          onClick={() => { setTopicFilter("All"); setIdx(0); setPicked(null); setTypedAnswer(""); }} />
        {course.topics.map(t => (
          <Chip key={t.name} label={t.name} icon={t.icon} active={topicFilter === t.name} color={t.color} bg={t.bg}
            onClick={() => { setTopicFilter(t.name); setIdx(0); setPicked(null); setTypedAnswer(""); }} />
        ))}
      </div>

      {/* Diff chips */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs font-extrabold opacity-40 uppercase tracking-wide">Level:</span>
        <Chip small label="Any" icon="" active={diffFilter === "All"} color={C.ink} bg="#ECEAF6"
          onClick={() => { setDiffFilter("All"); setIdx(0); setPicked(null); setTypedAnswer(""); }} />
        {[{d:"Easy",icon:"",color:C.teal,bg:C.mint},{d:"Medium",icon:"",color:C.orange,bg:C.cream},{d:"Hard",icon:"",color:C.coral,bg:C.blush}].map(x => (
          <Chip small key={x.d} label={x.d} icon={x.icon} active={diffFilter === x.d} color={x.color} bg={x.bg}
            onClick={() => { setDiffFilter(x.d); setIdx(0); setPicked(null); setTypedAnswer(""); }} />
        ))}
      </div>

      {!current ? (
        <div className="rounded-3xl p-10 text-center bg-white shadow-lg">
          <div className="text-5xl mb-3"></div>
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
                  ⏱ {timeRemaining}s
                </div>
              )}
            </div>
          </div>
          <div className="p-5 sm:p-7">
            <p className="text-lg sm:text-xl font-bold leading-relaxed mb-5 whitespace-pre-line">{current.question}</p>

            {/* Typed answer */}
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={typedAnswer}
                onChange={e => setTypedAnswer(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") (picked === null ? submitAnswer() : next()); }}
                disabled={picked !== null}
                placeholder="Type your answer here…"
                className="flex-1 rounded-2xl px-4 py-3.5 text-lg font-semibold outline-none"
                style={{
                  background: picked === null ? "#F4F2FC" : "#EDEBF7",
                  border: `2.5px solid ${picked === null ? "transparent" : C.lavender}`,
                  color: C.ink,
                }}
                autoFocus
              />
              {picked === null ? (
                <button onClick={submitAnswer} disabled={!typedAnswer.trim()}
                  className="rounded-2xl px-6 py-3.5 font-extrabold text-white transition-all"
                  style={{ background: typedAnswer.trim() ? course.color : "#C8C2E0", cursor: typedAnswer.trim() ? "pointer" : "default" }}>
                  Submit
                </button>
              ) : (
                <button onClick={next}
                  className="rounded-2xl px-6 py-3.5 font-extrabold text-white"
                  style={{ background: course.color }}>
                  Next →
                </button>
              )}
            </div>

            {picked !== null && (
              <div className="mt-4 rounded-2xl px-4 py-3 font-bold text-center" style={{background:"#EDF7F4", color:C.teal}}>
                Answer recorded. Your teacher will review it.
              </div>
            )}
            <div className="mt-4 flex gap-2 flex-wrap">
              <button onClick={() => { setShowScratchpad(true); setShowCalc(false); setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50); }} className="text-sm font-bold px-3 py-1.5 rounded-full" style={{background:"#E2FAF4",color:C.teal}}> Scratchpad</button>
              <button onClick={() => { setShowCalc(true); setShowScratchpad(false); setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50); }} className="text-sm font-bold px-3 py-1.5 rounded-full" style={{background:"#EFF6FF",color:"#2563EB"}}> Calculator</button>
            </div>
            <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
              <div>
                {helpSent
                  ? <span className="text-sm font-bold" style={{color:C.teal}}> Help request sent!</span>
                  : <button onClick={() => setHelpOpen(true)} className="text-sm font-bold px-3 py-2 rounded-full" style={{background:"#E5F2FF",color:C.sky}}>Ask my teacher for help</button>
                }
              </div>
              <button onClick={next} className="px-6 py-2.5 rounded-full font-extrabold shadow-md active:scale-95 transition-transform"
                style={picked===null ? {background:"#F4F2FC",color:C.ink} : {background:`linear-gradient(135deg, ${course.color}, ${course.dark})`,color:"#fff"}}>
                {picked===null ? "Skip →" : "Next →"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Help modal */}
      {helpOpen && current && (
        <Modal onClose={() => setHelpOpen(false)}>
          <h3 className="text-lg font-extrabold mb-1">Ask for help</h3>
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
          <div className="grid grid-cols-1 gap-3 mb-4">
            {[
              { label: "Questions answered", value: score.tried, color: C.sky, bg: "#E5F2FF" },
            ].map(s => (
              <div key={s.label} className="rounded-2xl p-4 text-center" style={{background:s.bg}}>
                <div className="text-3xl font-extrabold" style={{color:s.color}}>{s.value}</div>
                <div className="text-xs font-bold opacity-60">{s.label}</div>
              </div>
            ))}
          </div>
          <button onClick={() => setShowProfile(false)} className="w-full py-2.5 rounded-full font-bold" style={{background:"#F4F2FC"}}>Close</button>
        </Modal>
      )}

      {/* Scratchpad — bottom panel so the question stays visible above it */}
      {showScratchpad && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 pointer-events-none">
          <div className="max-w-2xl mx-auto rounded-3xl shadow-2xl pointer-events-auto"
            style={{background:"#fff", border:`2px solid ${C.lavender}`, maxHeight:"50vh", overflowY:"auto"}}>
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-extrabold">Scratch Pad</h3>
                <button onClick={() => setShowScratchpad(false)} aria-label="Close scratchpad"
                  className="text-sm font-bold px-3 py-1 rounded-full" style={{background:"#F4F2FC",color:C.ink}}>Hide ▾</button>
              </div>
              <p className="text-xs opacity-55 mb-3">Your work stays saved while you're on this question — switching tabs or peeking at the question won't erase it. It only clears when you press Clear.</p>
              <div className="flex rounded-full p-1 mb-3" style={{background:"#F4F2FC"}}>
                {["draw","type"].map(m => (
                  <button key={m} onClick={() => setScratchMode(m)}
                    className="flex-1 py-1.5 rounded-full text-sm font-extrabold capitalize transition-all"
                    style={{background:scratchMode===m?"#fff":"transparent", color:scratchMode===m?C.teal:C.ink, boxShadow:scratchMode===m?"0 1px 4px #241F4E22":"none"}}>
                    {m === "draw" ? "Draw" : "Type"}
                  </button>
                ))}
              </div>

              {/* Canvas stays mounted always (just hidden) so the drawing is never lost on toggle */}
              <div style={{display: scratchMode === "draw" ? "block" : "none"}}>
                <canvas ref={canvasRef} width={520} height={240}
                  className="w-full rounded-xl touch-none"
                  style={{background:"#FFFFFF", border:`2px solid ${C.lavender}`, cursor:"crosshair", aspectRatio:"520/240"}}
                  onMouseDown={startDraw} onMouseMove={moveDraw} onMouseUp={endDraw} onMouseLeave={endDraw}
                  onTouchStart={startDraw} onTouchMove={moveDraw} onTouchEnd={endDraw} />
                <div className="flex justify-end mt-1 mb-2">
                  <button onClick={clearCanvas} className="text-xs font-bold px-3 py-1 rounded-full" style={{background:C.blush,color:C.coral}}>Clear drawing</button>
                </div>
              </div>
              <div style={{display: scratchMode === "type" ? "block" : "none"}}>
                <textarea value={scratchpadText} onChange={e => { setScratchpadText(e.target.value); }} onBlur={saveScratch}
                  placeholder="Write your calculations, notes, and working here..." rows={5}
                  className="w-full rounded-xl px-4 py-3 text-sm font-medium mb-1 outline-none"
                  style={{background:"#F4F2FC",border:`2px solid ${C.lavender}`}} />
                <div className="flex justify-end mb-2">
                  <button onClick={() => { setScratchpadText(""); const k = scratchKey(); if (k) { try { const raw = localStorage.getItem(k); if (raw) { const o = JSON.parse(raw); o.text = ""; if (!o.drawing) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(o)); } } catch {} } }} className="text-xs font-bold px-3 py-1 rounded-full" style={{background:C.blush,color:C.coral}}>Clear notes</button>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setShowScratchpad(false)} className="flex-1 py-2.5 rounded-full font-bold text-sm" style={{background:"#F4F2FC",color:C.ink}}>Keep working</button>
                <button onClick={sendWorkOnly} className="flex-1 py-2.5 rounded-full font-extrabold text-white text-sm" style={{background:C.teal}}>Send work to teacher</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desmos graphing calculator — bottom panel so the question stays visible */}
      {showCalc && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 pointer-events-none">
          <div className="max-w-2xl mx-auto rounded-3xl shadow-2xl pointer-events-auto"
            style={{background:"#fff", border:`2px solid #BFDBFE`, overflow:"hidden"}}>
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-extrabold" style={{color:"#1D4ED8"}}>Graphing Calculator</h3>
                <button onClick={() => setShowCalc(false)} aria-label="Close calculator"
                  className="text-sm font-bold px-3 py-1 rounded-full" style={{background:"#EFF6FF",color:"#2563EB"}}>Hide ▾</button>
              </div>
              {calcError ? (
                <div className="rounded-xl px-4 py-6 text-center text-sm" style={{background:"#FEF2F2",color:"#B91C1C"}}>
                  Couldn't load the calculator. Check your internet connection and try again.
                </div>
              ) : (
                <div style={{position:"relative"}}>
                  {calcLoading && (
                    <div className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{color:"#2563EB",zIndex:2}}>
                      Loading calculator…
                    </div>
                  )}
                  <div ref={calcContainerRef} style={{width:"100%", height:"42vh", minHeight:300, borderRadius:12, overflow:"hidden", border:"1px solid #DBEAFE"}} />
                </div>
              )}
              <p className="text-xs opacity-50 text-center mt-2">Powered by Desmos. Type equations like y = 2x + 3 to graph them.</p>
            </div>
          </div>
        </div>
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

  const studentsLoadedRef = useRef(false); // true only after a successful read
  const [studentsLoadError, setStudentsLoadError] = useState(false);

  const loadStudents = useCallback(async () => {
    try {
      const r = await window.storage.get(KEYS.students, true);
      setStudents(JSON.parse(r.value) || {});
      studentsLoadedRef.current = true;
      setStudentsLoadError(false);
    } catch {
      // If the doc genuinely doesn't exist yet, treat as loaded-empty so the teacher
      // can start fresh. We can't tell "missing" from "network error" via the shim,
      // so we probe: list the collection. If that also fails, it's a real error.
      try {
        await window.storage.list("", true); // succeeds if Firestore is reachable
        studentsLoadedRef.current = true;     // reachable + no students doc = empty is real
        setStudentsLoadError(false);
      } catch {
        studentsLoadedRef.current = false;
        setStudentsLoadError(true);           // Firestore unreachable — do NOT allow writes
      }
    }
  }, []);
  useEffect(() => {
    (async () => {
      await loadStudents();
      try { const r = await window.storage.get(KEYS.settings, true); setSettings(JSON.parse(r.value)); } catch {}
    })();
  }, [loadStudents]);

  // SAFE persist: applies an updater function against a FRESH read of stored data,
  // so a stale/empty in-memory object can never overwrite the real list. Refuses to
  // write if we've never successfully reached the data.
  const persistStudents = async (updater) => {
    let current = {};
    let readOk = false;
    try { const r = await window.storage.get(KEYS.students, true); current = JSON.parse(r.value) || {}; readOk = true; }
    catch {
      try { await window.storage.list("", true); readOk = true; current = {}; } // reachable, just no doc
      catch { readOk = false; }
    }
    if (!readOk) {
      setStudentsLoadError(true);
      throw new Error("Cannot save — can't reach the database. Change was not saved.");
    }
    const next = typeof updater === "function" ? updater(current) : updater;
    await window.storage.set(KEYS.students, JSON.stringify(next), true);
    setStudents(next);
    studentsLoadedRef.current = true;
    setStudentsLoadError(false);
  };

  const toggleAccess = async (studentId) => {
    await persistStudents((cur) => {
      const s = { ...cur };
      if (!s[studentId]) return s;
      const profile = { ...s[studentId] };
      const revoked = profile.accessRevoked || [];
      profile.accessRevoked = revoked.includes(courseId)
        ? revoked.filter(c => c !== courseId)
        : [...revoked, courseId];
      s[studentId] = profile;
      return s;
    });
  };

  const approveStudent = async (studentId) => {
    await persistStudents((cur) => {
      if (!cur[studentId]) return cur;
      return { ...cur, [studentId]: { ...cur[studentId], status: "approved" } };
    });
  };

  const denyStudent = async (studentId) => {
    await persistStudents((cur) => {
      const s = { ...cur };
      delete s[studentId];
      return s;
    });
  };

  const deleteStudent = async (studentId) => {
    const st = students[studentId];
    const name = st ? `${st.firstName} ${st.lastName}` : "this student";
    if (!window.confirm(`Delete ${name}'s account permanently? This removes their answers and work and cannot be undone.`)) return;
    await persistStudents((cur) => {
      const s = { ...cur };
      delete s[studentId];
      return s;
    });
    if (selectedStudent && selectedStudent.id === studentId) setSelectedStudent(null);
  };

  const savePin = async () => {
    if (pinInput.length < 4) return setPinMsg("PIN must be at least 4 characters.");
    const next = { ...settings, teacherPin: pinInput };
    await window.storage.set(KEYS.settings, JSON.stringify(next), true);
    setSettings(next); setPinInput(""); setPinMsg("PIN updated! ");
  };

  const enrolledStudents = Object.values(students).filter(s => s.enrolledCourses?.includes(courseId));
  const pendingStudents  = enrolledStudents.filter(s => s.status === "pending");
  const approvedStudents = enrolledStudents.filter(s => s.status !== "pending");

  const addProblem = () => {
    if (!form.question.trim() || form.choices.some(c => !c.trim())) { setFormMsg("Fill in the question and all four choices."); return; }
    onAddProblem({ ...form, id: "t" + Date.now(), question: form.question.trim(), choices: form.choices.map(c => c.trim()), hint: form.hint.trim() });
    setForm({ topic: course.topics[0].name, difficulty: "Easy", question: "", choices:["","","",""], answer:0, hint:"" });
    setFormMsg("Problem published! ");
  };

  const courseURL = buildCourseURL(courseId);

  const escapeHtml = (s) => String(s == null ? "" : s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  const buildReport = () => {
    const when = new Date().toLocaleString();
    const studentsList = approvedStudents.slice().sort((a,b) =>
      (a.lastName||"").localeCompare(b.lastName||"") || (a.firstName||"").localeCompare(b.firstName||""));
    // scratch work from flags, keyed by studentId+problemId
    const workByKey = {};
    flags.forEach(f => { if (f.workText || f.workDrawing) workByKey[`${f.studentId}|${f.problemId}`] = f; });

    let body = "";
    studentsList.forEach(s => {
      const attempts = (s.attempts && s.attempts[courseId]) || [];
      const answered = attempts.length;
      const correct = attempts.filter(a => a.wasCorrect).length;
      const pct = answered ? Math.round(correct/answered*100) : 0;
      const timed = attempts.filter(a => typeof a.secondsTaken === "number");
      const avgSec = timed.length ? Math.round(timed.reduce((n,a) => n + a.secondsTaken, 0) / timed.length) : null;
      const avgStr = avgSec == null ? "—" : (avgSec < 60 ? avgSec + "s" : Math.floor(avgSec/60) + "m " + (avgSec%60 < 10 ? "0" : "") + (avgSec%60) + "s");
      body += `<h2>${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)} <span class="uname">@${escapeHtml(s.username)}</span></h2>`;
      body += `<div class="meta">Answered: <b>${answered}</b> &nbsp;·&nbsp; Correct: <b>${correct}</b> &nbsp;·&nbsp; Score: <b>${pct}%</b> &nbsp;·&nbsp; Avg time/question: <b>${avgStr}</b></div>`;
      if (!answered) { body += `<p class="none">No answers submitted yet.</p>`; return; }
      body += `<table><thead><tr><th>#</th><th>Date</th><th>Time</th><th>Topic / Level</th><th>Question</th><th>Their answer</th><th>Correct answer</th><th>✓</th><th>Work</th></tr></thead><tbody>`;
      attempts.forEach((a, i) => {
        const work = workByKey[`${s.id}|${a.problemId}`];
        let workCell = "—";
        if (work) {
          workCell = "";
          if (work.workText) workCell += `<div class="wtext">${escapeHtml(work.workText)}</div>`;
          if (work.workDrawing) workCell += `<img class="wimg" src="${work.workDrawing}" alt="work"/>`;
        }
        const fmtTime = (sec) => {
          if (sec == null || isNaN(sec)) return "—";
          if (sec < 60) return sec + "s";
          const m = Math.floor(sec / 60), s2 = sec % 60;
          return m + "m " + (s2 < 10 ? "0" : "") + s2 + "s";
        };
        body += `<tr class="${a.wasCorrect ? "ok" : "no"}">
          <td>${i+1}</td>
          <td class="dt">${escapeHtml(a.date || "—")}</td>
          <td class="tm">${fmtTime(a.secondsTaken)}</td>
          <td class="tl">${escapeHtml(a.topic)}<br><span class="lvl">${escapeHtml(a.difficulty)}</span></td>
          <td class="q">${escapeHtml(a.questionText)}</td>
          <td class="ta">${escapeHtml(a.typedAnswer)}</td>
          <td class="ca">${escapeHtml(a.correctAnswer)}</td>
          <td class="mk">${a.wasCorrect ? "✓" : "✗"}</td>
          <td class="wk">${workCell}</td>
        </tr>`;
      });
      body += `</tbody></table>`;
    });
    if (!studentsList.length) body = `<p class="none">No approved students yet.</p>`;

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(course.label)} — Student Report</title>
<style>
@media print{ h2{break-before:auto} tr{break-inside:avoid} }
body{font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:1000px;margin:0 auto;padding:24px;color:#1A1640}
h1{font-size:24px;margin-bottom:2px}.sub{color:#666;margin-bottom:20px;font-size:13px}
h2{font-size:18px;margin-top:28px;border-bottom:3px solid #6C4DF6;padding-bottom:5px;color:#5538D6}
.uname{font-size:13px;color:#999;font-weight:400}.meta{font-size:13px;color:#444;margin:6px 0 10px}
.none{color:#999;font-style:italic}
table{border-collapse:collapse;width:100%;font-size:13px;margin-bottom:10px}
th,td{border:1px solid #e3e0f0;padding:6px 8px;vertical-align:top;text-align:left}
th{background:#F4F2FC;font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#5538D6}
td.q{max-width:280px}.tl{white-space:nowrap;font-size:12px}.lvl{font-size:10px;color:#888}
.ta{font-weight:700}.ca{color:#0E7E69}.mk{text-align:center;font-weight:800}.dt{font-size:11px;color:#666;white-space:nowrap}.tm{font-size:12px;color:#444;white-space:nowrap;text-align:center;font-weight:600}
tr.no .mk{color:#C2374B}tr.ok .mk{color:#0E7E69}
tr.no td.ta{color:#C2374B}
.wtext{white-space:pre-wrap;font-size:12px;margin-bottom:4px}
.wimg{max-width:180px;border:1px solid #e3e0f0;border-radius:4px;background:#fff}
</style></head><body>
<h1>${escapeHtml(course.label)} — Student Report</h1>
<div class="sub">Generated ${escapeHtml(when)} · ${studentsList.length} student(s) · You review correctness; students do not see it.</div>
${body}
</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${courseId}-report-${new Date().toISOString().slice(0,10)}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const reportStats = approvedStudents.map(s => {
    const attempts = (s.attempts && s.attempts[courseId]) || [];
    return { s, answered: attempts.length, correct: attempts.filter(a => a.wasCorrect).length };
  });
  const totalAnswered = reportStats.reduce((n,r) => n + r.answered, 0);

  // ── Engagement / retention metrics ──
  const dayKey = (d) => { const x = new Date(d); return isNaN(x) ? null : x.toISOString().slice(0,10); };
  const today = new Date(); today.setHours(0,0,0,0);
  const daysAgo = (dstr) => { const d = new Date(dstr); if (isNaN(d)) return null; d.setHours(0,0,0,0); return Math.round((today - d)/86400000); };

  const engagement = approvedStudents.map(s => {
    const attempts = (s.attempts && s.attempts[courseId]) || [];
    const dates = attempts.map(a => a.date).filter(Boolean);
    const dayset = new Set(dates.map(dayKey).filter(Boolean));
    const sorted = dates.map(d => new Date(d)).filter(d => !isNaN(d)).sort((a,b)=>a-b);
    const first = sorted[0] || null;
    const last = sorted[sorted.length-1] || null;
    // last 14-day activity sparkline (count per day)
    const spark = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate()-i);
      const key = d.toISOString().slice(0,10);
      spark.push(dates.filter(x => dayKey(x) === key).length);
    }
    const lastActiveDays = last ? daysAgo(last) : null;
    // simple status
    let status = "Never started";
    if (attempts.length > 0) {
      if (lastActiveDays === 0) status = "Active today";
      else if (lastActiveDays <= 2) status = "Recently active";
      else if (lastActiveDays <= 7) status = "This week";
      else status = "Inactive";
    }
    return {
      s, total: attempts.length, activeDays: dayset.size,
      first, last, lastActiveDays, spark, status,
      maxSpark: Math.max(1, ...spark),
    };
  }).sort((a,b) => (a.lastActiveDays==null?1e9:a.lastActiveDays) - (b.lastActiveDays==null?1e9:b.lastActiveDays));

  const activeThisWeek = engagement.filter(e => e.lastActiveDays != null && e.lastActiveDays <= 7).length;
  const neverStarted = engagement.filter(e => e.total === 0).length;
  const returners = engagement.filter(e => e.activeDays >= 2).length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Tab bar */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { id:"students", label:`Students (${approvedStudents.length})${pendingStudents.length ? ` · ${pendingStudents.length} pending` : ""}` },
          { id:"problems", label:`Problems (${problems.length})` },
          { id:"add", label:"Add problem" },
          { id:"help", label:`Help${openFlags.length ? ` (${openFlags.length})` : ""}` },
          { id:"activity", label:"Activity" },
          { id:"report", label:"Report" },
          { id:"settings", label:"Settings" },
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
          {studentsLoadError && (
            <div className="rounded-3xl p-4 mb-5 shadow-md" style={{background:"#FEF2F2", border:"2px solid #FCA5A5"}}>
              <h3 className="text-sm font-extrabold mb-1" style={{color:"#B91C1C"}}>Couldn't load your students</h3>
              <p className="text-xs mb-3" style={{color:"#7F1D1D"}}>
                The database couldn't be reached, so the list below may be incomplete. Your saved data is safe — the app will
                not change anything until it loads successfully. Do not approve, delete, or edit students until this clears.
              </p>
              <button onClick={loadStudents} className="text-xs font-extrabold px-3 py-1.5 rounded-full" style={{background:"#B91C1C",color:"#fff"}}>Try again</button>
            </div>
          )}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-base font-extrabold">Enrolled Students</h2>
            <button onClick={() => { navigator.clipboard.writeText(courseURL); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="text-xs font-extrabold px-3 py-1.5 rounded-full transition-all"
              style={{background:copied?C.mint:course.bg, color:copied?"#0E7E69":course.color}}>
              {copied ? " Link copied!" : " Copy student link"}
            </button>
          </div>
          {pendingStudents.length > 0 && (
            <div className="rounded-3xl p-4 mb-5 shadow-md" style={{background:C.cream, border:`2px solid ${C.orange}44`}}>
              <h3 className="text-sm font-extrabold mb-3" style={{color:"#946A00"}}>Waiting for your approval ({pendingStudents.length})</h3>
              <div className="grid gap-2">
                {pendingStudents.map(s => (
                  <div key={s.id} className="bg-white rounded-2xl p-3 flex items-center gap-3">
                    <Avatar name={`${s.firstName} ${s.lastName}`} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold text-sm">{s.firstName} {s.lastName}</div>
                      <div className="text-xs opacity-50">@{s.username} · requested {s.joinedAt}</div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => approveStudent(s.id)} className="text-xs font-extrabold px-3 py-1.5 rounded-full text-white" style={{background:C.teal}}>Approve</button>
                      <button onClick={() => denyStudent(s.id)} className="text-xs font-bold px-3 py-1.5 rounded-full" style={{background:C.blush,color:C.coral}}>Deny</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {approvedStudents.length === 0 && pendingStudents.length === 0 && (
            <div className="rounded-3xl p-10 text-center bg-white shadow-lg">
              <p className="font-bold">No students yet.</p>
              <p className="text-sm opacity-60 mt-1">Share the student link. After they sign up, approve them here.</p>
            </div>
          )}
          <div className="grid gap-3">
            {approvedStudents.map(s => {
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
                      {revoked ? "Restore" : "Revoke"}
                    </button>
                    <button onClick={() => deleteStudent(s.id)}
                      className="text-xs font-bold px-3 py-1.5 rounded-full"
                      style={{background:"#FBE3E6", color:"#B0182B"}}>
                      Delete
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
          {problems.length === 0 && <div className="rounded-3xl p-10 text-center bg-white shadow-lg"><div className="text-5xl mb-3"></div><p className="font-bold">No problems yet.</p></div>}
          {problems.map(p => {
            const ts = topicStyleFor(course, p.topic);
            const fc = flags.filter(f => f.problemId === p.id && !f.resolved).length;
            return (
              <div key={p.id} className="bg-white rounded-2xl p-4 shadow-md flex items-start gap-3" style={{borderLeft:`5px solid ${ts.color}`}}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-extrabold" style={{color:ts.color}}>{ts.icon ? ts.icon + " " : ""}{p.topic}</span>
                    <DiffBadge level={p.difficulty} />
                    {fc > 0 && <span className="text-xs font-extrabold px-2 py-0.5 rounded-full" style={{background:"#E5F2FF",color:C.sky}}>{fc} asking for help</span>}
                  </div>
                  <p className="font-semibold text-sm">{p.question}</p>
                  <p className="text-xs mt-1" style={{color:C.teal}}> {p.choices[p.answer]}</p>
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
          <h2 className="text-lg font-extrabold mb-4">New problem </h2>
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
            Publish 
          </button>
          {formMsg && <p className="mt-3 text-sm font-bold text-center" style={{color:formMsg.includes("")?C.teal:C.coral}}>{formMsg}</p>}
        </div>
      )}

      {/* ── Help requests ── */}
      {tab === "help" && (
        <div className="grid gap-3">
          {openFlags.length === 0 && <div className="rounded-3xl p-10 text-center bg-white shadow-lg"><div className="text-5xl mb-3"></div><p className="font-bold">No open help requests!</p></div>}
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
                  <span className="text-xs font-extrabold px-2 py-0.5 rounded-full" style={{background:"#E5F2FF",color:C.sky}}> {f.reason}</span>
                  <span className="text-xs opacity-50 font-semibold">{f.date}</span>
                </div>
                <p className="font-semibold text-sm mb-1">{p ? p.question : (f.questionText || "(problem was deleted)")}</p>
                {f.note && <p className="text-sm italic opacity-70 mb-2">"{f.note}"</p>}
                {(f.workText || f.workDrawing) && (
                  <div className="mt-2 mb-2 rounded-xl p-3" style={{background:"#FAF9FF", border:`1.5px solid ${C.lavender}`}}>
                    <div className="text-xs font-extrabold mb-2" style={{color:C.violet}}>Student's work</div>
                    {f.workText && <p className="text-sm font-medium whitespace-pre-wrap mb-2" style={{color:C.ink}}>{f.workText}</p>}
                    {f.workDrawing && <img src={f.workDrawing} alt="Student's drawn work" className="w-full rounded-lg" style={{background:"#fff", border:`1px solid ${C.lavender}`}} />}
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  <button onClick={() => onResolveFlag(f.id)} className="text-xs font-extrabold px-3 py-1.5 rounded-full" style={{background:C.mint,color:"#0E7E69"}}>Mark as helped</button>
                  {p && <button onClick={() => onDeleteProblem(p.id)} className="text-xs font-extrabold px-3 py-1.5 rounded-full" style={{background:C.blush,color:C.coral}}>Delete problem</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Activity / Engagement ── */}
      {tab === "activity" && (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Students", value: approvedStudents.length, color: C.ink, bg: "#F4F2FC" },
              { label: "Active this week", value: activeThisWeek, color: C.teal, bg: C.mint },
              { label: "Came back 2+ days", value: returners, color: C.sky, bg: "#E5F2FF" },
              { label: "Never started", value: neverStarted, color: C.coral, bg: C.blush },
            ].map(m => (
              <div key={m.label} className="rounded-2xl p-4 text-center" style={{background:m.bg}}>
                <div className="text-2xl font-extrabold" style={{color:m.color}}>{m.value}</div>
                <div className="text-xs font-bold opacity-60 mt-1">{m.label}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl p-3 sm:p-5 shadow-md">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="font-extrabold text-sm">Who's coming back?</h3>
              <button onClick={loadStudents} className="text-xs font-bold px-3 py-1.5 rounded-full" style={{background:"#F4F2FC",color:C.ink}}>Refresh</button>
            </div>
            <p className="text-xs opacity-50 mb-4">The bars show each student's activity over the last 14 days. Sorted by who was active most recently. This is the signal that matters most: are they returning on their own?</p>

            {engagement.length === 0 && <p className="text-sm opacity-50">No approved students yet.</p>}
            <div className="grid gap-2">
              {engagement.map(e => {
                const statusColor = {
                  "Active today": C.teal, "Recently active": C.teal, "This week": C.sky,
                  "Inactive": C.coral, "Never started": "#9A95B8",
                }[e.status] || "#9A95B8";
                return (
                  <div key={e.s.id} className="rounded-xl p-3" style={{background:"#FAF9FF", border:`1px solid ${C.lavender}`}}>
                    <div className="flex items-center gap-3 mb-2">
                      <Avatar name={`${e.s.firstName} ${e.s.lastName}`} size={32} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-extrabold">{e.s.firstName} {e.s.lastName}</div>
                        <div className="text-xs opacity-50">
                          {e.total} answers · {e.activeDays} active day{e.activeDays===1?"":"s"}
                          {e.lastActiveDays != null && <> · last seen {e.lastActiveDays===0?"today":e.lastActiveDays===1?"yesterday":`${e.lastActiveDays} days ago`}</>}
                        </div>
                      </div>
                      <span className="text-xs font-extrabold px-2 py-1 rounded-full shrink-0" style={{background:`${statusColor}22`, color:statusColor}}>{e.status}</span>
                    </div>
                    {/* 14-day sparkline */}
                    <div className="flex items-end gap-0.5 h-8">
                      {e.spark.map((v, i) => (
                        <div key={i} className="flex-1 rounded-sm" title={`${v} on day ${i+1}`}
                          style={{
                            height: `${Math.max(8, (v / e.maxSpark) * 100)}%`,
                            background: v > 0 ? course.color : "#E8E5F2",
                            minHeight: 3,
                          }} />
                      ))}
                    </div>
                    <div className="flex justify-between text-xs opacity-40 mt-1">
                      <span>14 days ago</span><span>today</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl p-4" style={{background:C.cream}}>
            <h4 className="text-sm font-extrabold mb-2" style={{color:"#946A00"}}>What to look for</h4>
            <ul className="text-xs space-y-1.5" style={{color:"#7A5C08"}}>
              <li>• <b>"Came back 2+ days"</b> is your key number. Kids returning on their own — without being told — is the real sign it's working.</li>
              <li>• A student who answered a lot once, then went quiet, isn't a content problem — it's a reason to ask them what made them stop.</li>
              <li>• Empty bars after a strong start = the moment to talk to that family.</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── Report ── */}
      {tab === "report" && (
        <div className="grid gap-4">
          <div className="bg-white rounded-2xl p-5 shadow-md">
            <h3 className="font-extrabold mb-1">Student Answer Report</h3>
            <p className="text-sm opacity-60 mb-4">Download a report showing each student's typed answer next to the correct answer, with a ✓/✗ for grading and any work they sent. Students never see whether they were right — only you do.</p>
            <div className="flex gap-2 flex-wrap">
              <button onClick={buildReport} disabled={approvedStudents.length === 0}
                className="px-5 py-2.5 rounded-full font-extrabold text-white"
                style={{background: approvedStudents.length ? course.color : "#C8C2E0", cursor: approvedStudents.length ? "pointer" : "default"}}>
                Download report (.html)
              </button>
              <button onClick={loadStudents}
                className="px-5 py-2.5 rounded-full font-bold" style={{background:"#F4F2FC", color:C.ink}}>
                Refresh data
              </button>
            </div>
            <p className="text-xs opacity-50 mt-3">{approvedStudents.length} student(s) · {totalAnswered} answer(s) recorded. Opens in any browser; use the browser's Print to save as PDF.</p>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-md">
            <h4 className="font-extrabold text-sm mb-3">Quick preview</h4>
            {reportStats.length === 0 && <p className="text-sm opacity-50">No approved students yet.</p>}
            <div className="grid gap-2">
              {reportStats.map(({s, answered, correct}) => (
                <div key={s.id} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{background:"#FAF9FF"}}>
                  <Avatar name={`${s.firstName} ${s.lastName}`} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-extrabold">{s.firstName} {s.lastName}</div>
                    <div className="text-xs opacity-50">@{s.username}</div>
                  </div>
                  <div className="text-xs font-bold text-right">
                    <div style={{color:C.sky}}>{answered} answered</div>
                    <div style={{color:C.teal}}>{correct} correct</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Settings ── */}
      {tab === "settings" && (
        <div className="grid gap-4">
          <div className="bg-white rounded-2xl p-5 shadow-md">
            <h3 className="font-extrabold mb-3"> Change Teacher PIN</h3>
            <p className="text-sm opacity-60 mb-3">Current PIN is hidden. Enter a new one to replace it.</p>
            <div className="flex gap-2">
              <input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)} placeholder="New PIN (min 4 chars)"
                className="flex-1 rounded-xl px-4 py-2.5 font-semibold outline-none"
                style={{background:"#F4F2FC",border:`2px solid ${C.lavender}`}} />
              <button onClick={savePin} className="px-4 py-2.5 rounded-xl font-extrabold text-white"
                style={{background:C.violet}}>Save</button>
            </div>
            {pinMsg && <p className="text-xs font-bold mt-2" style={{color:pinMsg.includes("")?C.teal:C.coral}}>{pinMsg}</p>}
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-md">
            <h3 className="font-extrabold mb-1"> Student Link</h3>
            <p className="text-sm opacity-60 mb-3">Share this link with students enrolled in {course.label}.</p>
            <div className="rounded-xl px-4 py-3 text-xs font-bold break-all mb-3" style={{background:"#F4F2FC",color:C.violet}}>
              {buildCourseURL(courseId)}
            </div>
            <button onClick={() => { navigator.clipboard.writeText(buildCourseURL(courseId)); setCopied(true); setTimeout(()=>setCopied(false),2000); }}
              className="text-sm font-extrabold px-4 py-2 rounded-full"
              style={{background:copied?C.mint:course.bg, color:copied?"#0E7E69":course.color}}>
              {copied ? " Copied!" : " Copy link"}
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
                    {revoked ? "Restore Access" : "Revoke Access"}
                  </button>
                  <button onClick={() => setSelectedStudent(null)} className="flex-1 py-2.5 rounded-full font-bold" style={{background:"#F4F2FC"}}>Close</button>
                </div>
                <button onClick={() => deleteStudent(selectedStudent.id)}
                  className="w-full py-2.5 rounded-full font-extrabold" style={{background:"#FBE3E6", color:"#B0182B"}}>
                  Delete account permanently
                </button>
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
   COURSE PLATFORM (orchestrates student/teacher views)
═══════════════════════════════════════════════════════════ */
function CoursePlatform({ courseId, onBack }) {
  const course = COURSES[courseId];
  const STORE = KEYS.course(courseId);

  const [role, setRole] = useState(null); // null = choose, student, teacher
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const recordAttempt = useCallback(async (studentId, attempt) => {
    try {
      const r = await window.storage.get(KEYS.students, true);
      const all = JSON.parse(r.value);
      if (all[studentId]) {
        const byCourse = all[studentId].attempts || {};
        const list = byCourse[courseId] || [];
        list.push(attempt);
        all[studentId].attempts = { ...byCourse, [courseId]: list };
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
             I'm a Student
          </button>
          <button onClick={() => setRole("teacher")}
            className="w-full py-3.5 rounded-2xl font-extrabold text-base"
            style={{background:C.cream, color:"#7A5C08"}}>
             I'm the Teacher
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
          <span className="text-xs font-bold px-3 py-1 rounded-full" style={{background:"#ffffff22",color:C.sunny}}> Teacher</span>
        )}
      </header>

      {saveError && <div className="px-4 py-2 text-sm font-semibold text-center" style={{background:C.blush,color:C.coral}}>Couldn't save — please try again.</div>}

      {role === "student" && student && student.status === "pending" && (
        <div className="flex items-center justify-center px-6 py-20">
          <div className="bg-white rounded-3xl p-8 shadow-xl w-full max-w-sm text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black mx-auto mb-4" style={{background:C.cream,color:C.orange}}>!</div>
            <h2 className="text-lg font-extrabold mb-2" style={{color:C.ink}}>Waiting for approval</h2>
            <p className="text-sm opacity-70 mb-5">Your account was created. Your teacher needs to approve you before you can start practicing. Check back soon.</p>
            <button onClick={async () => {
              try {
                const r = await window.storage.get(KEYS.students, true);
                const all = JSON.parse(r.value);
                const me = all[student.id];
                if (me && me.status === "approved") setStudent(me);
                else setSaveError(false);
              } catch {}
            }} className="w-full py-2.5 rounded-full font-extrabold text-white text-sm" style={{background:course.color}}>Check again</button>
            <button onClick={() => { setRole(null); setStudent(null); }} className="w-full py-2 mt-2 rounded-full font-bold text-sm" style={{background:"#F4F2FC",color:C.ink}}>Sign out</button>
          </div>
        </div>
      )}
      {role === "student" && student && student.status !== "pending" && (
        <StudentView
          course={course} student={student} problems={problems} flags={flags}
          onHelp={addHelp}
          onPersistScore={(sc) => persistScore(student.id, sc)}
          onRecordAttempt={(a) => recordAttempt(student.id, a)}
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
        {course.label} · Math Arcade 
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   COURSE LANDING (teacher portal)
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
                    {copied===key ? " Copied!" : " Copy link"}
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
