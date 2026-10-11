import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "" });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// Expired/invalid token -> back to login.
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const isLogin = err.config?.url?.includes("/auth/login");
    if (err.response?.status === 401 && !isLogin) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export const errMsg = (e) => e.response?.data?.error?.message || e.message || "Something went wrong";

export const login = (email, password) => api.post("/auth/login", { email, password }).then((r) => r.data);
export const getClaims = (params) => api.get("/api/claims", { params }).then((r) => r.data);
export const getClaim = (id) => api.get(`/api/claims/${id}`).then((r) => r.data);
export const updateStatus = (id, status, note) => api.patch(`/api/claims/${id}/status`, { status, note }).then((r) => r.data);
export const uploadDocument = (id, file, docType) => {
  const form = new FormData();
  form.append("file", file);
  form.append("docType", docType);
  return api.post(`/api/claims/${id}/documents`, form).then((r) => r.data);
};
export const getDocumentUrl = (id, docId) => api.get(`/api/claims/${id}/documents/${docId}/url`).then((r) => r.data.url);
export const searchPolicies = (q, claimType) => api.get("/api/policies/search", { params: { q, claimType } }).then((r) => r.data);
export const generateAssessment = (id) => api.post(`/api/claims/${id}/generate-assessment`).then((r) => r.data);
