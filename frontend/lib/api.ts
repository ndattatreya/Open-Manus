import axios from 'axios';

// Dynamically choose the correct backend based on environment
const API_BASE_URL =
  import.meta.env.MODE === 'development'
    ? (import.meta.env.VITE_API_URL || 'http://localhost:5000/api')
    : (import.meta.env.VITE_API_URL_PROD || 'https://smart-agents-server.vercel.app/api');

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // ✅ Allow cookies/sessions for OAuth and login
});

// Attach token if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle unauthorized errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    return Promise.reject(error);
  }
);

// ===========================
// 🔐 AUTH API FUNCTIONS
// ===========================
export const authAPI = {
  signup: async (userData: { name: string; email: string; password: string }) => {
    const response = await api.post('/auth/signup', userData);
    return response.data;
  },

  login: async (credentials: { email: string; password: string }) => {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },

  oauthLogin: async (
    provider: string,
    userData: { email: string; name?: string; providerId?: string; picture?: string }
  ) => {
    const response = await api.post('/auth/oauth', { provider, userData });
    return response.data;
  },

  getCurrentUser: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },
};

// ===========================
// ⚙️  TOKEN + USER HELPERS
// ===========================
export const setAuthToken = (token: string) => localStorage.setItem('token', token);
export const setAuthUser = (user: any) => localStorage.setItem('user', JSON.stringify(user));
export const getAuthToken = () => localStorage.getItem('token');
export const getAuthUser = () => {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
};
export const clearAuth = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

export default api;
