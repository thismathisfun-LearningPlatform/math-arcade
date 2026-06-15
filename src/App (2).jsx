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
    id: "prealgebra", label: "Pre-Algebra", emoji: "PA",
    color: "#22A347", bg: "#E6F9EE", dark: "#1A7E38",
    tagline: "Build your math foundation",
    topics: [
      { name: "Integers & Order of Operations", icon: "", color: "#22A347", bg: "#E6F9EE" },
      { name: "Fractions & Decimals", icon: "½", color: "#E8960C", bg: C.cream },
      { name: "Ratios & Proportions", icon: "", color: C.sky, bg: "#E5F2FF" },
      { name: "Percents", icon: "%", color: C.coral, bg: C.blush },
      { name: "Variables & Expressions", icon: "", color: C.violet, bg: C.lavender },
      { name: "Geometry Basics", icon: "", color: C.teal, bg: C.mint },
    ],
    seeds: [
      { id:"pa1", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: 3 + 4 × 2 − 1", choices:["10","13","6","14"], answer:0, hint:"Multiplication comes before addition. Do 4 × 2 first." },
      { id:"pa2", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: (5 + 3)² ÷ 4 − 6", choices:["10","22","7","−6"], answer:0, hint:"Parentheses first, then the exponent, then divide, then subtract." },
      { id:"pa3", topic:"Integers & Order of Operations", difficulty:"Hard", question:"Evaluate: −3 × (−2)² + 4(−1 + 6) ÷ 2", choices:["−2","10","−10","2"], answer:0, hint:"(−2)² = 4 (positive!). Then −3 × 4 = −12." },
      { id:"pa4", topic:"Fractions & Decimals", difficulty:"Easy", question:"What is 3/4 + 1/4 ?", choices:["1","4/8","1/2","2"], answer:0, hint:"Same denominator — just add the numerators." },
      { id:"pa5", topic:"Fractions & Decimals", difficulty:"Medium", question:"Multiply: 2/3 × 3/8", choices:["1/4","5/11","6/24","2/8"], answer:0, hint:"Multiply numerators, multiply denominators, then simplify." },
      { id:"pa6", topic:"Ratios & Proportions", difficulty:"Easy", question:"A recipe uses 2 cups of sugar for 5 cups of flour. For 10 cups of flour, how many cups of sugar?", choices:["4","5","3","2"], answer:0, hint:"Set up a proportion: 2/5 = ?/10." },
      { id:"pa7", topic:"Percents", difficulty:"Easy", question:"What is 25% of 80?", choices:["20","25","40","15"], answer:0, hint:"25% = 0.25. Multiply 0.25 × 80." },
      { id:"pa8", topic:"Percents", difficulty:"Hard", question:"A shirt costs $40 and is marked up 35%. What is the new price?", choices:["$54","$50","$48","$44"], answer:0, hint:"Markup = 0.35 × 40 = $14. Add that to the original." },
      { id:"pa9", topic:"Variables & Expressions", difficulty:"Easy", question:"Simplify: 4x + 3x − x", choices:["6x","8x","7x","4x"], answer:0, hint:"Combine like terms: 4 + 3 − 1 = ?" },
      { id:"pa10", topic:"Geometry Basics", difficulty:"Medium", question:"Find the area of a rectangle with length 8 and width 5.", choices:["40","26","13","80"], answer:0, hint:"Area = length × width." },
      { id:"pa_ext_1", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: 6 + 2 × 5", choices:["16","40","20","13"], answer:0, hint:"Multiply before adding: 2 × 5 = 10, then add 6." },
      { id:"pa_ext_2", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: 20 − 12 ÷ 4", choices:["17","2","8","16"], answer:0, hint:"Divide first: 12 ÷ 4 = 3, then subtract from 20." },
      { id:"pa_ext_3", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: (8 − 3) × 2", choices:["10","13","16","5"], answer:0, hint:"Parentheses first: 8 − 3 = 5, then × 2." },
      { id:"pa_ext_4", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: 3² + 4", choices:["13","10","14","25"], answer:0, hint:"Exponent first: 3² = 9, then add 4." },
      { id:"pa_ext_5", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: 18 ÷ (3 + 3)", choices:["3","6","9","12"], answer:0, hint:"Parentheses first: 3 + 3 = 6, then 18 ÷ 6." },
      { id:"pa_ext_6", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: 10 + 6 ÷ 2 − 1", choices:["12","7","4","9"], answer:0, hint:"Divide first: 6 ÷ 2 = 3. Then 10 + 3 − 1." },
      { id:"pa_ext_7", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: 4 × 3 + 2 × 5", choices:["22","70","50","17"], answer:0, hint:"Do both multiplications first: 12 + 10." },
      { id:"pa_ext_8", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: 2 × (4 + 1)²", choices:["50","100","26","20"], answer:0, hint:"Parentheses: 5. Exponent: 25. Then × 2." },
      { id:"pa_ext_9", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: 24 ÷ 2³ + 5", choices:["8","13","17","11"], answer:0, hint:"Exponent: 2³ = 8. Then 24 ÷ 8 = 3, plus 5." },
      { id:"pa_ext_10", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: (6 + 4) × 3 − 2²", choices:["26","30","36","24"], answer:0, hint:"Parens 10, ×3 = 30; 2² = 4; 30 − 4." },
      { id:"pa_ext_11", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: 50 − 3 × (2 + 4)", choices:["32","282","44","288"], answer:0, hint:"Parens 6, × 3 = 18, then 50 − 18." },
      { id:"pa_ext_12", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: (12 ÷ 4 + 1)² ", choices:["16","10","9","13"], answer:0, hint:"Inside: 3 + 1 = 4, then 4²." },
      { id:"pa_ext_13", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: 100 ÷ 5² × 2", choices:["8","2","200","40"], answer:0, hint:"Exponent 25; left-to-right: 100 ÷ 25 = 4, × 2." },
      { id:"pa_ext_14", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: 7 + 3 × (10 − 2³)", choices:["13","30","26","17"], answer:0, hint:"2³ = 8; 10 − 8 = 2; 3 × 2 = 6; 7 + 6." },
      { id:"pa_ext_15", topic:"Integers & Order of Operations", difficulty:"Hard", question:"Evaluate: [4 + (3 × 2²)] ÷ 2", choices:["8","11","16","7"], answer:0, hint:"2² = 4, × 3 = 12, + 4 = 16, ÷ 2 = 8." },
      { id:"pa_ext_16", topic:"Integers & Order of Operations", difficulty:"Hard", question:"Evaluate: 6² ÷ (4 + 2) × 3 − 5", choices:["13","1","23","31"], answer:0, hint:"36 ÷ 6 = 6, × 3 = 18, − 5 = 13." },
      { id:"pa_ext_17", topic:"Integers & Order of Operations", difficulty:"Hard", question:"Evaluate: 2 × [15 − (2 + 3)²]", choices:["−20","20","−10","40"], answer:0, hint:"Inner 5, squared 25; 15 − 25 = −10; × 2." },
      { id:"pa_ext_18", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: −7 + 12", choices:["5","−5","19","−19"], answer:0, hint:"Start at −7 and move 12 to the right." },
      { id:"pa_ext_19", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: −4 − 9", choices:["−13","5","−5","13"], answer:0, hint:"Subtracting makes it more negative." },
      { id:"pa_ext_20", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: −6 × 3", choices:["−18","18","−9","9"], answer:0, hint:"Negative times positive is negative." },
      { id:"pa_ext_21", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: −20 ÷ (−5)", choices:["4","−4","15","−15"], answer:0, hint:"Negative divided by negative is positive." },
      { id:"pa_ext_22", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: 8 + (−15)", choices:["−7","7","23","−23"], answer:0, hint:"Adding a negative is the same as subtracting." },
      { id:"pa_ext_23", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: −3 − (−10)", choices:["7","−13","−7","13"], answer:0, hint:"Subtracting a negative flips to addition: −3 + 10." },
      { id:"pa_ext_24", topic:"Integers & Order of Operations", difficulty:"Easy", question:"Evaluate: (−2)(−6)", choices:["12","−12","8","−8"], answer:0, hint:"Two negatives multiply to a positive." },
      { id:"pa_ext_25", topic:"Integers & Order of Operations", difficulty:"Easy", question:"What is the absolute value |−9| ?", choices:["9","−9","0","18"], answer:0, hint:"Absolute value is distance from zero — always non-negative." },
      { id:"pa_ext_26", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: −5 + 8 − 12", choices:["−9","9","−25","1"], answer:0, hint:"Left to right: −5 + 8 = 3, then 3 − 12." },
      { id:"pa_ext_27", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: −4 × (−3) × 2", choices:["24","−24","−10","10"], answer:0, hint:"(−4)(−3) = 12, then × 2." },
      { id:"pa_ext_28", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: −36 ÷ 4 + 5", choices:["−4","−14","4","14"], answer:0, hint:"−36 ÷ 4 = −9, then + 5." },
      { id:"pa_ext_29", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: (−2)³", choices:["−8","8","−6","6"], answer:0, hint:"(−2)(−2)(−2) = 4 × (−2)." },
      { id:"pa_ext_30", topic:"Integers & Order of Operations", difficulty:"Medium", question:"Evaluate: −15 − (−7) + (−3)", choices:["−11","−25","−5","11"], answer:0, hint:"−15 + 7 − 3." },
      { id:"pa_ext_31", topic:"Integers & Order of Operations", difficulty:"Medium", question:"A diver is at −18 m and rises 7 m. What is the new depth?", choices:["−11 m","−25 m","11 m","25 m"], answer:0, hint:"Rising adds: −18 + 7." },
      { id:"pa_ext_32", topic:"Integers & Order of Operations", difficulty:"Hard", question:"Evaluate: −2 × 5 − (−8) ÷ 4", choices:["−8","−12","−10","8"], answer:0, hint:"−10 minus (−2): −10 + 2 = −8." },
      { id:"pa_ext_33", topic:"Integers & Order of Operations", difficulty:"Hard", question:"The temperature was −6°F, dropped 4°, then rose 9°. Final temp?", choices:["−1°F","−19°F","7°F","1°F"], answer:0, hint:"−6 − 4 + 9 = −1." },
      { id:"pa_ext_34", topic:"Integers & Order of Operations", difficulty:"Hard", question:"Evaluate: (−3)² − (−3) × 2", choices:["15","3","−3","12"], answer:0, hint:"9 − (−6) = 9 + 6." },
      { id:"pa_ext_35", topic:"Variables & Expressions", difficulty:"Easy", question:"Simplify: 5x + 2x", choices:["7x","10x","3x","7"], answer:0, hint:"Combine like terms: 5 + 2 = 7." },
      { id:"pa_ext_36", topic:"Variables & Expressions", difficulty:"Easy", question:"Simplify: 9a − 4a", choices:["5a","13a","5","36a"], answer:0, hint:"9 − 4 = 5, keep the a." },
      { id:"pa_ext_37", topic:"Variables & Expressions", difficulty:"Easy", question:"Evaluate 3x + 1 when x = 4.", choices:["13","12","7","9"], answer:0, hint:"3 × 4 = 12, then + 1." },
      { id:"pa_ext_38", topic:"Variables & Expressions", difficulty:"Easy", question:"Write an expression: 'a number n increased by 6'.", choices:["n + 6","6n","n − 6","6 − n"], answer:0, hint:"'Increased by' means add." },
      { id:"pa_ext_39", topic:"Variables & Expressions", difficulty:"Easy", question:"Simplify: 2x + 3 + 4x", choices:["6x + 3","9x","6x + 7","5x + 4"], answer:0, hint:"Add the x-terms: 2x + 4x = 6x." },
      { id:"pa_ext_40", topic:"Variables & Expressions", difficulty:"Easy", question:"What is the coefficient in 7y ?", choices:["7","y","1","0"], answer:0, hint:"The coefficient is the number multiplying the variable." },
      { id:"pa_ext_41", topic:"Variables & Expressions", difficulty:"Easy", question:"Evaluate 2a + 3b when a = 5, b = 2.", choices:["16","13","20","10"], answer:0, hint:"2(5) + 3(2) = 10 + 6." },
      { id:"pa_ext_42", topic:"Variables & Expressions", difficulty:"Easy", question:"Write an expression: 'twice a number x'.", choices:["2x","x + 2","x/2","x − 2"], answer:0, hint:"'Twice' means multiply by 2." },
      { id:"pa_ext_43", topic:"Variables & Expressions", difficulty:"Medium", question:"Simplify: 3(x + 4)", choices:["3x + 12","3x + 4","x + 12","3x + 7"], answer:0, hint:"Distribute the 3 to both terms." },
      { id:"pa_ext_44", topic:"Variables & Expressions", difficulty:"Medium", question:"Simplify: 2(3x − 1) + 5", choices:["6x + 3","6x − 3","6x + 4","5x + 4"], answer:0, hint:"Distribute: 6x − 2, then + 5." },
      { id:"pa_ext_45", topic:"Variables & Expressions", difficulty:"Medium", question:"Simplify: 8y − 3 + 2y + 7", choices:["10y + 4","6y + 4","10y + 10","10y − 4"], answer:0, hint:"Combine y-terms and constants separately." },
      { id:"pa_ext_46", topic:"Variables & Expressions", difficulty:"Medium", question:"Evaluate x² − 2x when x = 5.", choices:["15","35","20","5"], answer:0, hint:"25 − 10." },
      { id:"pa_ext_47", topic:"Variables & Expressions", difficulty:"Medium", question:"Write an expression: '5 less than 3 times a number n'.", choices:["3n − 5","5 − 3n","3(n − 5)","3n + 5"], answer:0, hint:"'Less than' subtracts from the 3n." },
      { id:"pa_ext_48", topic:"Variables & Expressions", difficulty:"Medium", question:"Simplify: 4(2x + 3) − 2x", choices:["6x + 12","10x + 12","6x + 3","8x + 12"], answer:0, hint:"8x + 12 − 2x." },
      { id:"pa_ext_49", topic:"Variables & Expressions", difficulty:"Hard", question:"Simplify: 3(2x − 4) − 2(x + 1)", choices:["4x − 14","8x − 10","4x − 10","4x − 12"], answer:0, hint:"6x − 12 − 2x − 2." },
      { id:"pa_ext_50", topic:"Variables & Expressions", difficulty:"Hard", question:"Evaluate 2a² + 3a − 1 when a = −2.", choices:["1","13","−3","9"], answer:0, hint:"2(4) + 3(−2) − 1 = 8 − 6 − 1." },
      { id:"pa_ext_51", topic:"Variables & Expressions", difficulty:"Hard", question:"Simplify: 5x + 2(3 − x) + 4x", choices:["7x + 6","11x + 6","7x + 3","9x + 6"], answer:0, hint:"5x + 6 − 2x + 4x." },
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
      { name: "Intro to Polynomials", icon: "", color: C.pinkDark,bg: C.pink },
    ],
    seeds: [
      { id:"a1_1", topic:"Linear Equations", difficulty:"Easy", question:"Solve for x: 2x + 5 = 13", choices:["x = 4","x = 9","x = 3","x = 6"], answer:0, hint:"Subtract 5 from both sides, then divide by 2." },
      { id:"a1_2", topic:"Linear Equations", difficulty:"Medium", question:"Solve: 3(x − 2) = 4x + 1", choices:["x = −7","x = 7","x = 1","x = −1"], answer:0, hint:"Distribute the 3 first, then collect x-terms on one side." },
      { id:"a1_3", topic:"Linear Equations", difficulty:"Hard", question:"Solve: (x + 3)/4 − (x − 1)/2 = 1", choices:["x = −3","x = 5","x = 3","x = −5"], answer:0, hint:"Multiply every term by 4 to clear the denominators." },
      { id:"a1_4", topic:"Systems of Equations", difficulty:"Easy", question:"Solve: y = 2x + 1 and y = x + 4", choices:["(3, 7)","(2, 5)","(1, 3)","(4, 9)"], answer:0, hint:"Set the right sides equal and solve for x." },
      { id:"a1_5", topic:"Systems of Equations", difficulty:"Hard", question:"Solve: 3x + 2y = 12 and x − y = 1", choices:["(2, 3)","(3, 2)","(4, 0)","(1, 4)"], answer:0, hint:"From the second equation, x = y + 1. Substitute." },
      { id:"a1_6", topic:"Inequalities", difficulty:"Easy", question:"Solve: −3x < 9", choices:["x > −3","x < −3","x > 3","x < 3"], answer:0, hint:"Dividing by a NEGATIVE flips the inequality sign." },
      { id:"a1_7", topic:"Slope & Linear Functions", difficulty:"Easy", question:"What is the slope of the line through (1, 2) and (3, 8)?", choices:["3","2","6","1/3"], answer:0, hint:"Slope = (y₂ − y₁)/(x₂ − x₁) = (8 − 2)/(3 − 1)." },
      { id:"a1_8", topic:"Slope & Linear Functions", difficulty:"Medium", question:"Write the equation of the line with slope 2 through (1, 5).",choices:["y = 2x + 3","y = 2x + 5","y = 2x − 3","y = x + 3"], answer:0, hint:"Use point-slope form: y − y₁ = m(x − x₁)." },
      { id:"a1_9", topic:"Exponents & Radicals", difficulty:"Medium", question:"Simplify: x³ · x⁵", choices:["x⁸","x¹⁵","2x⁸","x²"], answer:0, hint:"When multiplying same bases, add the exponents." },
      { id:"a1_10", topic:"Intro to Polynomials", difficulty:"Medium", question:"Expand: (x + 3)(x − 5)", choices:["x² − 2x − 15","x² + 2x − 15","x² − 15","x² − 2x + 15"], answer:0, hint:"FOIL: First, Outer, Inner, Last." },
      { id:"a1_eol_1", topic:"Equations of a Line", difficulty:"Easy", question:"What is the slope of y = 3x + 5 ?", choices:["3","5","−3","1/3"], answer:0, hint:"In y = mx + b, m is the slope." },
      { id:"a1_eol_2", topic:"Equations of a Line", difficulty:"Easy", question:"What is the y-intercept of y = −2x + 7 ?", choices:["7","−2","2","−7"], answer:0, hint:"In y = mx + b, b is the y-intercept." },
      { id:"a1_eol_3", topic:"Equations of a Line", difficulty:"Easy", question:"Write the equation of a line with slope 4 and y-intercept −1.", choices:["y = 4x − 1","y = −x + 4","y = 4x + 1","y = x − 4"], answer:0, hint:"Plug m = 4 and b = −1 into y = mx + b." },
      { id:"a1_eol_4", topic:"Equations of a Line", difficulty:"Easy", question:"Which equation is in slope-intercept form?", choices:["y = 2x + 3","2x + y = 3","x − y = 5","3x + 4y = 12"], answer:0, hint:"Slope-intercept form is y = mx + b, solved for y." },
      { id:"a1_eol_5", topic:"Equations of a Line", difficulty:"Easy", question:"What is the slope of y = −x + 8 ?", choices:["−1","1","8","−8"], answer:0, hint:"The coefficient of x is −1." },
      { id:"a1_eol_6", topic:"Equations of a Line", difficulty:"Easy", question:"A line has slope 0. Which describes it?", choices:["Horizontal line","Vertical line","Diagonal up","Diagonal down"], answer:0, hint:"Zero slope means no rise — a flat, horizontal line." },
      { id:"a1_eol_7", topic:"Equations of a Line", difficulty:"Easy", question:"What is the slope of the vertical line x = 4 ?", choices:["Undefined","0","4","1"], answer:0, hint:"Vertical lines have undefined slope (division by zero)." },
      { id:"a1_eol_8", topic:"Equations of a Line", difficulty:"Easy", question:"What is the y-intercept of y = 5x ?", choices:["0","5","1","undefined"], answer:0, hint:"y = 5x is y = 5x + 0, so b = 0." },
      { id:"a1_eol_9", topic:"Equations of a Line", difficulty:"Easy", question:"In point-slope form y − y₁ = m(x − x₁), what does m represent?", choices:["The slope","The y-intercept","The x-intercept","A point"], answer:0, hint:"m is always the slope." },
      { id:"a1_eol_10", topic:"Equations of a Line", difficulty:"Easy", question:"Which is the standard form of a line?", choices:["Ax + By = C","y = mx + b","y − y₁ = m(x − x₁)","y = a(x−h)²+k"], answer:0, hint:"Standard form is Ax + By = C." },
      { id:"a1_eol_11", topic:"Equations of a Line", difficulty:"Easy", question:"What is the slope of y = 7 ?", choices:["0","7","undefined","1"], answer:0, hint:"y = 7 is horizontal, so slope is 0." },
      { id:"a1_eol_12", topic:"Equations of a Line", difficulty:"Easy", question:"Find the slope between (0, 0) and (2, 6).", choices:["3","2","6","1/3"], answer:0, hint:"Slope = (6 − 0)/(2 − 0) = 6/2." },
      { id:"a1_eol_13", topic:"Equations of a Line", difficulty:"Medium", question:"Find the slope of the line through (1, 2) and (4, 11).", choices:["3","9","1/3","−3"], answer:0, hint:"Slope = (11 − 2)/(4 − 1) = 9/3." },
      { id:"a1_eol_14", topic:"Equations of a Line", difficulty:"Medium", question:"Write the equation (slope-intercept) of the line through (0, −3) with slope 2.", choices:["y = 2x − 3","y = 2x + 3","y = −3x + 2","y = 2x"], answer:0, hint:"b is the y-value when x = 0, so b = −3." },
      { id:"a1_eol_15", topic:"Equations of a Line", difficulty:"Medium", question:"Write in slope-intercept form the line through (2, 5) with slope 3.", choices:["y = 3x − 1","y = 3x + 5","y = 3x + 1","y = 3x − 5"], answer:0, hint:"y − 5 = 3(x − 2) → y = 3x − 6 + 5." },
      { id:"a1_eol_16", topic:"Equations of a Line", difficulty:"Medium", question:"Convert 2x + y = 7 to slope-intercept form.", choices:["y = −2x + 7","y = 2x + 7","y = −2x − 7","y = 2x − 7"], answer:0, hint:"Subtract 2x from both sides." },
      { id:"a1_eol_17", topic:"Equations of a Line", difficulty:"Medium", question:"Convert y = 3x − 6 to standard form (Ax + By = C).", choices:["3x − y = 6","3x + y = 6","−3x + y = 6","x − 3y = 6"], answer:0, hint:"Move 3x to the left: −3x + y = −6, then multiply by −1." },
      { id:"a1_eol_18", topic:"Equations of a Line", difficulty:"Medium", question:"What is the x-intercept of y = 2x − 8 ?", choices:["(4, 0)","(0, 4)","(−4, 0)","(0, −8)"], answer:0, hint:"Set y = 0: 0 = 2x − 8 → x = 4." },
      { id:"a1_eol_19", topic:"Equations of a Line", difficulty:"Medium", question:"What is the y-intercept of 3x + 4y = 12 ?", choices:["(0, 3)","(0, 4)","(4, 0)","(0, 12)"], answer:0, hint:"Set x = 0: 4y = 12 → y = 3." },
      { id:"a1_eol_20", topic:"Equations of a Line", difficulty:"Medium", question:"What is the x-intercept of 3x + 4y = 12 ?", choices:["(4, 0)","(0, 3)","(3, 0)","(0, 4)"], answer:0, hint:"Set y = 0: 3x = 12 → x = 4." },
      { id:"a1_eol_21", topic:"Equations of a Line", difficulty:"Medium", question:"Find the equation of the line through (1, 4) and (3, 10).", choices:["y = 3x + 1","y = 3x − 1","y = 2x + 2","y = 3x + 4"], answer:0, hint:"Slope = (10−4)/(3−1) = 3. Then y − 4 = 3(x − 1)." },
      { id:"a1_eol_22", topic:"Equations of a Line", difficulty:"Medium", question:"A line parallel to y = 2x + 1 passes through (0, 5). Find it.", choices:["y = 2x + 5","y = −½x + 5","y = 2x + 1","y = 5x + 2"], answer:0, hint:"Parallel lines share the same slope, m = 2." },
      { id:"a1_eol_23", topic:"Equations of a Line", difficulty:"Medium", question:"A line perpendicular to y = 3x − 2 has what slope?", choices:["−1/3","3","1/3","−3"], answer:0, hint:"Perpendicular slopes are negative reciprocals: −1/3." },
      { id:"a1_eol_24", topic:"Equations of a Line", difficulty:"Medium", question:"Write point-slope form for the line through (4, −1) with slope 5.", choices:["y + 1 = 5(x − 4)","y − 1 = 5(x + 4)","y + 4 = 5(x − 1)","y − 1 = 5(x − 4)"], answer:0, hint:"y − y₁ = m(x − x₁) with (x₁,y₁) = (4,−1)." },
      { id:"a1_eol_25", topic:"Equations of a Line", difficulty:"Medium", question:"Which line is horizontal?", choices:["y = −2","x = −2","y = x","y = 2x"], answer:0, hint:"y = constant is horizontal." },
      { id:"a1_eol_26", topic:"Equations of a Line", difficulty:"Medium", question:"Which line passes through the origin?", choices:["y = 4x","y = 4x + 1","y = 4","x = 4"], answer:0, hint:"Through origin means b = 0." },
      { id:"a1_eol_27", topic:"Equations of a Line", difficulty:"Medium", question:"Find the slope of 4x − 2y = 10.", choices:["2","−2","4","1/2"], answer:0, hint:"Solve for y: −2y = −4x + 10 → y = 2x − 5." },
      { id:"a1_eol_28", topic:"Equations of a Line", difficulty:"Medium", question:"The line y = mx + b passes through (0, 4) and (2, 0). Find m.", choices:["−2","2","4","−4"], answer:0, hint:"Slope = (0 − 4)/(2 − 0) = −2." },
      { id:"a1_eol_29", topic:"Equations of a Line", difficulty:"Medium", question:"Write the equation of the vertical line through (3, 7).", choices:["x = 3","y = 7","x = 7","y = 3"], answer:0, hint:"Vertical lines are x = constant." },
      { id:"a1_eol_30", topic:"Equations of a Line", difficulty:"Medium", question:"Write the equation of the horizontal line through (3, 7).", choices:["y = 7","x = 3","y = 3","x = 7"], answer:0, hint:"Horizontal lines are y = constant." },
      { id:"a1_eol_31", topic:"Equations of a Line", difficulty:"Hard", question:"Find the equation of the line through (2, 3) and (6, 11) in slope-intercept form.", choices:["y = 2x − 1","y = 2x + 1","y = ½x + 2","y = 2x − 3"], answer:0, hint:"Slope = 8/4 = 2. y − 3 = 2(x − 2) → y = 2x − 1." },
      { id:"a1_eol_32", topic:"Equations of a Line", difficulty:"Hard", question:"Line through (−1, 4), perpendicular to y = ½x + 3. Find it.", choices:["y = −2x + 2","y = −2x − 2","y = ½x + 2","y = 2x + 6"], answer:0, hint:"Perp slope = −2. y − 4 = −2(x + 1)." },
      { id:"a1_eol_33", topic:"Equations of a Line", difficulty:"Hard", question:"Line through (3, −2), parallel to 3x + y = 5. Find it.", choices:["y = −3x + 7","y = −3x − 7","y = 3x − 11","y = ⅓x − 3"], answer:0, hint:"Parallel slope = −3. y + 2 = −3(x − 3)." },
      { id:"a1_eol_34", topic:"Equations of a Line", difficulty:"Hard", question:"Convert y − 2 = 4(x + 1) to standard form.", choices:["4x − y = −6","4x + y = 6","4x − y = 6","x − 4y = −6"], answer:0, hint:"y = 4x + 6 → 4x − y = −6." },
      { id:"a1_eol_35", topic:"Equations of a Line", difficulty:"Hard", question:"A line has x-intercept 3 and y-intercept −6. Find its equation.", choices:["y = 2x − 6","y = −2x − 6","y = ½x − 6","y = 2x + 6"], answer:0, hint:"Slope = (−6 − 0)/(0 − 3) = 2. b = −6." },
      { id:"a1_eol_36", topic:"Equations of a Line", difficulty:"Hard", question:"Find the equation of the perpendicular bisector of the segment from (0,0) to (4,8).", choices:["y = −½x + 5","y = 2x − 5","y = −½x − 5","y = ½x + 5"], answer:0, hint:"Midpoint (2,4); segment slope 2; perp slope −½. y − 4 = −½(x − 2)." },
      { id:"a1_eol_37", topic:"Equations of a Line", difficulty:"Hard", question:"For what k is kx + 2y = 8 parallel to y = 3x − 1 ?", choices:["k = −6","k = 6","k = 3","k = −3"], answer:0, hint:"Slope = −k/2 must equal 3 → k = −6." },
      { id:"a1_eol_38", topic:"Equations of a Line", difficulty:"Hard", question:"Line through (5, 1) with the same y-intercept as y = 2x − 4. Find it.", choices:["y = x − 4","y = 2x − 4","y = x + 4","y = −x − 4"], answer:0, hint:"b = −4. Through (5,1): 1 = 5m − 4 → m = 1." },
      { id:"a1_eol_39", topic:"Equations of a Line", difficulty:"Hard", question:"Three points (1, k), (3, 7), (5, 13) are collinear. Find k.", choices:["1","3","4","5"], answer:0, hint:"Slope (3,7)-(5,13) = 3. Back to (1,k): 7 − k = 3(3 − 1) → k = 1." },
      { id:"a1_eol_40", topic:"Equations of a Line", difficulty:"Hard", question:"Write y = −¾x + 2 in standard form with integer coefficients.", choices:["3x + 4y = 8","3x − 4y = 8","4x + 3y = 8","3x + 4y = 2"], answer:0, hint:"Multiply by 4: 4y = −3x + 8 → 3x + 4y = 8." },
      { id:"a1_eol_41", topic:"Equations of a Line", difficulty:"Medium", question:"A taxi charges $3 to start plus $2 per mile. Write the cost C for m miles.", choices:["C = 2m + 3","C = 3m + 2","C = 5m","C = 2m − 3"], answer:0, hint:"Flat fee is the y-intercept; per-mile rate is the slope." },
      { id:"a1_eol_42", topic:"Equations of a Line", difficulty:"Medium", question:"A gym costs $50 to join plus $20 per month. Total cost after x months?", choices:["y = 20x + 50","y = 50x + 20","y = 70x","y = 20x − 50"], answer:0, hint:"Start fee = intercept (50); monthly = slope (20)." },
      { id:"a1_eol_43", topic:"Equations of a Line", difficulty:"Medium", question:"A plant is 4 cm tall and grows 2 cm per week. Height h after w weeks?", choices:["h = 2w + 4","h = 4w + 2","h = 6w","h = 2w − 4"], answer:0, hint:"Starting height is the intercept; growth rate is the slope." },
      { id:"a1_eol_44", topic:"Equations of a Line", difficulty:"Medium", question:"A pool has 100 gallons and drains 5 gal/min. Gallons g after t minutes?", choices:["g = −5t + 100","g = 5t + 100","g = −5t − 100","g = 100t − 5"], answer:0, hint:"Draining means negative slope; start amount is intercept." },
      { id:"a1_eol_45", topic:"Equations of a Line", difficulty:"Medium", question:"A candle is 12 in tall and burns 1.5 in/hr. Height after h hours?", choices:["y = −1.5h + 12","y = 1.5h + 12","y = −1.5h − 12","y = 12h − 1.5"], answer:0, hint:"Burning shortens it: slope is negative." },
      { id:"a1_eol_46", topic:"Equations of a Line", difficulty:"Medium", question:"A phone plan is $30/month flat. Which equation models cost over x months?", choices:["y = 30x","y = 30x + 30","y = x + 30","y = 30"], answer:0, hint:"No start fee, so intercept is 0; rate is 30." },
      { id:"a1_eol_47", topic:"Equations of a Line", difficulty:"Hard", question:"A car rental costs $40 plus $0.25/mile. If a trip cost $65, how many miles?", choices:["100","25","160","105"], answer:0, hint:"65 = 0.25m + 40 → 0.25m = 25 → m = 100." },
      { id:"a1_eol_48", topic:"Equations of a Line", difficulty:"Hard", question:"Water rises 3 cm/hr in a tank starting at 10 cm. When does it reach 31 cm?", choices:["7 hours","9 hours","21 hours","3 hours"], answer:0, hint:"31 = 3t + 10 → 3t = 21 → t = 7." },
      { id:"a1_eol_49", topic:"Equations of a Line", difficulty:"Hard", question:"A company's profit was $2,000 in year 0 and grows $500/yr. In what year is profit $6,500?", choices:["Year 9","Year 7","Year 13","Year 11"], answer:0, hint:"6500 = 500t + 2000 → 500t = 4500 → t = 9." },
      { id:"a1_eol_50", topic:"Equations of a Line", difficulty:"Hard", question:"A spring is 8 cm with no weight and stretches 2 cm per kg. A reading of 20 cm means what mass?", choices:["6 kg","10 kg","12 kg","4 kg"], answer:0, hint:"20 = 2x + 8 → 2x = 12 → x = 6." },
      { id:"a1_eol_51", topic:"Equations of a Line", difficulty:"Hard", question:"Two gyms: A is $60 + $15/mo, B is $30 + $25/mo. After how many months do they cost the same?", choices:["3 months","2 months","5 months","6 months"], answer:0, hint:"15x + 60 = 25x + 30 → 30 = 10x → x = 3." },
      { id:"a1_eol_52", topic:"Equations of a Line", difficulty:"Hard", question:"A printer cost $200; ink is $0.05/page. Cost after p pages? Then cost for 1000 pages?", choices:["y = 0.05p + 200; $250","y = 0.05p + 200; $200","y = 200p + 0.05; $250","y = 0.05p; $50"], answer:0, hint:"Intercept 200, slope 0.05. At p=1000: 50 + 200 = 250." },
      { id:"a1_eol_53", topic:"Equations of a Line", difficulty:"Hard", question:"A balloon at 500 ft descends 50 ft/min. Write the height equation and find when it lands.", choices:["y = −50t + 500; 10 min","y = 50t + 500; 10 min","y = −50t + 500; 5 min","y = −50t − 500; 10 min"], answer:0, hint:"Lands when y = 0: 0 = −50t + 500 → t = 10." },
      { id:"a1_eol_54", topic:"Equations of a Line", difficulty:"Hard", question:"A salesperson earns $1,500 base plus $100 per sale. To earn $3,300, how many sales?", choices:["18","33","48","15"], answer:0, hint:"3300 = 100s + 1500 → 100s = 1800 → s = 18." },
    ],
  },

  geometry: {
    id: "geometry", label: "Geometry", emoji: "GEO",
    color: "#C44DF6", bg: "#F7E9FF", dark: "#9B2FD6",
    tagline: "Shapes, proofs & spatial thinking",
    topics: [
      { name: "Angles & Lines", icon: "", color: "#C44DF6", bg: "#F7E9FF" },
      { name: "Triangles", icon: "△", color: C.coral, bg: C.blush },
      { name: "Circles", icon: "", color: C.teal, bg: C.mint },
      { name: "Area & Perimeter", icon: "", color: "#E8960C", bg: C.cream },
      { name: "Volume & Surface Area", icon: "", color: C.sky, bg: "#E5F2FF" },
      { name: "Coordinate Geometry", icon: "", color: "#22A347", bg: "#E6F9EE" },
    ],
    seeds: [
      { id:"geo1", topic:"Angles & Lines", difficulty:"Easy", question:"Two angles are supplementary. One measures 65°. What is the other?", choices:["115°","25°","90°","35°"], answer:0, hint:"Supplementary angles add up to 180°." },
      { id:"geo2", topic:"Angles & Lines", difficulty:"Medium", question:"Two parallel lines are cut by a transversal. One co-interior angle is 72°. Find the other.", choices:["108°","72°","18°","90°"], answer:0, hint:"Co-interior angles are supplementary: they add to 180°." },
      { id:"geo3", topic:"Triangles", difficulty:"Easy", question:"A triangle has angles 45° and 80°. What is the third angle?", choices:["55°","45°","80°","35°"], answer:0, hint:"All three angles add up to 180°." },
      { id:"geo4", topic:"Triangles", difficulty:"Hard", question:"In a 30-60-90 triangle, the shortest side is 7. What is the hypotenuse?", choices:["14","7√3","7√2","21"], answer:0, hint:"The hypotenuse is exactly twice the shortest side." },
      { id:"geo5", topic:"Circles", difficulty:"Easy", question:"What is the circumference of a circle with radius 6? (π ≈ 3.14)", choices:["37.68","18.84","113.04","28.26"], answer:0, hint:"C = 2πr" },
      { id:"geo6", topic:"Circles", difficulty:"Hard", question:"An arc subtends 120° in a circle of radius 9. What is the arc length? (leave in terms of π)", choices:["6π","3π","9π","18π"], answer:0, hint:"Arc length = (θ/360°) × 2πr." },
      { id:"geo7", topic:"Area & Perimeter", difficulty:"Easy", question:"What is the area of a triangle with base 10 and height 6?", choices:["30","60","16","15"], answer:0, hint:"A = ½ × base × height" },
      { id:"geo8", topic:"Area & Perimeter", difficulty:"Medium", question:"A square has perimeter 36. What is its area?", choices:["81","36","72","9"], answer:0, hint:"Find the side length first: 36 ÷ 4 = 9. Then square it." },
      { id:"geo9", topic:"Volume & Surface Area", difficulty:"Medium", question:"Find the volume of a rectangular prism: length 5, width 3, height 4.", choices:["60","94","47","120"], answer:0, hint:"V = l × w × h" },
      { id:"geo10", topic:"Coordinate Geometry", difficulty:"Medium", question:"What is the distance between (1, 2) and (4, 6)?", choices:["5","7","√7","4"], answer:0, hint:"Distance = √((x₂−x₁)² + (y₂−y₁)²) = √(9 + 16)." },
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
      { id:"p1", topic:"Quadratics", difficulty:"Easy", question:"Solve for x: x² − 5x + 6 = 0", choices:["x = 2 or x = 3","x = −2 or x = −3","x = 1 or x = 6","x = −1 or x = −6"], answer:0, hint:"Find two numbers that multiply to 6 and add to −5." },
      { id:"p2", topic:"Quadratics", difficulty:"Medium", question:"What is the vertex of y = 2(x − 3)² + 4 ?", choices:["(3, 4)","(−3, 4)","(3, −4)","(2, 3)"], answer:0, hint:"Vertex form y = a(x − h)² + k has vertex (h, k)." },
      { id:"p9", topic:"Quadratics", difficulty:"Hard", question:"For what values of k does x² + kx + 9 = 0 have exactly one real solution?", choices:["k = 6 or k = −6","k = 3 or k = −3","k = 9 only","k = 0 only"], answer:0, hint:"Exactly one real solution ⟹ discriminant b² − 4ac = 0." },
      { id:"p3", topic:"Polynomials", difficulty:"Medium", question:"What is the remainder when x³ − 4x + 6 is divided by (x − 2) ?", choices:["6","0","2","10"], answer:0, hint:"Use the Remainder Theorem: plug in x = 2." },
      { id:"p10", topic:"Polynomials", difficulty:"Hard", question:"Given (x + 1) is a factor of x³ + 2x² − 5x − 6, what are all the roots?", choices:["x = −1, 2, −3","x = 1, −2, 3","x = −1, −2, 3","x = −1 only"], answer:0, hint:"Divide by (x + 1), then factor the resulting quadratic." },
      { id:"p16", topic:"Polynomials", difficulty:"Easy", question:"What is the degree of 4x⁵ − 3x² + 7x − 1 ?", choices:["5","4","3","2"], answer:0, hint:"The degree is the highest exponent on x." },
      { id:"p4", topic:"Logarithms", difficulty:"Easy", question:"Evaluate: log₂(32)", choices:["5","4","6","16"], answer:0, hint:"2 raised to what power gives 32?" },
      { id:"p5", topic:"Logarithms", difficulty:"Medium", question:"Solve for x: log(x) + log(x − 3) = 1", choices:["x = 5","x = −2","x = 2","x = 10"], answer:0, hint:"Combine the logs, then rewrite as a power of 10." },
      { id:"p11", topic:"Logarithms", difficulty:"Hard", question:"Solve for x: log₃(x) + log₃(x + 6) = 3", choices:["x = 3","x = −9","x = 9","x = 3 or x = −9"], answer:0, hint:"Combine into log₃(x(x + 6)) = 3, then check for extraneous solutions." },
      { id:"p6", topic:"Rational Expressions", difficulty:"Medium", question:"Simplify: (x² − 9) / (x² + 5x + 6)", choices:["(x − 3)/(x + 2)","(x + 3)/(x + 2)","(x − 3)/(x − 2)","(x − 9)/(x + 6)"], answer:0, hint:"Factor the top and bottom, then cancel." },
      { id:"p12", topic:"Rational Expressions", difficulty:"Hard", question:"Solve for x: 2/(x − 1) + 3/(x + 1) = 4/(x² − 1)", choices:["x = 3/5","x = 1","x = −1","x = 5/3"], answer:0, hint:"x² − 1 = (x − 1)(x + 1). Multiply everything by that LCD." },
      { id:"p17", topic:"Parent Functions & Transformations", difficulty:"Easy", question:"What is the parent function of g(x) = (x − 2)² + 5 ?", choices:["y = x²","y = x","y = |x|","y = √x"], answer:0, hint:"Strip away the shifts — what basic shape is left?" },
      { id:"p18", topic:"Parent Functions & Transformations", difficulty:"Easy", question:"The graph of y = |x| is shifted 3 units RIGHT. What is the new equation?", choices:["y = |x − 3|","y = |x + 3|","y = |x| − 3","y = |x| + 3"], answer:0, hint:"Horizontal shifts go inside — sign is opposite of what you'd expect." },
      { id:"p19", topic:"Parent Functions & Transformations", difficulty:"Medium", question:"How is g(x) = −√x + 4 transformed from y = √x ?", choices:["Reflected over x-axis, shifted up 4","Reflected over y-axis, shifted up 4","Reflected over x-axis, shifted right 4","Shifted down 4 only"], answer:0, hint:"The negative sign is OUTSIDE the radical, and so is the +4." },
      { id:"p20", topic:"Parent Functions & Transformations", difficulty:"Medium", question:"Describe all transformations of g(x) = 2|x + 1| − 3 from y = |x|.", choices:["Vert. stretch ×2, left 1, down 3","Vert. stretch ×2, right 1, down 3","Vert. shrink ×½, left 1, down 3","Vert. stretch ×2, left 1, up 3"], answer:0, hint:"2 stretches, +1 inside moves left, −3 outside moves down." },
      { id:"p21", topic:"Parent Functions & Transformations", difficulty:"Hard", question:"Reflect y = x³ over the x-axis, shift 2 right, then 5 up. What's the equation?", choices:["y = −(x − 2)³ + 5","y = (−x − 2)³ + 5","y = −(x + 2)³ + 5","y = −(x − 2)³ − 5"], answer:0, hint:"Reflection: − out front. Right 2: (x − 2). Up 5: +5 at end." },
      { id:"p22", topic:"Parent Functions & Transformations", difficulty:"Hard", question:"(4, −2) is on y = f(x). What point MUST be on y = f(x − 3) + 6 ?", choices:["(7, 4)","(1, 4)","(7, −8)","(1, −8)"], answer:0, hint:"x − 3 shifts right 3 (x: 4→7) and +6 shifts up 6 (y: −2→4)." },
      { id:"r1", topic:"Radicals & Radical Equations", difficulty:"Easy", question:"Simplify: √72", choices:["6√2","8√2","3√8","36√2"], answer:0, hint:"72 = 36 × 2. Pull out the perfect square." },
      { id:"r2", topic:"Radicals & Radical Equations", difficulty:"Medium", question:"Solve: √(2x + 1) = 5", choices:["x = 12","x = 24","x = 2","x = 13"], answer:0, hint:"Square both sides: 2x + 1 = 25." },
      { id:"r3", topic:"Radicals & Radical Equations", difficulty:"Hard", question:"Solve: √(x + 3) = x − 3", choices:["x = 6","x = 1 or x = 6","x = 1","No solution"], answer:0, hint:"Square both sides, then check for extraneous solutions." },
      { id:"e1", topic:"Exponential Functions", difficulty:"Easy", question:"Which function represents exponential DECAY?", choices:["y = 3(0.5)ˣ","y = 0.5(3)ˣ","y = 3x²","y = 3ˣ"], answer:0, hint:"Decay means the base b satisfies 0 < b < 1." },
      { id:"e2", topic:"Exponential Functions", difficulty:"Medium", question:"A population of 500 doubles every 4 years. What is it after 12 years?", choices:["4000","6000","2000","8000"], answer:0, hint:"Doubles 3 times: 500 × 2³." },
      { id:"e3", topic:"Exponential Functions", difficulty:"Hard", question:"Solve for x: 4ˣ = 8", choices:["x = 3/2","x = 2","x = 4/8","x = 2/3"], answer:0, hint:"Write both as powers of 2: (2²)ˣ = 2³, so 2x = 3." },
      { id:"p7", topic:"Sequences & Series", difficulty:"Easy", question:"What is the 10th term of 4, 7, 10, … ?", choices:["31","34","28","30"], answer:0, hint:"aₙ = a₁ + (n − 1)d, with d = 3." },
      { id:"p15", topic:"Sequences & Series", difficulty:"Medium", question:"What is the sum of the first 20 terms of 2 + 5 + 8 + … ?", choices:["610","590","620","580"], answer:0, hint:"Sₙ = n/2 · (2a₁ + (n − 1)d)." },
      { id:"p13", topic:"Sequences & Series", difficulty:"Hard", question:"Sum of infinite geometric series: 18 − 6 + 2 − 2/3 + … ?", choices:["27/2","12","24","36"], answer:0, hint:"S = a₁/(1 − r). Here r = −1/3." },
      { id:"p8", topic:"Complex Numbers", difficulty:"Medium", question:"Multiply: (3 + 2i)(1 − 4i)", choices:["11 − 10i","3 − 8i","11 + 10i","−5 − 10i"], answer:0, hint:"FOIL it out and remember i² = −1." },
      { id:"p14", topic:"Complex Numbers", difficulty:"Hard", question:"Simplify: (2 + i) / (3 − i)", choices:["(1 + i)/2","(5 + 5i)/8","(7 + i)/10","(1 − i)/2"], answer:0, hint:"Multiply top and bottom by the conjugate (3 + i)." },
      { id:"a2_ff_1", topic:"Function Features", difficulty:"Easy", question:"As x → +∞, what happens to f(x) = x² ?", choices:["f(x) → +∞","f(x) → −∞","f(x) → 0","f(x) → 1"], answer:0, hint:"Even-degree, positive leading coefficient rises on both ends." },
      { id:"a2_ff_2", topic:"Function Features", difficulty:"Easy", question:"As x → −∞, what happens to f(x) = x³ ?", choices:["f(x) → −∞","f(x) → +∞","f(x) → 0","stays constant"], answer:0, hint:"Odd-degree, positive lead: falls left, rises right." },
      { id:"a2_ff_3", topic:"Function Features", difficulty:"Medium", question:"Describe the end behavior of f(x) = −2x⁴ + 3.", choices:["Down on both ends","Up on both ends","Up left, down right","Down left, up right"], answer:0, hint:"Even degree with negative leading coefficient falls both ways." },
      { id:"a2_ff_4", topic:"Function Features", difficulty:"Medium", question:"Describe the end behavior of f(x) = 5x³ − x.", choices:["Down left, up right","Up left, down right","Up both ends","Down both ends"], answer:0, hint:"Odd degree, positive lead: left → −∞, right → +∞." },
      { id:"a2_ff_5", topic:"Function Features", difficulty:"Medium", question:"Which leading term gives 'up on the left, down on the right'?", choices:["−x³","x³","x⁴","−x⁴"], answer:0, hint:"Odd degree + negative coefficient flips to up-left, down-right." },
      { id:"a2_ff_6", topic:"Function Features", difficulty:"Hard", question:"f(x) = −3x⁵ + 2x² − 7. As x → +∞, f(x) → ?", choices:["−∞","+∞","0","−7"], answer:0, hint:"Odd degree, negative lead: rises left, falls right." },
      { id:"a2_ff_7", topic:"Function Features", difficulty:"Hard", question:"A polynomial falls on the left and rises on the right. Which could it be?", choices:["x⁵ − x","−x⁴","x² + 1","−x³"], answer:0, hint:"Odd degree, positive leading coefficient." },
      { id:"a2_ff_8", topic:"Function Features", difficulty:"Medium", question:"The end behavior of f(x) = x² and g(x) = x⁴ is...", choices:["The same (up both ends)","Opposite","Up then down","Down both ends"], answer:0, hint:"Both even degree, positive lead → both rise on each end." },
      { id:"a2_ff_9", topic:"Function Features", difficulty:"Easy", question:"Where is f(x) = x² negative?", choices:["Nowhere","x < 0","x > 0","all x"], answer:0, hint:"x² is always ≥ 0, never negative." },
      { id:"a2_ff_10", topic:"Function Features", difficulty:"Medium", question:"For f(x) = x² − 4, on what interval is f(x) negative?", choices:["−2 < x < 2","x < −2","x > 2","all x"], answer:0, hint:"Roots at ±2; the parabola dips below zero between them." },
      { id:"a2_ff_11", topic:"Function Features", difficulty:"Medium", question:"For f(x) = (x − 1)(x + 3), where is f(x) positive?", choices:["x < −3 or x > 1","−3 < x < 1","x > 1 only","x < −3 only"], answer:0, hint:"Positive outside the roots for an upward parabola." },
      { id:"a2_ff_12", topic:"Function Features", difficulty:"Medium", question:"A function is positive when its graph is...", choices:["Above the x-axis","Below the x-axis","Left of the y-axis","On the x-axis"], answer:0, hint:"Positive output means y > 0, above the x-axis." },
      { id:"a2_ff_13", topic:"Function Features", difficulty:"Hard", question:"For f(x) = x(x − 2)(x + 2), where is f(x) negative?", choices:["x < −2 or 0 < x < 2","−2 < x < 0 or x > 2","x > 2 only","−2 < x < 2"], answer:0, hint:"Sign chart with roots −2, 0, 2 on an odd-degree positive-lead cubic." },
      { id:"a2_ff_14", topic:"Function Features", difficulty:"Hard", question:"For f(x) = −(x − 1)², where is f(x) positive?", choices:["Nowhere","x > 1","x < 1","all x except 1"], answer:0, hint:"−(square) is ≤ 0 everywhere, never positive." },
      { id:"a2_ff_15", topic:"Function Features", difficulty:"Easy", question:"Is f(x) = x² even, odd, or neither?", choices:["Even","Odd","Neither","Both"], answer:0, hint:"f(−x) = x² = f(x), so it's even (symmetric about y-axis)." },
      { id:"a2_ff_16", topic:"Function Features", difficulty:"Easy", question:"Is f(x) = x³ even, odd, or neither?", choices:["Odd","Even","Neither","Both"], answer:0, hint:"f(−x) = −x³ = −f(x), so it's odd (symmetric about origin)." },
      { id:"a2_ff_17", topic:"Function Features", difficulty:"Medium", question:"Which function is EVEN?", choices:["f(x) = x⁴ − 2x²","f(x) = x³","f(x) = x³ + x","f(x) = 2x"], answer:0, hint:"Only even powers (and constants) → even function." },
      { id:"a2_ff_18", topic:"Function Features", difficulty:"Medium", question:"Which function is ODD?", choices:["f(x) = x³ − x","f(x) = x² + 1","f(x) = x² ","f(x) = x⁴"], answer:0, hint:"Only odd powers → odd function; f(−x) = −f(x)." },
      { id:"a2_ff_19", topic:"Function Features", difficulty:"Medium", question:"An even function is symmetric about the...", choices:["y-axis","x-axis","origin","line y = x"], answer:0, hint:"Even functions mirror across the y-axis." },
      { id:"a2_ff_20", topic:"Function Features", difficulty:"Medium", question:"An odd function is symmetric about the...", choices:["origin","y-axis","x-axis","line y = x"], answer:0, hint:"Odd functions have rotational symmetry about the origin." },
      { id:"a2_ff_21", topic:"Function Features", difficulty:"Hard", question:"If f(−x) = f(x) for all x, then f is...", choices:["Even","Odd","Neither","Linear"], answer:0, hint:"That's the definition of an even function." },
      { id:"a2_ff_22", topic:"Function Features", difficulty:"Hard", question:"Is f(x) = x³ + x² even, odd, or neither?", choices:["Neither","Even","Odd","Both"], answer:0, hint:"Mixing odd and even powers → neither symmetry holds." },
      { id:"a2_ff_23", topic:"Function Features", difficulty:"Hard", question:"f is odd and f(3) = 5. What is f(−3)?", choices:["−5","5","3","−3"], answer:0, hint:"Odd functions: f(−x) = −f(x), so f(−3) = −5." },
      { id:"a2_ff_24", topic:"Function Features", difficulty:"Hard", question:"f is even and f(−2) = 7. What is f(2)?", choices:["7","−7","2","−2"], answer:0, hint:"Even functions: f(−x) = f(x), so f(2) = 7." },
      { id:"a2_ff_25", topic:"Function Features", difficulty:"Easy", question:"On what interval is f(x) = x² increasing?", choices:["x > 0","x < 0","all x","never"], answer:0, hint:"To the right of the vertex (0,0) the parabola rises." },
      { id:"a2_ff_26", topic:"Function Features", difficulty:"Easy", question:"On what interval is f(x) = x² decreasing?", choices:["x < 0","x > 0","all x","never"], answer:0, hint:"Left of the vertex it falls." },
      { id:"a2_ff_27", topic:"Function Features", difficulty:"Medium", question:"A line y = 3x + 1 is...", choices:["Always increasing","Always decreasing","Increasing then decreasing","Constant"], answer:0, hint:"Positive slope means always increasing." },
      { id:"a2_ff_28", topic:"Function Features", difficulty:"Medium", question:"A line y = −2x + 5 is...", choices:["Always decreasing","Always increasing","Constant","Increasing then decreasing"], answer:0, hint:"Negative slope means always decreasing." },
      { id:"a2_ff_29", topic:"Function Features", difficulty:"Medium", question:"The vertex of y = (x − 2)² + 1 is a...", choices:["Minimum","Maximum","Inflection point","x-intercept"], answer:0, hint:"Upward parabola → vertex is the lowest point (minimum)." },
      { id:"a2_ff_30", topic:"Function Features", difficulty:"Hard", question:"For f(x) = x² − 6x, on what interval is f decreasing?", choices:["x < 3","x > 3","all x","x < 0"], answer:0, hint:"Vertex at x = 3; decreasing to the left of it." },
      { id:"a2_ff_31", topic:"Function Features", difficulty:"Hard", question:"A cubic f(x) = x³ is...", choices:["Always increasing","Always decreasing","Increasing then decreasing","Decreasing then increasing"], answer:0, hint:"x³ rises everywhere (flat tangent only at origin)." },
      { id:"a2_ff_32", topic:"Function Features", difficulty:"Hard", question:"f(x) = −(x + 1)² + 4 increases on which interval?", choices:["x < −1","x > −1","all x","never"], answer:0, hint:"Downward parabola with vertex at x = −1; rises to the left." },
      { id:"a2_ff_33", topic:"Function Features", difficulty:"Easy", question:"What is the domain of f(x) = x² ?", choices:["All real numbers","x ≥ 0","x ≠ 0","x > 0"], answer:0, hint:"Polynomials accept every real input." },
      { id:"a2_ff_34", topic:"Function Features", difficulty:"Medium", question:"What is the domain of f(x) = √x ?", choices:["x ≥ 0","x > 0","all reals","x ≤ 0"], answer:0, hint:"Square roots need a non-negative radicand." },
      { id:"a2_ff_35", topic:"Function Features", difficulty:"Medium", question:"What is the domain of f(x) = 1/(x − 3) ?", choices:["x ≠ 3","x ≠ 0","x ≥ 3","all reals"], answer:0, hint:"Denominator can't be zero, so x ≠ 3." },
      { id:"a2_ff_36", topic:"Function Features", difficulty:"Medium", question:"What is the domain of f(x) = √(x − 5) ?", choices:["x ≥ 5","x ≤ 5","x > 5","x ≠ 5"], answer:0, hint:"Need x − 5 ≥ 0." },
      { id:"a2_ff_37", topic:"Function Features", difficulty:"Hard", question:"Domain of f(x) = 1/√(x − 2) ?", choices:["x > 2","x ≥ 2","x ≠ 2","x < 2"], answer:0, hint:"Radicand must be positive (can't be 0 in the denominator): x − 2 > 0." },
      { id:"a2_ff_38", topic:"Function Features", difficulty:"Hard", question:"Domain of f(x) = (x + 1)/(x² − 9) ?", choices:["x ≠ ±3","x ≠ 3","x ≠ −1","all reals"], answer:0, hint:"x² − 9 = 0 at x = ±3, so exclude both." },
      { id:"a2_ff_39", topic:"Function Features", difficulty:"Easy", question:"What is the domain of the line y = 2x + 1 ?", choices:["All real numbers","x ≥ 0","x ≠ 1","x > 0"], answer:0, hint:"Lines are defined for every x." },
      { id:"a2_ff_40", topic:"Function Features", difficulty:"Medium", question:"What is the range of f(x) = x² ?", choices:["y ≥ 0","y ≤ 0","all reals","y > 0"], answer:0, hint:"Squares are never negative; minimum output is 0." },
      { id:"a2_ff_41", topic:"Function Features", difficulty:"Medium", question:"What is the range of f(x) = −x² ?", choices:["y ≤ 0","y ≥ 0","all reals","y < 0"], answer:0, hint:"Downward parabola maxes at 0." },
      { id:"a2_ff_42", topic:"Function Features", difficulty:"Medium", question:"What is the range of f(x) = x² + 3 ?", choices:["y ≥ 3","y ≤ 3","all reals","y > 3"], answer:0, hint:"Vertex at (0, 3); opens up." },
      { id:"a2_ff_43", topic:"Function Features", difficulty:"Medium", question:"What is the range of f(x) = |x| ?", choices:["y ≥ 0","y ≤ 0","all reals","y > 0"], answer:0, hint:"Absolute value outputs are non-negative." },
      { id:"a2_ff_44", topic:"Function Features", difficulty:"Hard", question:"Range of f(x) = (x − 1)² − 4 ?", choices:["y ≥ −4","y ≤ −4","all reals","y ≥ 1"], answer:0, hint:"Vertex (1, −4), opens up → minimum −4." },
      { id:"a2_ff_45", topic:"Function Features", difficulty:"Hard", question:"Range of f(x) = 2ˣ ?", choices:["y > 0","y ≥ 0","all reals","y > 1"], answer:0, hint:"Exponentials are always positive, approaching but never reaching 0." },
      { id:"a2_ff_46", topic:"Function Features", difficulty:"Hard", question:"Range of f(x) = −(x + 2)² + 5 ?", choices:["y ≤ 5","y ≥ 5","all reals","y ≤ −2"], answer:0, hint:"Downward parabola, vertex (−2, 5) → max 5." },
      { id:"a2_ff_47", topic:"Function Features", difficulty:"Easy", question:"What is the y-intercept of f(x) = x² − 4 ?", choices:["(0, −4)","(0, 4)","(−4, 0)","(2, 0)"], answer:0, hint:"Set x = 0: f(0) = −4." },
      { id:"a2_ff_48", topic:"Function Features", difficulty:"Easy", question:"What are the x-intercepts of f(x) = x² − 9 ?", choices:["(3,0) and (−3,0)","(9,0) only","(0,9)","(0,−9)"], answer:0, hint:"Set y = 0: x² = 9 → x = ±3." },
      { id:"a2_ff_49", topic:"Function Features", difficulty:"Medium", question:"The x-intercepts of f(x) = (x − 2)(x + 5) are...", choices:["x = 2 and x = −5","x = −2 and x = 5","x = 2 and x = 5","x = 10"], answer:0, hint:"Set each factor to zero." },
      { id:"a2_ff_50", topic:"Function Features", difficulty:"Medium", question:"What is the y-intercept of f(x) = 3x³ − 2x + 7 ?", choices:["(0, 7)","(7, 0)","(0, −2)","(0, 3)"], answer:0, hint:"f(0) = 7." },
      { id:"a2_ff_51", topic:"Function Features", difficulty:"Hard", question:"How many x-intercepts does f(x) = x² + 1 have?", choices:["0","1","2","infinite"], answer:0, hint:"x² + 1 = 0 has no real solutions (discriminant < 0)." },
      { id:"a2_ff_52", topic:"Function Features", difficulty:"Hard", question:"f(x) = x³ − x. Find all x-intercepts.", choices:["x = 0, 1, −1","x = 0, 1","x = 1, −1","x = 0 only"], answer:0, hint:"Factor: x(x − 1)(x + 1) = 0." },
      { id:"a2_pf_1", topic:"Parent Functions Library", difficulty:"Easy", question:"What is the parent function for a straight line through the origin with slope 1?", choices:["y = x","y = x²","y = |x|","y = 1/x"], answer:0, hint:"The linear parent function is y = x." },
      { id:"a2_pf_2", topic:"Parent Functions Library", difficulty:"Easy", question:"y = x is shifted UP 3. New equation?", choices:["y = x + 3","y = x − 3","y = 3x","y = (x+3)"], answer:0, hint:"Adding outside shifts vertically up." },
      { id:"a2_pf_3", topic:"Parent Functions Library", difficulty:"Medium", question:"y = x is shifted RIGHT 2. New equation?", choices:["y = x − 2","y = x + 2","y = 2x","y = −x + 2"], answer:0, hint:"Inside the function, right means subtract: (x − 2)." },
      { id:"a2_pf_4", topic:"Parent Functions Library", difficulty:"Medium", question:"y = x reflected over the x-axis becomes?", choices:["y = −x","y = x","y = |x|","y = 1/x"], answer:0, hint:"A reflection over x-axis negates the output." },
      { id:"a2_pf_5", topic:"Parent Functions Library", difficulty:"Medium", question:"y = x with a vertical stretch by 4 becomes?", choices:["y = 4x","y = x + 4","y = x/4","y = x − 4"], answer:0, hint:"Multiply the function by 4." },
      { id:"a2_pf_6", topic:"Parent Functions Library", difficulty:"Hard", question:"y = x shifted left 1 and down 5. New equation?", choices:["y = (x + 1) − 5","y = (x − 1) + 5","y = (x + 1) + 5","y = (x − 1) − 5"], answer:0, hint:"Left 1 → (x+1); down 5 → −5." },
      { id:"a2_pf_7", topic:"Parent Functions Library", difficulty:"Hard", question:"Point (2, 2) is on y = x. After y = x − 4, where does it move?", choices:["(2, −2)","(6, 2)","(2, 6)","(−2, 2)"], answer:0, hint:"−4 lowers every output by 4: 2 − 4 = −2." },
      { id:"a2_pf_8", topic:"Parent Functions Library", difficulty:"Easy", question:"What is the parent function of a basic parabola?", choices:["y = x²","y = x","y = x³","y = √x"], answer:0, hint:"The quadratic parent function is y = x²." },
      { id:"a2_pf_9", topic:"Parent Functions Library", difficulty:"Easy", question:"y = x² shifted UP 6. New equation?", choices:["y = x² + 6","y = x² − 6","y = (x+6)²","y = 6x²"], answer:0, hint:"Add outside to shift up." },
      { id:"a2_pf_10", topic:"Parent Functions Library", difficulty:"Medium", question:"y = x² shifted LEFT 3. New equation?", choices:["y = (x + 3)²","y = (x − 3)²","y = x² + 3","y = x² − 3"], answer:0, hint:"Left → add inside: (x + 3)²." },
      { id:"a2_pf_11", topic:"Parent Functions Library", difficulty:"Medium", question:"y = x² reflected over the x-axis (opens down)?", choices:["y = −x²","y = x²","y = (−x)²","y = 1/x²"], answer:0, hint:"Negative in front flips it downward." },
      { id:"a2_pf_12", topic:"Parent Functions Library", difficulty:"Medium", question:"y = x² vertically stretched by 2. New equation?", choices:["y = 2x²","y = x² + 2","y = (2x)²","y = x²/2"], answer:0, hint:"Multiply the squared term by 2." },
      { id:"a2_pf_13", topic:"Parent Functions Library", difficulty:"Hard", question:"Vertex of y = (x − 4)² + 1 ?", choices:["(4, 1)","(−4, 1)","(4, −1)","(1, 4)"], answer:0, hint:"Vertex form a(x−h)²+k has vertex (h, k)." },
      { id:"a2_pf_14", topic:"Parent Functions Library", difficulty:"Hard", question:"y = x² is shifted right 2, down 3, and reflected down. Equation?", choices:["y = −(x − 2)² − 3","y = −(x + 2)² − 3","y = (x − 2)² − 3","y = −(x − 2)² + 3"], answer:0, hint:"Reflect: −; right 2: (x−2); down 3: −3." },
      { id:"a2_pf_15", topic:"Parent Functions Library", difficulty:"Easy", question:"What is the cubic parent function?", choices:["y = x³","y = x²","y = x","y = |x|"], answer:0, hint:"The cubic parent function is y = x³." },
      { id:"a2_pf_16", topic:"Parent Functions Library", difficulty:"Easy", question:"y = x³ shifted DOWN 2. New equation?", choices:["y = x³ − 2","y = x³ + 2","y = (x−2)³","y = 2x³"], answer:0, hint:"Subtract outside to shift down." },
      { id:"a2_pf_17", topic:"Parent Functions Library", difficulty:"Medium", question:"y = x³ shifted RIGHT 5. New equation?", choices:["y = (x − 5)³","y = (x + 5)³","y = x³ − 5","y = x³ + 5"], answer:0, hint:"Right → subtract inside." },
      { id:"a2_pf_18", topic:"Parent Functions Library", difficulty:"Medium", question:"y = x³ reflected over the x-axis?", choices:["y = −x³","y = x³","y = (−x)³","both A and C"], answer:0, hint:"For odd functions −x³ and (−x)³ are equal; A is the standard form." },
      { id:"a2_pf_19", topic:"Parent Functions Library", difficulty:"Medium", question:"y = x³ vertically compressed by 1/2. New equation?", choices:["y = ½x³","y = 2x³","y = x³ + ½","y = (½x)³"], answer:0, hint:"Multiply by the fraction ½." },
      { id:"a2_pf_20", topic:"Parent Functions Library", difficulty:"Hard", question:"Point of inflection of y = (x + 1)³ − 4 ?", choices:["(−1, −4)","(1, −4)","(−1, 4)","(4, −1)"], answer:0, hint:"The cubic's center moves to (h, k) = (−1, −4)." },
      { id:"a2_pf_21", topic:"Parent Functions Library", difficulty:"Hard", question:"(1, 1) is on y = x³. After y = (x − 2)³ + 5, it maps to?", choices:["(3, 6)","(−1, 6)","(3, 4)","(1, 6)"], answer:0, hint:"Right 2 (x: 1→3), up 5 (y: 1→6)." },
      { id:"a2_pf_22", topic:"Parent Functions Library", difficulty:"Easy", question:"What is the square root parent function?", choices:["y = √x","y = x²","y = |x|","y = 1/x"], answer:0, hint:"The radical parent function is y = √x." },
      { id:"a2_pf_23", topic:"Parent Functions Library", difficulty:"Easy", question:"Domain of the parent y = √x ?", choices:["x ≥ 0","all reals","x > 0","x ≤ 0"], answer:0, hint:"You can't take the square root of a negative." },
      { id:"a2_pf_24", topic:"Parent Functions Library", difficulty:"Medium", question:"y = √x shifted UP 4. New equation?", choices:["y = √x + 4","y = √(x + 4)","y = √(x − 4)","y = √x − 4"], answer:0, hint:"Add outside the radical for vertical shift." },
      { id:"a2_pf_25", topic:"Parent Functions Library", difficulty:"Medium", question:"y = √x shifted RIGHT 9. New equation?", choices:["y = √(x − 9)","y = √(x + 9)","y = √x − 9","y = √x + 9"], answer:0, hint:"Right → subtract inside: √(x − 9)." },
      { id:"a2_pf_26", topic:"Parent Functions Library", difficulty:"Medium", question:"y = √x reflected over the x-axis?", choices:["y = −√x","y = √(−x)","y = √x","y = 1/√x"], answer:0, hint:"Negative outside flips it down." },
      { id:"a2_pf_27", topic:"Parent Functions Library", difficulty:"Hard", question:"Domain of y = √(x − 3) ?", choices:["x ≥ 3","x ≥ 0","x ≥ −3","x ≤ 3"], answer:0, hint:"Need x − 3 ≥ 0." },
      { id:"a2_pf_28", topic:"Parent Functions Library", difficulty:"Hard", question:"y = √x reflected over the y-axis becomes y = √(−x). Its domain?", choices:["x ≤ 0","x ≥ 0","all reals","x < 0"], answer:0, hint:"Need −x ≥ 0, so x ≤ 0." },
      { id:"a2_pf_29", topic:"Parent Functions Library", difficulty:"Easy", question:"What is the absolute value parent function?", choices:["y = |x|","y = x","y = x²","y = √x"], answer:0, hint:"The V-shaped parent function is y = |x|." },
      { id:"a2_pf_30", topic:"Parent Functions Library", difficulty:"Easy", question:"y = |x| shifted UP 2. New equation?", choices:["y = |x| + 2","y = |x + 2|","y = |x − 2|","y = |x| − 2"], answer:0, hint:"Add outside to move the V up." },
      { id:"a2_pf_31", topic:"Parent Functions Library", difficulty:"Medium", question:"y = |x| shifted LEFT 5. New equation?", choices:["y = |x + 5|","y = |x − 5|","y = |x| + 5","y = |x| − 5"], answer:0, hint:"Left → add inside: |x + 5|." },
      { id:"a2_pf_32", topic:"Parent Functions Library", difficulty:"Medium", question:"y = |x| reflected over the x-axis (opens down)?", choices:["y = −|x|","y = |−x|","y = |x|","y = 1/|x|"], answer:0, hint:"Negative in front flips the V downward." },
      { id:"a2_pf_33", topic:"Parent Functions Library", difficulty:"Medium", question:"y = |x| vertically stretched by 3. New equation?", choices:["y = 3|x|","y = |3x|","y = |x| + 3","y = |x|/3"], answer:0, hint:"Multiply the absolute value by 3." },
      { id:"a2_pf_34", topic:"Parent Functions Library", difficulty:"Hard", question:"Vertex of y = |x − 2| + 7 ?", choices:["(2, 7)","(−2, 7)","(2, −7)","(7, 2)"], answer:0, hint:"The corner sits at (h, k) = (2, 7)." },
      { id:"a2_pf_35", topic:"Parent Functions Library", difficulty:"Hard", question:"y = |x| shifted right 4, down 1, reflected down. Equation?", choices:["y = −|x − 4| − 1","y = −|x + 4| − 1","y = |x − 4| − 1","y = −|x − 4| + 1"], answer:0, hint:"Reflect −; right 4: (x−4); down 1: −1." },
      { id:"a2_pf_36", topic:"Parent Functions Library", difficulty:"Easy", question:"Which is an exponential parent function?", choices:["y = 2ˣ","y = x²","y = 2x","y = √x"], answer:0, hint:"Variable in the exponent → exponential." },
      { id:"a2_pf_37", topic:"Parent Functions Library", difficulty:"Easy", question:"Range of the parent y = 2ˣ ?", choices:["y > 0","y ≥ 0","all reals","y > 1"], answer:0, hint:"Exponentials stay above the x-axis." },
      { id:"a2_pf_38", topic:"Parent Functions Library", difficulty:"Medium", question:"y = 2ˣ shifted UP 3. New equation?", choices:["y = 2ˣ + 3","y = 2^(x+3)","y = 2^(x−3)","y = 2ˣ − 3"], answer:0, hint:"Add outside the power." },
      { id:"a2_pf_39", topic:"Parent Functions Library", difficulty:"Medium", question:"y = 2ˣ shifted RIGHT 1. New equation?", choices:["y = 2^(x − 1)","y = 2^(x + 1)","y = 2ˣ − 1","y = 2ˣ + 1"], answer:0, hint:"Right → subtract inside the exponent." },
      { id:"a2_pf_40", topic:"Parent Functions Library", difficulty:"Medium", question:"The horizontal asymptote of y = 2ˣ is?", choices:["y = 0","y = 1","x = 0","y = 2"], answer:0, hint:"As x → −∞, 2ˣ approaches 0." },
      { id:"a2_pf_41", topic:"Parent Functions Library", difficulty:"Hard", question:"y = 2ˣ shifted up 5. New horizontal asymptote?", choices:["y = 5","y = 0","y = 2","y = 7"], answer:0, hint:"The asymptote shifts up with the graph." },
      { id:"a2_pf_42", topic:"Parent Functions Library", difficulty:"Hard", question:"y = 2ˣ reflected over the x-axis. Its range?", choices:["y < 0","y > 0","all reals","y ≤ 0"], answer:0, hint:"Flipping down makes all outputs negative." },
      { id:"a2_pf_43", topic:"Parent Functions Library", difficulty:"Easy", question:"Which is a logarithmic parent function?", choices:["y = log x","y = x log","y = 10ˣ","y = x²"], answer:0, hint:"y = log x is the log parent (inverse of 10ˣ)." },
      { id:"a2_pf_44", topic:"Parent Functions Library", difficulty:"Easy", question:"Domain of the parent y = log x ?", choices:["x > 0","x ≥ 0","all reals","x < 0"], answer:0, hint:"You can only take logs of positive numbers." },
      { id:"a2_pf_45", topic:"Parent Functions Library", difficulty:"Medium", question:"y = log x shifted UP 2. New equation?", choices:["y = log x + 2","y = log(x + 2)","y = log(x − 2)","y = log x − 2"], answer:0, hint:"Add outside the log." },
      { id:"a2_pf_46", topic:"Parent Functions Library", difficulty:"Medium", question:"y = log x shifted RIGHT 4. New equation?", choices:["y = log(x − 4)","y = log(x + 4)","y = log x − 4","y = log x + 4"], answer:0, hint:"Right → subtract inside." },
      { id:"a2_pf_47", topic:"Parent Functions Library", difficulty:"Medium", question:"The vertical asymptote of y = log x is?", choices:["x = 0","y = 0","x = 1","y = 1"], answer:0, hint:"Log curves hug the y-axis (x = 0)." },
      { id:"a2_pf_48", topic:"Parent Functions Library", difficulty:"Hard", question:"y = log x shifted right 3. New vertical asymptote?", choices:["x = 3","x = 0","x = −3","y = 3"], answer:0, hint:"The asymptote moves right with the graph." },
      { id:"a2_pf_49", topic:"Parent Functions Library", difficulty:"Hard", question:"Domain of y = log(x − 5) ?", choices:["x > 5","x ≥ 5","x > 0","x > −5"], answer:0, hint:"Need x − 5 > 0." },
      { id:"a2_pf_50", topic:"Parent Functions Library", difficulty:"Easy", question:"Which is the reciprocal parent function?", choices:["y = 1/x","y = x","y = x²","y = √x"], answer:0, hint:"y = 1/x is the rational/reciprocal parent." },
      { id:"a2_pf_51", topic:"Parent Functions Library", difficulty:"Easy", question:"What value is excluded from the domain of y = 1/x ?", choices:["0","1","−1","all"], answer:0, hint:"You can't divide by zero, so x ≠ 0." },
      { id:"a2_pf_52", topic:"Parent Functions Library", difficulty:"Medium", question:"y = 1/x shifted UP 1. New equation?", choices:["y = 1/x + 1","y = 1/(x+1)","y = 1/(x−1)","y = 1/x − 1"], answer:0, hint:"Add outside the fraction." },
      { id:"a2_pf_53", topic:"Parent Functions Library", difficulty:"Medium", question:"y = 1/x shifted RIGHT 2. New equation?", choices:["y = 1/(x − 2)","y = 1/(x + 2)","y = 1/x − 2","y = 1/x + 2"], answer:0, hint:"Right → subtract inside the denominator." },
      { id:"a2_pf_54", topic:"Parent Functions Library", difficulty:"Medium", question:"Horizontal asymptote of the parent y = 1/x ?", choices:["y = 0","x = 0","y = 1","y = x"], answer:0, hint:"As x → ±∞, 1/x → 0." },
      { id:"a2_pf_55", topic:"Parent Functions Library", difficulty:"Hard", question:"y = 1/x shifted right 3 and up 2. Equations of asymptotes?", choices:["x = 3, y = 2","x = 2, y = 3","x = −3, y = 2","x = 3, y = −2"], answer:0, hint:"Vertical shifts with x (x=3); horizontal shifts with y (y=2)." },
      { id:"a2_pf_56", topic:"Parent Functions Library", difficulty:"Hard", question:"y = 1/x reflected over the x-axis becomes?", choices:["y = −1/x","y = 1/(−x)","y = 1/x","both A and B"], answer:0, hint:"−1/x flips outputs; for this odd function 1/(−x) equals it too — A is standard." },
      { id:"a2_pf_57", topic:"Parent Functions Library", difficulty:"Easy", question:"Which is the cube root parent function?", choices:["y = ∛x","y = √x","y = x³","y = 1/x"], answer:0, hint:"y = ∛x is the cube root parent." },
      { id:"a2_pf_58", topic:"Parent Functions Library", difficulty:"Easy", question:"Domain of the parent y = ∛x ?", choices:["all real numbers","x ≥ 0","x > 0","x ≠ 0"], answer:0, hint:"Cube roots accept negatives too — all reals." },
      { id:"a2_pf_59", topic:"Parent Functions Library", difficulty:"Medium", question:"y = ∛x shifted DOWN 3. New equation?", choices:["y = ∛x − 3","y = ∛(x − 3)","y = ∛(x + 3)","y = ∛x + 3"], answer:0, hint:"Subtract outside the radical." },
      { id:"a2_pf_60", topic:"Parent Functions Library", difficulty:"Medium", question:"y = ∛x shifted LEFT 8. New equation?", choices:["y = ∛(x + 8)","y = ∛(x − 8)","y = ∛x + 8","y = ∛x − 8"], answer:0, hint:"Left → add inside." },
      { id:"a2_pf_61", topic:"Parent Functions Library", difficulty:"Medium", question:"Range of the parent y = ∛x ?", choices:["all real numbers","y ≥ 0","y > 0","y ≤ 0"], answer:0, hint:"Cube root outputs cover all reals." },
      { id:"a2_pf_62", topic:"Parent Functions Library", difficulty:"Hard", question:"y = ∛x reflected over the x-axis. New equation?", choices:["y = −∛x","y = ∛(−x)","y = ∛x","both A and B"], answer:0, hint:"−∛x flips it; cube root is odd so ∛(−x) matches — A is standard." },
      { id:"a2_pf_63", topic:"Parent Functions Library", difficulty:"Hard", question:"(8, 2) is on y = ∛x. After y = ∛(x) + 4, it maps to?", choices:["(8, 6)","(12, 2)","(8, 2)","(4, 6)"], answer:0, hint:"+4 raises output: 2 + 4 = 6." },
    ],
  },

  upperelementary: {
    id: "upperelementary", label: "Upper Elementary", emoji: "EL",
    color: "#EA580C", bg: "#FFF1E6", dark: "#C2410C",
    tagline: "4th grade word problems",
    topics: [
      { name: "Multiplication", icon: "", color: "#EA580C", bg: "#FFF1E6" },
      { name: "Division", icon: "", color: C.sky, bg: "#E5F2FF" },
      { name: "Comparing Numbers", icon: "", color: C.violet, bg: C.lavender },
      { name: "Multi-Step Problems", icon: "", color: C.teal, bg: C.mint },
    ],
    seeds: [
      { id:"ue_1", topic:"Multiplication", difficulty:"Easy", question:"A classroom has 6 rows of desks with 5 desks in each row. How many desks in all?", choices:["30","11","25","36"], answer:0, hint:"Multiply rows by desks: 6 × 5." },
      { id:"ue_2", topic:"Multiplication", difficulty:"Easy", question:"Each pizza has 8 slices. How many slices are in 4 pizzas?", choices:["32","12","24","16"], answer:0, hint:"4 groups of 8: 4 × 8." },
      { id:"ue_3", topic:"Multiplication", difficulty:"Easy", question:"A bag holds 7 marbles. How many marbles in 6 bags?", choices:["42","13","36","48"], answer:0, hint:"6 × 7." },
      { id:"ue_4", topic:"Multiplication", difficulty:"Easy", question:"There are 9 boxes with 3 toys each. How many toys total?", choices:["27","12","18","30"], answer:0, hint:"9 × 3." },
      { id:"ue_5", topic:"Multiplication", difficulty:"Easy", question:"A book has 5 chapters, each with 10 pages. How many pages?", choices:["50","15","40","55"], answer:0, hint:"5 × 10." },
      { id:"ue_6", topic:"Multiplication", difficulty:"Medium", question:"A theater has 12 rows with 8 seats each. How many seats?", choices:["96","20","104","88"], answer:0, hint:"12 × 8." },
      { id:"ue_7", topic:"Multiplication", difficulty:"Medium", question:"Each crate holds 24 apples. How many apples in 5 crates?", choices:["120","29","100","125"], answer:0, hint:"5 × 24." },
      { id:"ue_8", topic:"Multiplication", difficulty:"Medium", question:"A farmer plants 15 rows of corn with 6 plants per row. How many plants?", choices:["90","21","80","96"], answer:0, hint:"15 × 6." },
      { id:"ue_9", topic:"Multiplication", difficulty:"Medium", question:"A store sells notebooks in packs of 4. How many notebooks in 23 packs?", choices:["92","27","82","96"], answer:0, hint:"23 × 4." },
      { id:"ue_10", topic:"Multiplication", difficulty:"Medium", question:"A school bus carries 36 students. How many students do 7 buses carry?", choices:["252","43","245","259"], answer:0, hint:"7 × 36." },
      { id:"ue_11", topic:"Multiplication", difficulty:"Hard", question:"A factory makes 125 toys each day. How many toys in 6 days?", choices:["750","131","720","756"], answer:0, hint:"125 × 6." },
      { id:"ue_12", topic:"Multiplication", difficulty:"Hard", question:"Each library shelf holds 48 books. A bookcase has 9 shelves. How many books fit?", choices:["432","57","424","440"], answer:0, hint:"48 × 9." },
      { id:"ue_13", topic:"Multiplication", difficulty:"Hard", question:"A stadium has 8 sections, each with 145 seats. How many total seats?", choices:["1,160","153","1,150","1,165"], answer:0, hint:"145 × 8." },
      { id:"ue_14", topic:"Division", difficulty:"Easy", question:"36 cookies are shared equally among 6 children. How many does each get?", choices:["6","30","42","9"], answer:0, hint:"36 ÷ 6." },
      { id:"ue_15", topic:"Division", difficulty:"Easy", question:"There are 20 students put into teams of 4. How many teams?", choices:["5","16","24","6"], answer:0, hint:"20 ÷ 4." },
      { id:"ue_16", topic:"Division", difficulty:"Easy", question:"48 pencils go into boxes of 8. How many boxes?", choices:["6","40","56","7"], answer:0, hint:"48 ÷ 8." },
      { id:"ue_17", topic:"Division", difficulty:"Easy", question:"A rope 27 feet long is cut into 3 equal pieces. How long is each?", choices:["9","24","30","8"], answer:0, hint:"27 ÷ 3." },
      { id:"ue_18", topic:"Division", difficulty:"Easy", question:"42 stickers shared by 7 friends. How many each?", choices:["6","35","49","7"], answer:0, hint:"42 ÷ 7." },
      { id:"ue_19", topic:"Division", difficulty:"Medium", question:"96 marbles are split evenly into 8 jars. How many in each jar?", choices:["12","88","104","11"], answer:0, hint:"96 ÷ 8." },
      { id:"ue_20", topic:"Division", difficulty:"Medium", question:"A baker has 144 muffins packed 12 to a box. How many boxes?", choices:["12","132","156","11"], answer:0, hint:"144 ÷ 12." },
      { id:"ue_21", topic:"Division", difficulty:"Medium", question:"225 students board buses that each hold 45. How many buses?", choices:["5","180","270","6"], answer:0, hint:"225 ÷ 45." },
      { id:"ue_22", topic:"Division", difficulty:"Medium", question:"A teacher divides 84 markers among 6 tables. How many per table?", choices:["14","78","90","13"], answer:0, hint:"84 ÷ 6." },
      { id:"ue_23", topic:"Division", difficulty:"Medium", question:"156 trading cards are shared equally by 4 kids. How many each?", choices:["39","152","160","38"], answer:0, hint:"156 ÷ 4." },
      { id:"ue_24", topic:"Division", difficulty:"Hard", question:"A school orders 365 books packed 7 to a box. How many full boxes, and how many left over?", choices:["52 boxes, 1 left","51 boxes, 8 left","52 boxes, 0 left","53 boxes, 2 left"], answer:0, hint:"365 ÷ 7 = 52 remainder 1." },
      { id:"ue_25", topic:"Division", difficulty:"Hard", question:"450 cupcakes are placed on trays of 8. How many full trays and how many cupcakes left?", choices:["56 trays, 2 left","56 trays, 0 left","55 trays, 10 left","57 trays, 6 left"], answer:0, hint:"450 ÷ 8 = 56 remainder 2." },
      { id:"ue_26", topic:"Division", difficulty:"Hard", question:"A field trip has 213 students with 1 chaperone per 9 students. How many chaperones are needed?", choices:["24","23","21","25"], answer:0, hint:"213 ÷ 9 = 23 r 6 — you still need 1 more for the leftover, so 24." },
      { id:"ue_27", topic:"Comparing Numbers", difficulty:"Easy", question:"Which number is greater: 4,506 or 4,560?", choices:["4,560","4,506","They are equal","Can't tell"], answer:0, hint:"Compare the tens place: 6 tens vs 0 tens." },
      { id:"ue_28", topic:"Comparing Numbers", difficulty:"Easy", question:"Which symbol makes it true: 3,209 ___ 3,290 ?", choices:["<","=",">","≤... none"], answer:0, hint:"3,209 is less than 3,290." },
      { id:"ue_29", topic:"Comparing Numbers", difficulty:"Easy", question:"Order from least to greatest: 812, 821, 128.", choices:["128, 812, 821","812, 821, 128","128, 821, 812","821, 812, 128"], answer:0, hint:"128 is smallest (1 hundred); then 812, then 821." },
      { id:"ue_30", topic:"Comparing Numbers", difficulty:"Easy", question:"Which is the largest? 5,000 4,999 5,001 4,909", choices:["5,001","5,000","4,999","4,909"], answer:0, hint:"5,001 has the most — compare ones after the thousands match." },
      { id:"ue_31", topic:"Comparing Numbers", difficulty:"Easy", question:"Round 6,481 to the nearest thousand.", choices:["6,000","7,000","6,500","6,400"], answer:0, hint:"The hundreds digit is 4, so round down." },
      { id:"ue_32", topic:"Comparing Numbers", difficulty:"Medium", question:"A store sold 3,452 toys in May and 3,425 in June. Which month sold more?", choices:["May","June","Same","Can't tell"], answer:0, hint:"3,452 > 3,425 (compare the tens place)." },
      { id:"ue_33", topic:"Comparing Numbers", difficulty:"Medium", question:"Round 8,749 to the nearest hundred.", choices:["8,700","8,800","8,750","9,000"], answer:0, hint:"Tens digit is 4, so round the hundreds down." },
      { id:"ue_34", topic:"Comparing Numbers", difficulty:"Medium", question:"Which statement is true?", choices:["7,830 > 7,803","7,830 < 7,803","7,830 = 7,803","7,803 > 7,830"], answer:0, hint:"Compare tens: 3 tens vs 0 tens, so 7,830 is greater." },
      { id:"ue_35", topic:"Comparing Numbers", difficulty:"Medium", question:"Two cities have populations 12,408 and 12,480. Which is bigger and by how much?", choices:["12,480 by 72","12,408 by 72","12,480 by 80","12,408 by 80"], answer:0, hint:"12,480 − 12,408 = 72." },
      { id:"ue_36", topic:"Comparing Numbers", difficulty:"Hard", question:"Round 45,672 to the nearest thousand, then to the nearest ten thousand.", choices:["46,000 then 50,000","45,000 then 40,000","46,000 then 40,000","45,000 then 50,000"], answer:0, hint:"Hundreds 6 → 46,000; thousands 5 → 50,000." },
      { id:"ue_37", topic:"Comparing Numbers", difficulty:"Hard", question:"Arrange greatest to least: 9,087 9,807 9,780 9,078.", choices:["9,807, 9,780, 9,087, 9,078","9,087, 9,078, 9,780, 9,807","9,780, 9,807, 9,087, 9,078","9,807, 9,780, 9,078, 9,087"], answer:0, hint:"Compare hundreds: 8,7,0,0 → 9,807 and 9,780 lead, then 9,087 > 9,078." },
      { id:"ue_38", topic:"Multi-Step Problems", difficulty:"Medium", question:"Maria buys 3 packs of pens with 6 pens each, then gives away 5. How many pens does she have?", choices:["13","18","23","11"], answer:0, hint:"3 × 6 = 18, then 18 − 5." },
      { id:"ue_39", topic:"Multi-Step Problems", difficulty:"Medium", question:"A class has 4 tables of 5 students and 2 tables of 6. How many students total?", choices:["32","20","30","34"], answer:0, hint:"(4×5) + (2×6) = 20 + 12." },
      { id:"ue_40", topic:"Multi-Step Problems", difficulty:"Medium", question:"Tom saves $8 a week for 5 weeks, then spends $15. How much is left?", choices:["$25","$40","$23","$55"], answer:0, hint:"8 × 5 = 40, then 40 − 15." },
      { id:"ue_41", topic:"Multi-Step Problems", difficulty:"Medium", question:"A bakery makes 6 trays of 12 muffins. They sell 50. How many are left?", choices:["22","72","18","28"], answer:0, hint:"6 × 12 = 72, then 72 − 50." },
      { id:"ue_42", topic:"Multi-Step Problems", difficulty:"Medium", question:"Sara reads 25 pages on Monday and 18 on Tuesday. The book has 60 pages. How many left?", choices:["17","43","23","7"], answer:0, hint:"25 + 18 = 43, then 60 − 43." },
      { id:"ue_43", topic:"Multi-Step Problems", difficulty:"Medium", question:"A store has 144 apples. They pack 12 per bag and sell 9 bags. How many apples are sold?", choices:["108","12","36","120"], answer:0, hint:"9 bags × 12 = 108 apples sold." },
      { id:"ue_44", topic:"Multi-Step Problems", difficulty:"Hard", question:"A school collects 245 cans Monday and 178 Tuesday, then splits them evenly into 9 boxes. About how many per box?", choices:["47","45","49","43"], answer:0, hint:"245 + 178 = 423; 423 ÷ 9 = 47." },
      { id:"ue_45", topic:"Multi-Step Problems", difficulty:"Hard", question:"4 friends earn $156 together mowing lawns and split it equally. Then each spends $12. How much does each have left?", choices:["$27","$39","$144","$24"], answer:0, hint:"156 ÷ 4 = 39, then 39 − 12." },
      { id:"ue_46", topic:"Multi-Step Problems", difficulty:"Hard", question:"A farmer has 8 baskets of 35 eggs. He sells 6 cartons of 30. How many eggs remain?", choices:["100","280","180","120"], answer:0, hint:"8 × 35 = 280; 6 × 30 = 180; 280 − 180." },
      { id:"ue_47", topic:"Multi-Step Problems", difficulty:"Hard", question:"A library buys 12 boxes of 25 books. They place them evenly on 6 shelves. How many books per shelf?", choices:["50","300","45","60"], answer:0, hint:"12 × 25 = 300; 300 ÷ 6 = 50." },
      { id:"ue_48", topic:"Multi-Step Problems", difficulty:"Hard", question:"A toy store gets 9 cases of 48 toys. After selling 350, how many are left?", choices:["82","432","78","350"], answer:0, hint:"9 × 48 = 432; 432 − 350." },
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
            { label: "Tried", value: score.tried, color: C.sky, bg: "#E5F2FF" },
            { label: "Streak", value: score.streak + (score.streak >= 3 ? " " : ""), color: C.coral, bg: C.blush },
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
        <Chip label="All" icon="" active={topicFilter === "All"} color={course.color} bg={course.bg}
          onClick={() => { setTopicFilter("All"); setIdx(0); setPicked(null); setShowHint(false); }} />
        {course.topics.map(t => (
          <Chip key={t.name} label={t.name} icon={t.icon} active={topicFilter === t.name} color={t.color} bg={t.bg}
            onClick={() => { setTopicFilter(t.name); setIdx(0); setPicked(null); setShowHint(false); }} />
        ))}
      </div>

      {/* Diff chips */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs font-extrabold opacity-40 uppercase tracking-wide">Level:</span>
        <Chip small label="Any" icon="" active={diffFilter === "All"} color={C.ink} bg="#ECEAF6"
          onClick={() => { setDiffFilter("All"); setIdx(0); setPicked(null); setShowHint(false); }} />
        {[{d:"Easy",icon:"",color:C.teal,bg:C.mint},{d:"Medium",icon:"",color:C.orange,bg:C.cream},{d:"Hard",icon:"",color:C.coral,bg:C.blush}].map(x => (
          <Chip small key={x.d} label={x.d} icon={x.icon} active={diffFilter === x.d} color={x.color} bg={x.bg}
            onClick={() => { setDiffFilter(x.d); setIdx(0); setPicked(null); setShowHint(false); }} />
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
            <p className="text-lg sm:text-xl font-bold leading-relaxed mb-5">{current.question}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {current.choices.map((c, i) => {
                const isPicked = picked === i, isRight = i === current.answer;
                let bg = "#F4F2FC", border = "transparent", col = C.ink;
                if (picked !== null) {
                  if (isRight) { bg = C.mint; border = C.teal; col = "#0E7E69"; }
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
                    {c}{picked!==null&&isRight&&" "}{picked!==null&&isPicked&&!isRight&&" "}
                  </button>
                );
              })}
            </div>
            {picked !== null && (
              <div className="mt-4 rounded-2xl px-4 py-3 font-bold text-center"
                style={picked===current.answer ? {background:C.mint,color:"#0E7E69"} : {background:C.blush,color:"#C2374B"}}>
                {picked===current.answer ? ["Nailed it! ","You're on fire! ","Correct — nice work! "][score.right%3] : "Not quite — check the green answer above."}
              </div>
            )}
            {current.hint && (
              <div className="mt-4">
                {!showHint
                  ? <button onClick={() => setShowHint(true)} className="text-sm font-bold px-3 py-1.5 rounded-full" style={{background:C.cream,color:"#B07407"}}> Show hint</button>
                  : <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{background:C.cream,color:"#8A5E06"}}> {current.hint}</div>
                }
              </div>
            )}
            <div className="mt-4 flex gap-2 flex-wrap">
              <button onClick={() => setShowScratchpad(true)} className="text-sm font-bold px-3 py-1.5 rounded-full" style={{background:"#E2FAF4",color:C.teal}}> Scratchpad</button>
            </div>
            <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
              <div>
                {helpSent
                  ? <span className="text-sm font-bold" style={{color:C.teal}}> Help request sent!</span>
                  : <button onClick={() => setHelpOpen(true)} className="text-sm font-bold px-3 py-2 rounded-full" style={{background:"#E5F2FF",color:C.sky}}>Ask my teacher for help</button>
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
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: "Correct", value: score.right, color: C.teal, bg: C.mint },
              { label: "Tried", value: score.tried, color: C.sky, bg: "#E5F2FF" },
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
          <h3 className="text-lg font-extrabold mb-1"> Scratch Pad</h3>
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
    setSettings(next); setPinInput(""); setPinMsg("PIN updated! ");
  };

  const enrolledStudents = Object.values(students).filter(s => s.enrolledCourses?.includes(courseId));

  const addProblem = () => {
    if (!form.question.trim() || form.choices.some(c => !c.trim())) { setFormMsg("Fill in the question and all four choices."); return; }
    onAddProblem({ ...form, id: "t" + Date.now(), question: form.question.trim(), choices: form.choices.map(c => c.trim()), hint: form.hint.trim() });
    setForm({ topic: course.topics[0].name, difficulty: "Easy", question: "", choices:["","","",""], answer:0, hint:"" });
    setFormMsg("Problem published! ");
  };

  const courseURL = buildCourseURL(courseId);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Tab bar */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { id:"students", label:` Students (${enrolledStudents.length})` },
          { id:"problems", label:` Problems (${problems.length})` },
          { id:"add", label:" Add problem" },
          { id:"help", label:` Help${openFlags.length ? ` (${openFlags.length})` : ""}` },
          { id:"settings", label:" Settings" },
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
              {copied ? " Link copied!" : " Copy student link"}
            </button>
          </div>
          {enrolledStudents.length === 0 && (
            <div className="rounded-3xl p-10 text-center bg-white shadow-lg">
              <div className="text-5xl mb-3"></div>
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
                      {revoked ? "Restore" : "Revoke"}
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
                <p className="font-semibold text-sm mb-1">{p ? p.question : "(problem was deleted)"}</p>
                {f.note && <p className="text-sm italic opacity-70 mb-2">"{f.note}"</p>}
                <div className="flex gap-2 mt-2">
                  <button onClick={() => onResolveFlag(f.id)} className="text-xs font-extrabold px-3 py-1.5 rounded-full" style={{background:C.mint,color:"#0E7E69"}}>Mark as helped</button>
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
