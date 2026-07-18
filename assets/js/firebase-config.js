// Firebase Configuration (modular SDK v10, ES module)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDrU-nINRAvMl5t_beZEPkfMjZ5uVE9T_8",
  authDomain: "mlt-site.firebaseapp.com",
  projectId: "mlt-site",
  storageBucket: "mlt-site.appspot.com",
  messagingSenderId: "305436045302",
  appId: "1:305436045302:web:04165a39ec32106051e1d7",
  measurementId: "G-5F51F03G4W"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
