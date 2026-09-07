"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth/AuthContext";
import { fetchApi } from "../../../lib/api/client";

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
  const { login } = useAuth();

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
            router.push("/admin");
            return;
          }
        }
        router.push("/vendor/profile");
      } else {
        try {
          const errData = await response.json();
          setError(errData.detail?.message || errData.error?.message || (typeof errData.detail === "string" ? errData.detail : null) || "Invalid credentials.");
        } catch {
          setError("Server returned an error. Please check server logs.");
        }
      }
    } catch (err: any) {
      console.error("Login request error:", err);
      setError(err?.message ? `Connection error: ${err.message}. Is backend running?` : "An unexpected error occurred. Please try again.");
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
          setSuccess("Account created! A 6-digit OTP code has been sent to your email.");
        } else if (data.access_token) {
          await login(data.access_token);
          router.push("/vendor/profile");
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
        setSuccess("Email verified successfully! Redirecting to Vendor Profile...");
        setTimeout(() => {
          router.push("/vendor/profile");
        }, 1000);
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
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 font-sans">
      
      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 shadow-sm mb-3">
          <span className="text-2xl font-black text-white">J</span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">
          JECRC SCM Portal
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          Unified Procurement & Vendor Gateway
        </p>
      </div>

      <div className="w-full sm:max-w-md">
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 sm:p-8">
          
          {/* Mode Selector Tabs */}
          {!otpSent && (
            <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 mb-6 text-xs font-semibold">
              <button
                type="button"
                onClick={() => { setMode("login"); setError(null); setSuccess(null); setOtpSent(false); }}
                className={`flex-1 py-2 rounded-md transition-all ${
                  mode === "login"
                    ? "bg-white text-blue-600 shadow-sm font-bold"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode("register"); setError(null); setSuccess(null); setOtpSent(false); }}
                className={`flex-1 py-2 rounded-md transition-all ${
                  mode === "register"
                    ? "bg-white text-blue-600 shadow-sm font-bold"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Vendor Sign Up
              </button>
            </div>
          )}

          {/* Feedback Messages */}
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-xs space-y-2">
              <div className="flex items-start space-x-2">
                <span>⚠️</span>
                <span className="flex-1 font-medium">{error}</span>
              </div>
              {(error.toLowerCase().includes("already registered") || error.toLowerCase().includes("already exists")) && (
                <button
                  type="button"
                  onClick={() => {
                    setLoginEmail(regEmail || otpEmail);
                    setMode("login");
                    setError(null);
                    setOtpSent(false);
                  }}
                  className="w-full text-center py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md text-xs transition-all shadow-sm block mt-2"
                >
                  👉 Switch to Sign In with {regEmail || otpEmail || "your account"}
                </button>
              )}
            </div>
          )}

          {success && (
            <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg text-xs flex items-start space-x-2">
              <span>✓</span>
              <span>{success}</span>
            </div>
          )}

          {/* STEP: OTP VERIFICATION */}
          {otpSent ? (
            <form className="space-y-4" onSubmit={handleVerifyOtp}>
              <div className="text-center space-y-1 mb-4">
                <span className="text-3xl">🔑</span>
                <h3 className="text-base font-bold text-gray-900">Email OTP Verification</h3>
                <p className="text-xs text-gray-500">
                  We've sent a 6-digit verification code to <span className="font-semibold text-gray-800">{otpEmail}</span>.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Enter 6-Digit OTP Code *
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="123456"
                  className="w-full text-center tracking-widest text-lg font-mono font-bold px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-all flex justify-center items-center space-x-2 disabled:opacity-50"
              >
                {loading ? (
                  <span>Verifying Code...</span>
                ) : (
                  <span>Verify OTP & Complete Registration</span>
                )}
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
                  onClick={() => { setOtpSent(false); setMode("register"); setError(null); }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ← Back to Sign Up
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* LOGIN FORM */}
              {mode === "login" && (
                <form className="space-y-4" onSubmit={handleLogin}>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="admin@jecrc.edu or vendor@company.com"
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-all flex justify-center items-center space-x-2 disabled:opacity-50"
                  >
                    {loading ? (
                      <span>Signing in...</span>
                    ) : (
                      <span>Sign In</span>
                    )}
                  </button>
                </form>
              )}

              {/* VENDOR REGISTER FORM */}
              {mode === "register" && (
                <form className="space-y-4" onSubmit={handleRegister}>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Primary Contact Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      placeholder="e.g. Rajiv Menon"
                      className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Company Legal Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={regLegalName}
                      onChange={(e) => setRegLegalName(e.target.value)}
                      placeholder="e.g. ABC Medical Systems Pvt Ltd"
                      className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Organization Type
                    </label>
                    <select
                      value={regOrgType}
                      onChange={(e) => setRegOrgType(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs transition-all"
                    >
                      <option value="Private Limited">Private Limited</option>
                      <option value="Public Limited">Public Limited</option>
                      <option value="Proprietorship">Proprietorship</option>
                      <option value="Partnership">Partnership</option>
                      <option value="LLP">LLP</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Work Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="vendor@company.com"
                      className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Create Password *
                    </label>
                    <input
                      type="password"
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Confirm Password *
                    </label>
                    <input
                      type="password"
                      required
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-all flex justify-center items-center space-x-2 disabled:opacity-50"
                  >
                    {loading ? (
                      <span>Registering & Sending OTP...</span>
                    ) : (
                      <span>Register Vendor & Send Email OTP</span>
                    )}
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
