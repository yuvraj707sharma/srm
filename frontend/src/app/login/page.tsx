"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth/AuthContext";
import { fetchApi } from "../../../lib/api/client";

interface DemoVendor {
  name: string;
  email: string;
  orgName: string;
  tag: string;
}

const DEMO_VENDORS_LIST: DemoVendor[] = [
  {
    name: "INOX Air Products",
    orgName: "INOX Air Products Pvt. Ltd.",
    email: "inox@demo.com",
    tag: "LMO & Cryogenic Tanks",
  },
  {
    name: "Linde India",
    orgName: "Linde India Limited",
    email: "linde@demo.com",
    tag: "Tanks & Pipeline Infrastructure",
  },
  {
    name: "Air Liquide India",
    orgName: "Air Liquide India Holding Pvt. Ltd.",
    email: "airliquide@demo.com",
    tag: "Turnkey MGPS & Cryogenics",
  },
  {
    name: "Vayu Products",
    orgName: "Vayu Products Pvt. Ltd.",
    email: "vayu@demo.com",
    tag: "Regional Gas Supply & Service",
  },
  {
    name: "Shakti Cryogenics",
    orgName: "Shakti Cryogenics Pvt. Ltd.",
    email: "shakti@demo.com",
    tag: "Vaporizers & Skid Manifolds",
  },
];

