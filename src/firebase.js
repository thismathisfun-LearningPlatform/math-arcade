// ═══════════════════════════════════════════════════════════
//  firebase.js  —  put this file in your project's  src/  folder
//  (right next to App.jsx and index.js)
//
//  1. Create a free Firebase project (console.firebase.google.com)
//  2. Add a Web App, copy its config, and paste it below
//  3. Turn on Firestore Database
//  See FIREBASE_SETUP_GUIDE.md for click-by-click instructions.
// ═══════════════════════════════════════════════════════════

import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyA0Eqg7kVSuOWpyEX_zjI8IkakqTQ9NDJU",
    authDomain: "matharcade-272bf.firebaseapp.com",
    projectId: "matharcade-272bf",
    storageBucket: "matharcade-272bf.firebasestorage.app",
    messagingSenderId: "469902060855",
    appId: "1:469902060855:web:1f7d7218ce15d3f8f9beb2",
    measurementId: "G-LYRX75CZN8"
  };

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export const db = getFirestore(app);
