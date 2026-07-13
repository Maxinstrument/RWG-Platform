/* ============================================================
   RWG CRM — Firebase initialization
   Loads the project, exposes RWG.fb = { auth, db } to the app,
   and names the owner account (gets admin role automatically).
   Uses the compat SDK so it works with classic <script> tags.
   ============================================================ */
window.RWG = window.RWG || {};

(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyDPpROKzA3NA-aC0AzUtSeSTy_C_scLjkI",
    authDomain: "resilient-wealth-group.firebaseapp.com",
    projectId: "resilient-wealth-group",
    storageBucket: "resilient-wealth-group.firebasestorage.app",
    messagingSenderId: "635207656747",
    appId: "1:635207656747:web:832aa82484e499a5a8d16e",
    measurementId: "G-WTN30P70NP"
  };

  // The master/owner account — signs in with full admin access automatically.
  RWG.OWNER_EMAIL = "temperan.carlos@gmail.com";

  if (!window.firebase || !firebase.initializeApp) {
    console.error("Firebase SDK failed to load — check your internet connection.");
    RWG.fb = null;
    return;
  }
  firebase.initializeApp(firebaseConfig);
  RWG.fb = { auth: firebase.auth(), db: firebase.firestore() };
})();
