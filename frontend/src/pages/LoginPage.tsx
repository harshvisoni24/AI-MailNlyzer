import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import "./LoginPage.css";
import { api } from "../lib/api";

function Shield() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </svg>
  );
}

const checks = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One number", test: (p: string) => /\d/.test(p) },
];

const empty = { name: "", email: "", userId: "", password: "", confirm: "" };

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("signup"); // new users create an account first
  const [form, setForm] = useState(empty);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const isSignup = mode === "signup";

  const update = (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [e.target.name]: e.target.value });

  const switchMode = (next: "login" | "signup") => {
    setMode(next);
    setError("");
    setNotice("");
    setForm(empty);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");

    if (isSignup) {
      if (form.name.trim().length < 2) return setError("Enter your full name.");
      if (!/^\S+@\S+\.\S+$/.test(form.email)) return setError("Enter a valid email address.");
      if (!/^[a-zA-Z0-9_]{4,20}$/.test(form.userId))
        return setError("User ID must be 4-20 characters: letters, numbers or underscore.");
      if (!checks.every((c) => c.test(form.password)))
        return setError("Password does not meet all the requirements below.");
      if (form.password !== form.confirm) return setError("Passwords do not match.");
    } else {
      if (!form.userId.trim()) return setError("Enter your user ID.");
      if (!form.password) return setError("Enter your password.");
    }

    setLoading(true);
    try {
      const body = isSignup
        ? {
            fullName: form.name.trim(),
            email: form.email.trim().toLowerCase(),
            userId: form.userId.trim(),
            password: form.password,
          }
        : { userId: form.userId.trim(), password: form.password };

      let data: any;
      try {
        const res = await api.post(`/auth/${isSignup ? "signup" : "login"}`, body);
        data = res.data;
      } catch (err: any) {
        setError(
          err.response
            ? err.response.data?.message || err.response.data?.error || "Something went wrong. Try again."
            : "Cannot reach the server. Check that the backend is running."
        );
        return;
      }

      if (isSignup) {
        // account created -> now the user signs in with user ID + password
        const createdId = form.userId.trim();
        setMode("login");
        setForm({ ...empty, userId: createdId });
        setNotice("Account created. Sign in with your user ID and password.");
        return;
      }

      if (data.token) localStorage.setItem("ai_mailnlyzer_token", data.token);
      localStorage.setItem("ai_mailnlyzer_user", JSON.stringify(data.user));
      window.location.href = "/";
    } catch {
      setError("Cannot reach the server. Check that the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth">
      {/* LEFT: product panel */}
      <aside className="auth-brand" aria-hidden="true">
        <div className="brand-logo">
          <span className="brand-mark"><Shield /></span>
          <div>
            <div className="brand-name">AI-MailNlyzer</div>
            <div className="brand-tag">Forensic intelligence platform</div>
          </div>
        </div>

        <div className="brand-body">
          <h2>Investigate suspicious emails with confidence.</h2>
          <p>One place to analyse a message, check what it links to, and see who else is being targeted.</p>
          <ul className="points">
            <li>Sender and header checks</li>
            <li>Link and attachment reputation</li>
            <li>IP and domain threat intelligence</li>
            <li>Campaign tracking across emails</li>
          </ul>
        </div>

        <div className="brand-foot">Your analyses are private to your account.</div>
      </aside>

      {/* RIGHT: form */}
      <main className="auth-form-wrap">
        <form className="auth-card" onSubmit={handleSubmit} noValidate>
          <div className="mobile-logo">
            <span className="brand-mark"><Shield /></span>
            <span className="brand-name">AI-MailNlyzer</span>
          </div>

          <h1>{isSignup ? "Create your account" : "Sign in"}</h1>
          <p className="sub">
            {isSignup
              ? "Sign up first, then sign in with your user ID and password."
              : "Enter your user ID and password to continue."}
          </p>

          {notice && <div className="notice" role="status">{notice}</div>}
          {error && <div className="error" role="alert">{error}</div>}

          {isSignup && (
            <>
              <label>
                Full name
                <input name="name" type="text" autoComplete="name"
                  value={form.name} onChange={update} placeholder="Your name" />
              </label>
              <label>
                Email
                <input name="email" type="email" autoComplete="email"
                  value={form.email} onChange={update} placeholder="you@example.com" />
              </label>
            </>
          )}

          <label>
            User ID
            <input name="userId" type="text" autoComplete="username"
              value={form.userId} onChange={update}
              placeholder={isSignup ? "Choose a user ID" : "Your user ID"} />
          </label>

          <label>
            Password
            <div className="pw">
              <input name="password" type={showPw ? "text" : "password"}
                autoComplete={isSignup ? "new-password" : "current-password"}
                value={form.password} onChange={update}
                placeholder={isSignup ? "Create a password" : "Your password"} />
              <button type="button" className="toggle"
                onClick={() => setShowPw(!showPw)}
                aria-label={showPw ? "Hide password" : "Show password"}>
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {isSignup && (
            <>
              <ul className="rules">
                {checks.map((c) => (
                  <li key={c.label} className={c.test(form.password) ? "met" : ""}>
                    {c.label}
                  </li>
                ))}
              </ul>
              <label>
                Confirm password
                <input name="confirm" type={showPw ? "text" : "password"}
                  autoComplete="new-password" value={form.confirm}
                  onChange={update} placeholder="Repeat your password" />
              </label>
            </>
          )}

          <button className="submit" type="submit" disabled={loading}>
            {loading ? "Please wait..." : isSignup ? "Create account" : "Sign in"}
          </button>

          <p className="switch">
            {isSignup ? "Already have an account?" : "New to AI-MailNlyzer?"}{" "}
            <button type="button" onClick={() => switchMode(isSignup ? "login" : "signup")}>
              {isSignup ? "Sign in" : "Create an account"}
            </button>
          </p>
        </form>
      </main>
    </div>
  );
}
