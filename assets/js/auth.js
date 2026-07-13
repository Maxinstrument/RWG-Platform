/* ============================================================
   RWG CRM — Auth layer (Firebase Authentication)
   Real email/password login. Each account has a Firestore
   profile in `users/{uid}`: the owner email becomes an active
   admin automatically; everyone else starts as a pending agent
   that the owner must approve.
   ============================================================ */
window.RWG = window.RWG || {};
RWG.auth = (function () {
  let _profile = null;       // { id, name, email, role, status, color, createdAt }
  let _pendingName = '';      // carried from the signup form into profile creation
  const COLORS = ['#0E2440', '#2E7D5B', '#B0691F', '#7A4FB5', '#B23A48', '#1F6F8B', '#3C6E47'];
  const pickColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

  // Wire auth-state changes. cb() runs whenever sign-in state / profile changes.
  function init(cb) {
    if (!RWG.fb) { cb(); return; }
    RWG.fb.auth.onAuthStateChanged(async (fbUser) => {
      if (!fbUser) { _profile = null; cb(); return; }
      try {
        const ref = RWG.fb.db.collection('users').doc(fbUser.uid);
        let snap = await ref.get();
        if (!snap.exists) {
          const isOwner = (fbUser.email || '').toLowerCase() === (RWG.OWNER_EMAIL || '').toLowerCase();
          await ref.set({
            name: _pendingName || fbUser.displayName || (fbUser.email || '').split('@')[0],
            email: fbUser.email || '',
            role: isOwner ? 'admin' : 'agent',
            status: isOwner ? 'active' : 'pending',
            color: pickColor(),
            createdAt: Date.now()
          });
          snap = await ref.get();
        }
        _profile = Object.assign({ id: fbUser.uid }, snap.data());
      } catch (e) {
        console.error('Could not load your profile:', e);
        _profile = null;
      }
      cb();
    });
  }

  function currentUser() { return _profile; }
  const isAdmin = () => !!_profile && _profile.role === 'admin';

  async function login(email, password, remember) {
    try {
      // "Remember me" → stay signed in across browser restarts (LOCAL);
      // unchecked → sign out when the browser/tab closes (SESSION).
      const P = firebase.auth.Auth.Persistence;
      await RWG.fb.auth.setPersistence(remember === false ? P.SESSION : P.LOCAL);
      await RWG.fb.auth.signInWithEmailAndPassword((email || '').trim(), password || '');
      return { ok: true };
    } catch (e) { return { ok: false, error: friendly(e) }; }
  }

  async function signup({ name, email, password }) {
    name = (name || '').trim();
    if (!name) return { ok: false, error: 'Please enter your name.' };
    if ((password || '').length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };
    _pendingName = name;
    try {
      await RWG.fb.auth.createUserWithEmailAndPassword((email || '').trim(), password);
      return { ok: true };
    } catch (e) { return { ok: false, error: friendly(e) }; }
  }

  function logout() { _profile = null; return RWG.fb.auth.signOut(); }

  // Email a password-reset link (Firebase hosts the reset page automatically).
  async function resetPassword(email) {
    email = (email || '').trim();
    if (!email) return { ok: false, error: 'Enter your email first, then click “Forgot password?”' };
    try {
      await RWG.fb.auth.sendPasswordResetEmail(email);
      return { ok: true };
    } catch (e) {
      if (e && e.code === 'auth/user-not-found') return { ok: false, error: 'No account found with that email — check the spelling or ask your manager.' };
      return { ok: false, error: friendly(e) };
    }
  }

  function friendly(e) {
    const m = {
      'auth/invalid-email': 'That email address looks invalid.',
      'auth/email-already-in-use': 'An account with that email already exists — try signing in.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/wrong-password': 'Incorrect email or password.',
      'auth/user-not-found': 'Incorrect email or password.',
      'auth/invalid-credential': 'Incorrect email or password.',
      'auth/too-many-requests': 'Too many attempts — please wait a moment and try again.',
      'auth/network-request-failed': 'Network error — check your connection.'
    };
    return (e && m[e.code]) || (e && e.message) || 'Something went wrong. Please try again.';
  }

  return { init, currentUser, isAdmin, login, signup, logout, resetPassword };
})();
