"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../../lib/auth/AuthContext";
import { fetchApi } from "../../../../lib/api/client";
import Link from "next/link";

export default function OTPLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetchApi("/api/v1/auth/request-otp", {
        method: "POST",
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        setStep("verify");
      } else {
        const errData = await response.json();
        setError(errData.error?.message || "Failed to send OTP.");
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetchApi("/api/v1/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ email, code: otp }),
      });

      if (response.ok) {
        const data = await response.json();
        await login(data.access_token);
        // Check if user already has a vendor org or is admin
        const meRes = await fetchApi("/api/v1/auth/me");
        if (meRes.ok) {
          const me = await meRes.json();
          if (me.roles?.includes("ADMIN") || me.roles?.includes("SYSTEM_ADMIN")) {
            router.push("/admin");
            return;
          }
        }
        // Check if vendor org already exists
        const vendorRes = await fetchApi("/api/v1/vendor/me");
        if (vendorRes.ok) {
          router.push("/vendor/dashboard");
        } else {
          router.push("/vendor/registration");
        }
      } else {
        const errData = await response.json();
        setError(errData.error?.message || "Invalid OTP code.");
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Vendor Login / Registration
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          New and existing vendors authenticate via Email OTP.
        </p>
        <p className="mt-1 text-center text-xs text-blue-600 font-medium">
          If you are not registered yet, simply enter your email to get started!
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          
          {step === "request" ? (
            <form className="space-y-6" onSubmit={handleRequestOTP}>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative text-sm" role="alert">
                  <span className="block sm:inline">{error}</span>
                </div>
              )}
              
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <div className="mt-1">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-black"
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {loading ? "Sending..." : "Send OTP"}
                </button>
              </div>
              
              <div className="mt-4 text-center">
                <Link href="/login" className="text-sm font-medium text-blue-600 hover:text-blue-500">
                  Back to Password Login
                </Link>
              </div>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handleVerifyOTP}>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative text-sm" role="alert">
                  <span className="block sm:inline">{error}</span>
                </div>
              )}
              
              <div>
                <label htmlFor="otp" className="block text-sm font-medium text-gray-700">
                  Enter 6-digit OTP sent to {email}
                </label>
                <div className="mt-1">
                  <input
                    id="otp"
                    name="otp"
                    type="text"
                    maxLength={6}
                    required
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-black text-center tracking-widest text-2xl font-mono"
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                >
                  {loading ? "Verifying..." : "Verify & Login"}
                </button>
              </div>
              
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setStep("request")}
                  className="text-sm font-medium text-blue-600 hover:text-blue-500"
                >
                  Use a different email
                </button>
              </div>
            </form>
          )}
          
        </div>
      </div>
    </div>
  );
}
