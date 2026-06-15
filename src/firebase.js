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
import { getFirestore } from "firebase/firestore";

// ⬇️ REPLACE this whole block with the config from YOUR Firebase project
const firebaseConfig = {
  apiKey:            "PASTE_YOUR_API_KEY_HERE",
  authDomain:        "your-project-id.firebaseapp.com",
  projectId:         "your-project-id",
  storageBucket:     "your-project-id.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID_HERE",
  appId:             "PASTE_APP_ID_HERE",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
