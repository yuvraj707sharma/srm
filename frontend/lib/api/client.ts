export const fetchApi = async (url: string, options: RequestInit = {}) => {
  const headers = new Headers(options.headers);
  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Set default content type
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  options.headers = headers;
  options.credentials = "include"; // For HttpOnly refresh cookie

  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
  const fullUrl = url.startsWith("http") ? url : `${BACKEND_URL}${url}`;

  let response = await fetch(fullUrl, options);

  const isPublicAuthEndpoint = 
    url.includes("/auth/login") ||
    url.includes("/auth/register") ||
    url.includes("/auth/verify-otp") ||
    url.includes("/auth/request-otp") ||
    url.includes("/auth/refresh");

  // 401 Interception for Refresh Token Rotation
  if (response.status === 401 && !isPublicAuthEndpoint) {
    if (!window.isRefreshing) {
      window.isRefreshing = true;
      try {
        const refreshResp = await fetch(`${BACKEND_URL}/api/v1/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });

        if (refreshResp.ok) {
          const data = await refreshResp.json();
          localStorage.setItem("accessToken", data.access_token);
          window.isRefreshing = false;
          
          // Retry original request
          const newHeaders = new Headers(options.headers);
          newHeaders.set("Authorization", `Bearer ${data.access_token}`);
          options.headers = newHeaders;
          
          return fetch(fullUrl, options);
        } else {
          // Refresh failed (expired/revoked), force logout
          localStorage.removeItem("accessToken");
          window.location.href = "/login";
        }
      } catch (error) {
        localStorage.removeItem("accessToken");
        window.location.href = "/login";
      } finally {
        window.isRefreshing = false;
      }
    } else {
      // If already refreshing, wait for a short duration and retry
      await new Promise(resolve => setTimeout(resolve, 1000));
      const newToken = localStorage.getItem("accessToken");
      if (newToken) {
         const newHeaders = new Headers(options.headers);
         newHeaders.set("Authorization", `Bearer ${newToken}`);
         options.headers = newHeaders;
         return fetch(fullUrl, options);
      }
    }
  }

  return response;
};

// Global augmentation for the refresh lock
declare global {
  interface Window {
    isRefreshing: boolean;
  }
}
