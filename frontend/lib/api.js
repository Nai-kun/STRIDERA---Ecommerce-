// Shared API utility
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.message || 'API request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

// Products
export const getProducts = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/products${qs ? '?' + qs : ''}`);
};

export const getProduct = (slug) => apiFetch(`/products/${slug}`);

// Categories
export const getCategories = () => apiFetch('/categories');

// Cart
export const getCart = () => apiFetch('/cart');
export const addToCart = (productVariantId, quantity) =>
  apiFetch('/cart/items', { method: 'POST', body: JSON.stringify({ productVariantId, quantity }) });
export const updateCartItem = (itemId, quantity) =>
  apiFetch(`/cart/items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ quantity }) });
export const removeCartItem = (itemId) =>
  apiFetch(`/cart/items/${itemId}`, { method: 'DELETE' });

// Auth
export const login = (email, password) =>
  apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
export const register = (data) =>
  apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(data) });
export const logout = () => apiFetch('/auth/logout', { method: 'POST' });
export const getProfile = () => apiFetch('/auth/profile');

// Orders
export const createOrder = (data) =>
  apiFetch('/orders', { method: 'POST', body: JSON.stringify(data) });
export const getOrders = () => apiFetch('/orders');
export const getOrder = (orderNumber, email) =>
  apiFetch(`/orders/${orderNumber}${email ? '?email=' + email : ''}`);

// Wishlist
export const getWishlist = () => apiFetch('/wishlist');
export const addToWishlist = (productId) =>
  apiFetch('/wishlist', { method: 'POST', body: JSON.stringify({ productId }) });
export const removeFromWishlist = (productId) =>
  apiFetch(`/wishlist/${productId}`, { method: 'DELETE' });
