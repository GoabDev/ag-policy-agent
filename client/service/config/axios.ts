import axios from 'axios';

const api = axios.create({
  baseURL: '',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add interceptors if needed (e.g., for logging or auth)
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    // Standardize error handling
    const message = error.response?.data?.error || error.message || 'An unexpected error occurred';
    return Promise.reject(new Error(message));
  }
);

export default api;