export default function UnifiedAuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");

  // Login State
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register State
  const [regFullName, setRegFullName] = useState("");
  const [regLegalName, setRegLegalName] = useState("");
  const [regOrgType, setRegOrgType] = useState("Private Limited");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");

  // OTP State
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpEmail, setOtpEmail] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const { login } = useAuth();

  // 1-Click Quick Demo Login with Auto-Seeding Fallback
  const handleQuickLogin = async (email: string, pass: string = "password123") => {
    setLoginEmail(email);
    setLoginPassword(pass);
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      let response = await fetchApi("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password: pass }),
      });

      // If user not in database yet, automatically seed demo vendors and retry
      if (!response.ok) {
        try {
          const seedRes = await fetchApi("/api/v1/auth/seed-demo-vendors", { method: "POST" });
          if (seedRes.ok) {
            response = await fetchApi("/api/v1/auth/login", {
              method: "POST",
              body: JSON.stringify({ email, password: pass }),
            });
          }
        } catch (seedErr) {
          console.warn("Auto-seed error:", seedErr);
        }
      }

      if (response.ok) {
        const data = await response.json();
        await login(data.access_token);
        const meRes = await fetchApi("/api/v1/auth/me");
        if (meRes.ok) {
          const me = await meRes.json();
          if (me.roles?.includes("ADMIN") || me.roles?.includes("SYSTEM_ADMIN")) {
            router.push("/admin/boq");
            return;
          }
        }
        // Direct vendor to Active Tenders list to quote on published BOQs
        router.push("/vendor/tenders");
      } else {
        try {
          const errData = await response.json();
          setError(
            errData.detail?.message ||
              errData.error?.message ||
              (typeof errData.detail === "string" ? errData.detail : null) ||
              "Invalid credentials. Please click 'Seed Demo Vendors' below if running for the first time."
          );
        } catch {
          setError("Server returned an error. Please check backend server logs.");
        }
      }
    } catch (err: any) {
      console.error("Quick login error:", err);
      setError(err?.message ? `Connection error: ${err.message}. Is backend running?` : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  // Manual Trigger to Seed 5 Demo Vendors into DB
  const handleSeedDemoVendors = async () => {
    setSeeding(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchApi("/api/v1/auth/seed-demo-vendors", { method: "POST" });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to seed demo vendors.");
      }
      const data = await res.json();
      setSuccess("✅ 5 Demo Vendor Profiles + Admin successfully initialized in database! Default password: password123");
    } catch (err: any) {
      setError(err.message || "Failed to seed demo vendors.");
    } finally {
      setSeeding(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const response = await fetchApi("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });

      if (response.ok) {
        const data = await response.json();
        await login(data.access_token);
        const meRes = await fetchApi("/api/v1/auth/me");
        if (meRes.ok) {
          const me = await meRes.json();
          if (me.roles?.includes("ADMIN") || me.roles?.includes("SYSTEM_ADMIN")) {
            router.push("/admin/boq");
            return;
          }
        }
        router.push("/vendor/tenders");
      } else {
        try {
          const errData = await response.json();
          setError(
            errData.detail?.message ||
              errData.error?.message ||
              (typeof errData.detail === "string" ? errData.detail : null) ||
              "Invalid credentials."
          );
        } catch {
          setError("Server returned an error. Please check server logs.");
        }
      }
    } catch (err: any) {
      console.error("Login request error:", err);
      setError(err?.message ? `Connection error: ${err.message}. Is backend running?` : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (regPassword !== regConfirmPassword) {
      setError("Passwords do not match. Please verify your password.");
      return;
    }

    if (regPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetchApi("/api/v1/auth/register-vendor", {
        method: "POST",
        body: JSON.stringify({
          email: regEmail,
          password: regPassword,
          full_name: regFullName,
          legal_name: regLegalName,
          organization_type: regOrgType,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === "otp_sent") {
          setOtpSent(true);
          setOtpEmail(data.email || regEmail);
          if (data.dev_otp) {
            setOtpCode(data.dev_otp);
            setSuccess(`Account created! Development OTP: ${data.dev_otp} (auto-filled below).`);
          } else {
            setSuccess("Account created! A 6-digit OTP code has been sent to your email.");
          }
        } else if (data.access_token) {
          await login(data.access_token);
          router.push("/vendor/tenders");
        }
      } else {
        const errData = await response.json();
        setError(errData.error?.message || errData.detail?.message || errData.detail || "Registration failed.");
      }
    } catch (err) {
      setError("An unexpected error occurred during registration. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.length < 4) {
      setError("Please enter a valid OTP code.");
      return;
    }

    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const response = await fetchApi("/api/v1/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ email: otpEmail, code: otpCode }),
      });

      if (response.ok) {
        const data = await response.json();
        await login(data.access_token);
        setSuccess("Email verified successfully! Redirecting to Tenders...");
        setTimeout(() => {
          router.push("/vendor/tenders");
        }, 800);
      } else {
        const errData = await response.json();
        setError(errData.error?.message || errData.detail?.message || errData.detail || "Invalid or expired OTP code.");
      }
    } catch (err) {
      setError("An error occurred while verifying OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError(null);
    setSuccess(null);
    try {
      const response = await fetchApi("/api/v1/auth/request-otp", {
        method: "POST",
        body: JSON.stringify({ email: otpEmail }),
      });
      if (response.ok) {
        setSuccess("New 6-digit OTP code sent to your email.");
      } else {
        setError("Failed to resend OTP code.");
      }
    } catch (err) {
      setError("Failed to resend OTP.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col justify-center items-center py-10 px-4 sm:px-6 lg:px-8 font-sans">
      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 shadow-sm mb-3">
          <span className="text-2xl font-black text-white">J</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-snug">
          JECRC Medical College Hospital and Research Centre
        </h2>
        <p className="mt-1 text-xs font-semibold text-blue-600 tracking-wide uppercase">
          A Unit of JECRC
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          Procurement &amp; Vendor Bidding Management System
        </p>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================================= */}
        {/* 1. ONE-CLICK DEMO PROFILES PANEL (5 VENDORS + 1 ADMIN)                    */}
        {/* ========================================================================= */}
        <div className="lg:col-span-6 bg-white border border-slate-200 shadow-sm rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-150">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-base">⚡</span>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
                  1-Click Demo Profiles
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Click any profile to instantly login &amp; test quoting or comparing.
              </p>
            </div>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
              Testing Mode
            </span>
          </div>

          {/* 5 Demo Vendors */}
          <div className="space-y-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
              5 Approved Demo Vendors (Password: password123)
            </span>

            {DEMO_VENDORS_LIST.map((v, idx) => (
              <button
                key={v.email}
                type="button"
                disabled={loading || seeding}
                onClick={() => handleQuickLogin(v.email, "password123")}
                className="w-full p-2.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all text-left flex items-center justify-between group shadow-2xs disabled:opacity-50"
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-blue-600 group-hover:text-white text-slate-700 flex items-center justify-center font-bold text-xs shrink-0 transition-colors">
                    {idx + 1}
                  </div>
                  <div className="truncate">
                    <span className="font-bold text-xs text-slate-900 block truncate group-hover:text-blue-700">
                      {v.name}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono block truncate">
                      {v.email} • {v.tag}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-slate-400 group-hover:text-blue-600 font-bold shrink-0 ml-2">
                  Login →
                </span>
              </button>
            ))}
          </div>

          {/* Admin Account */}
          <div className="pt-2 border-t border-slate-150 space-y-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
              Procurement Officer / Admin
            </span>
            <button
              type="button"
              disabled={loading || seeding}
              onClick={() => handleQuickLogin("admin@test.com", "password123")}
              className="w-full p-2.5 rounded-xl border border-amber-300 bg-amber-50/60 hover:bg-amber-100/70 transition-all text-left flex items-center justify-between group shadow-2xs disabled:opacity-50"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold text-xs shrink-0">
                  🛡️
                </div>
                <div className="truncate">
                  <span className="font-bold text-xs text-slate-900 block truncate">
                    Procurement Admin
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono block truncate">
                    admin@test.com • Create BOQ &amp; View Comparisons
                  </span>
                </div>
              </div>
              <span className="text-xs text-amber-900 font-bold shrink-0 ml-2">
                Login →
              </span>
            </button>
          </div>

          {/* Database Seed Button */}
          <div className="pt-2 border-t border-slate-150">
            <button
              type="button"
              disabled={seeding || loading}
              onClick={handleSeedDemoVendors}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-colors flex items-center justify-center space-x-1.5 shadow-2xs"
            >
              <span>{seeding ? "⏳" : "🌱"}</span>
              <span>{seeding ? "Seeding Vendors in Database..." : "Re-sync / Seed 5 Demo Vendors in Database"}</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. REGULAR LOGIN / REGISTER FORM                                          */}
        {/* ========================================================================= */}
        <div className="lg:col-span-6 bg-white border border-slate-200 shadow-sm rounded-2xl p-6 sm:p-7">
          {/* Mode Selector Tabs */}
          {!otpSent && (
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 mb-5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                  setSuccess(null);
                  setOtpSent(false);
                }}
                className={`flex-1 py-2 rounded-lg transition-all ${
                  mode === "login"
                    ? "bg-white text-blue-600 shadow-sm font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setError(null);
                  setSuccess(null);
                  setOtpSent(false);
                }}
                className={`flex-1 py-2 rounded-lg transition-all ${
                  mode === "register"
                    ? "bg-white text-blue-600 shadow-sm font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Register
              </button>
            </div>
          )}

          {/* Feedback Messages */}
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs space-y-2">
              <div className="flex items-start space-x-2">
                <span>⚠️</span>
                <span className="flex-1 font-medium">{error}</span>
              </div>
            </div>
          )}

          {success && (
            <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-xs flex items-start space-x-2">
              <span>✓</span>
              <span>{success}</span>
            </div>
          )}

          {/* STEP: OTP VERIFICATION */}
          {otpSent ? (
            <form className="space-y-4" onSubmit={handleVerifyOtp}>
              <div className="text-center space-y-1 mb-4">
                <span className="text-3xl">🔑</span>
                <h3 className="text-base font-bold text-slate-900">Email OTP Verification</h3>
                <p className="text-xs text-slate-500">
                  We&apos;ve sent a 6-digit verification code to <span className="font-semibold text-slate-800">{otpEmail}</span>.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Enter 6-Digit OTP Code *
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="123456"
                  className="w-full text-center tracking-widest text-lg font-mono font-bold px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-all flex justify-center items-center space-x-2 disabled:opacity-50"
              >
                {loading ? <span>Verifying Code...</span> : <span>Verify OTP &amp; Complete Registration</span>}
              </button>

              <div className="flex justify-between items-center text-xs pt-2">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  className="text-blue-600 hover:underline font-semibold"
                >
                  Resend OTP Code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setMode("register");
                    setError(null);
                  }}
                  className="text-slate-500 hover:text-slate-700"
                >
                  ← Back to Register
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* LOGIN FORM */}
              {mode === "login" && (
                <form className="space-y-4" onSubmit={handleLogin}>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="admin@test.com or inox@demo.com"
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-all flex justify-center items-center space-x-2 disabled:opacity-50"
                  >
                    {loading ? <span>Signing in...</span> : <span>Sign In</span>}
                  </button>
                </form>
              )}

              {/* VENDOR REGISTER FORM */}
              {mode === "register" && (
                <form className="space-y-4" onSubmit={handleRegister}>
                  <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 leading-relaxed">
                    <div className="font-bold flex items-center gap-1.5 text-blue-950 mb-1">
                      <span>📩</span> Register as a New Vendor
                    </div>
                    Enter your organization details below to create your account and submit bids on active tenders.
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Primary Contact Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      placeholder="e.g. Rajiv Menon"
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Company Legal Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={regLegalName}
                      onChange={(e) => setRegLegalName(e.target.value)}
                      placeholder="e.g. ABC Medical Systems Pvt Ltd"
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Organization Type
                    </label>
                    <select
                      value={regOrgType}
                      onChange={(e) => setRegOrgType(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs transition-all"
                    >
                      <option value="Private Limited">Private Limited</option>
                      <option value="Public Limited">Public Limited</option>
                      <option value="Proprietorship">Proprietorship</option>
                      <option value="Partnership">Partnership</option>
                      <option value="LLP">LLP</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Work Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="vendor@company.com"
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Create Password *
                    </label>
                    <input
                      type="password"
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Confirm Password *
                    </label>
                    <input
                      type="password"
                      required
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-all flex justify-center items-center space-x-2 disabled:opacity-50"
                  >
                    {loading ? <span>Registering &amp; Sending OTP...</span> : <span>Register Vendor &amp; Send Email OTP</span>}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
