/* ============================================================
   RWG CRM — Login / request-access gate
   ============================================================ */
window.RWG = window.RWG || {};
RWG.views = RWG.views || {};
RWG.views.login = function () {
  const U = RWG.ui;
  return `
  <div id="gate">
    <div class="gate-card">
      <img class="gate-logo" src="assets/img/logo.png" alt="Resilient Wealth Group">
      <p class="gate-brand">Resilient Wealth Group</p>
      <p class="gate-motto">Wealth, Conducted with Purpose</p>

      <div class="gate-tabs">
        <button class="gate-tab active" data-action="gate-tab" data-tab="signin">Sign in</button>
        <button class="gate-tab" data-action="gate-tab" data-tab="signup">Request access</button>
      </div>

      <!-- Sign in -->
      <form data-action="do-login" data-panel="signin">
        <p class="gate-title">Welcome back</p>
        <p class="gate-sub">Sign in to your CRM workspace</p>
        <div class="field-group"><input type="email" id="login-email" placeholder="Email address" autocomplete="username"></div>
        <div class="field-group"><input type="password" id="login-pass" placeholder="Password" autocomplete="current-password"></div>
        <div class="gate-row" style="display:flex;align-items:center;justify-content:space-between;margin:-2px 0 14px">
          <label class="remember-lbl"><input type="checkbox" id="login-remember" checked> Remember me</label>
          <button type="button" class="linklike" data-action="forgot-pass">Forgot password?</button>
        </div>
        <button class="btn btn-gold btn-block" type="submit">Sign in</button>
        <p class="gate-error" id="login-error"></p>
      </form>

      <!-- Request access -->
      <form data-action="do-signup" data-panel="signup" hidden>
        <p class="gate-title">Request an account</p>
        <p class="gate-sub">Your manager approves new agents before access is granted.</p>
        <div class="field-group"><input type="text" id="su-name" placeholder="Full name"></div>
        <div class="field-group"><input type="email" id="su-email" placeholder="Email address"></div>
        <div class="field-group"><input type="password" id="su-pass" placeholder="Create a password"></div>
        <button class="btn btn-navy btn-block" type="submit">Request access</button>
        <p class="gate-error" id="su-error"></p>
        <div id="su-success" hidden class="gate-success">✓ Request sent! You'll be able to sign in once the owner approves your account.</div>
      </form>

      <p class="gate-note">Resilient Wealth Group · secure access. New agents request an account; the owner approves it.</p>
      <p class="gate-note" style="margin-top:10px"><a href="guide.html" target="_blank" rel="noopener" style="color:#C2A14D;font-weight:600;text-decoration:none">New here? Read the quick guide →</a></p>
    </div>
  </div>`;
};
