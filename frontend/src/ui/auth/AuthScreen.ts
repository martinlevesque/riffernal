import { checkSetup, setupAdmin, register, login, type AuthUser } from "../../api/AuthApi.js";

export interface AuthScreenOptions {
  onAuth: (user: AuthUser) => void;
}

type Mode = "loading" | "setup" | "login" | "register";
type AuthMode = Exclude<Mode, "loading">;

const MODE_LABEL: Record<AuthMode, string> = {
  setup: "SETUP",
  login: "LOGIN",
  register: "REGISTER",
};

const SUBMIT_LABEL: Record<AuthMode, string> = {
  setup: "CREATE ACCOUNT",
  login: "LOGIN",
  register: "REGISTER",
};

const PASSWORD_AUTOCOMPLETE: Record<AuthMode, string> = {
  setup: "new-password",
  login: "current-password",
  register: "new-password",
};

const INTRO_HTML = `
  <div class="intro">
    <p class="intro-lead">Your favorite songs as a rhythm game. Damn right.</p>
    <ul class="intro-list">
      <li>Drop in a MIDI, kick some ass</li>
      <li>The song waits while you suck (learn)</li>
      <li>Practice left, right, or both</li>
      <li>Steal songs from the community, chip in if you like</li>
    </ul>
  </div>
`;

export class AuthScreen {
  private _screen: HTMLElement;
  private _opts: AuthScreenOptions;
  private _mode: Mode = "loading";
  private _errorEl: HTMLElement | null = null;

  constructor(opts: AuthScreenOptions) {
    this._opts = opts;
    this._screen = document.getElementById("auth-screen")!;
  }

  async show(): Promise<void> {
    this._screen.classList.add("active");
    try {
      const { needed } = await checkSetup();
      this._mode = needed ? "setup" : "login";
    } catch {
      this._mode = "login";
    }
    this._render();
  }

  hide(): void {
    this._screen.classList.remove("active");
  }

  private _render(): void {
    if (this._mode === "loading") {
      this._screen.innerHTML = `<div class="auth-card"><p class="auth-error">Loading...</p></div>`;
      return;
    }

    const mode = this._mode as AuthMode;
    const hasTagline = mode === "setup" || mode === "register";
    const taglineField = hasTagline
      ? `<label class="auth-field">
           <span class="auth-field-label">Tagline <span class="optional">(optional)</span></span>
           <input type="text" class="auth-input" id="auth-tagline" placeholder="Your motto..." maxlength="128">
         </label>`
      : "";

    const intro = mode === "setup" ? "" : INTRO_HTML;

    const subtitle = mode === "setup"
      ? `<p class="auth-subtitle">Create your admin account to get started</p>`
      : "";

    const toggleHtml = mode === "setup" ? "" : mode === "login"
      ? `<div class="auth-toggle">
           <button id="auth-toggle-btn">No account? <span class="accent">Register</span></button>
         </div>`
      : `<div class="auth-toggle">
           <button id="auth-toggle-btn">Already have an account? <span class="accent">Login</span></button>
         </div>`;

    this._screen.innerHTML = `
      <div class="auth-panel">
        <div class="auth-brand"><span class="accent">RIFF</span>ERNAL</div>
        ${intro}
        <div class="auth-card">
          <h2>${MODE_LABEL[mode]}</h2>
          ${subtitle}
          <form class="auth-form" id="auth-form">
            <label class="auth-field">
              <span class="auth-field-label">Username</span>
              <input type="text" class="auth-input" id="auth-username" placeholder="Username..." maxlength="32" autocomplete="username" required>
            </label>
            ${taglineField}
            <label class="auth-field">
              <span class="auth-field-label">Password</span>
              <input type="password" class="auth-input" id="auth-password" placeholder="Password..." minlength="4" autocomplete="${PASSWORD_AUTOCOMPLETE[mode]}" required>
            </label>
            <div class="auth-error" id="auth-error"></div>
            <div class="auth-actions">
              <button type="submit" class="btn btn-primary" id="auth-submit">${SUBMIT_LABEL[mode]}</button>
            </div>
          </form>
          ${toggleHtml}
        </div>
      </div>
    `;

    this._errorEl = document.getElementById("auth-error");
    this._wireEvents();
  }

  private _wireEvents(): void {
    const form = document.getElementById("auth-form") as HTMLFormElement;
    const toggleBtn = document.getElementById("auth-toggle-btn");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this._handleSubmit();
    });

    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        this._mode = this._mode === "login" ? "register" : "login";
        this._render();
      });
    }
  }

  private _setError(msg: string): void {
    if (this._errorEl) this._errorEl.textContent = msg;
  }

  private async _handleSubmit(): Promise<void> {
    const username = (document.getElementById("auth-username") as HTMLInputElement).value.trim();
    const tagline = (document.getElementById("auth-tagline") as HTMLInputElement | null)?.value.trim() ?? "";
    const password = (document.getElementById("auth-password") as HTMLInputElement).value;
    const submitBtn = document.getElementById("auth-submit") as HTMLButtonElement;

    this._setError("");

    if (!username) {
      this._setError("Username is required");
      return;
    }
    if (!password) {
      this._setError("Password is required");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "...";

    try {
      if (this._mode === "setup") {
        const result = await setupAdmin(username, tagline, password);
        this._opts.onAuth(result.user);
      } else if (this._mode === "login") {
        const result = await login(username, password);
        this._opts.onAuth(result.user);
      } else {
        const result = await register(username, tagline, password);
        this._opts.onAuth(result.user);
      }
    } catch (err) {
      this._setError(err instanceof Error ? err.message : "An error occurred");
      submitBtn.disabled = false;
      submitBtn.textContent = SUBMIT_LABEL[this._mode as AuthMode];
    }
  }
}