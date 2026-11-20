// Shared API utility across all 7 STRIDERA User Roles & Portals
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

export async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const token = typeof window !== 'undefined' ? localStorage.getItem('stridera_token') : null;

  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errMsg = data.message || data.error?.message || 'API request failed';
    const err = new Error(errMsg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

// Products & Reviews
export const getProducts = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/products${qs ? '?' + qs : ''}`);
};
export const getProductFilters = () => apiFetch('/products/filters');
export const getProduct = (slug) => apiFetch(`/products/${slug}`);
export const submitProductReview = (slug, data) =>
  apiFetch(`/products/${slug}/reviews`, { method: 'POST', body: JSON.stringify(data) });

// Categories & Brands
export const getCategories = () => apiFetch('/categories');
export const getBrands = () => apiFetch('/brands');
export const getBrand = (slug) => apiFetch(`/brands/${slug}`);

// Cart
export const getCart = () => apiFetch('/cart');
export const addToCart = (productVariantId, quantity) =>
  apiFetch('/cart/items', { method: 'POST', body: JSON.stringify({ productVariantId, quantity }) });
export const updateCartItem = (itemId, quantity) =>
  apiFetch(`/cart/items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ quantity }) });
export const removeCartItem = (itemId) =>
  apiFetch(`/cart/items/${itemId}`, { method: 'DELETE' });

// Auth & Account
export const login = (email, password, keepSignedIn = true) =>
  apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, keepSignedIn }) });
export const register = (data) =>
  apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(data) });
export const logout = () => apiFetch('/auth/logout', { method: 'POST' });
export const getMe = () => apiFetch('/auth/me');
export const getProfile = () => apiFetch('/auth/me');
export const updateProfile = (data) =>
  apiFetch('/auth/profile', { method: 'PUT', body: JSON.stringify(data) });
export const changePassword = (currentPassword, newPassword) =>
  apiFetch('/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) });
export const forgotPassword = (email, newPassword) =>
  apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email, newPassword }) });
export const addAddress = (data) =>
  apiFetch('/auth/addresses', { method: 'POST', body: JSON.stringify(data) });
export const deleteAddress = (id) =>
  apiFetch(`/auth/addresses/${id}`, { method: 'DELETE' });

// Orders & E-Wallet Payments
export const createOrder = (data) =>
  apiFetch('/orders', { method: 'POST', body: JSON.stringify(data) });
export const getOrders = () => apiFetch('/orders');
export const getOrder = (orderNumber, email) =>
  apiFetch(`/orders/${orderNumber}${email ? '?email=' + email : ''}`);
export const confirmOrderReceipt = (orderNumber) =>
  apiFetch(`/orders/${orderNumber}/confirm-receipt`, { method: 'PATCH' });
export const cancelOrder = (orderNumber) =>
  apiFetch(`/orders/${orderNumber}/cancel`, { method: 'PATCH' });

export const createPaymentSession = (orderNumber, paymentMethod = 'gcash') =>
  apiFetch('/payments/create-session', { method: 'POST', body: JSON.stringify({ orderNumber, paymentMethod }) });
export const confirmSandboxPayment = (orderNumber, paymentMethod = 'gcash', paymentId = null) =>
  apiFetch('/payments/confirm-sandbox', { method: 'POST', body: JSON.stringify({ orderNumber, paymentMethod, paymentId }) });
export const failSandboxPayment = (orderNumber, reason) =>
  apiFetch('/payments/fail-sandbox', { method: 'POST', body: JSON.stringify({ orderNumber, reason }) });
export const simulatePayment = (orderNumber) =>
  apiFetch('/payments/simulate', { method: 'POST', body: JSON.stringify({ orderNumber }) });

// Wishlist
export const getWishlist = () => apiFetch('/wishlist');
export const addToWishlist = (productId) =>
  apiFetch('/wishlist', { method: 'POST', body: JSON.stringify({ productId }) });
export const removeFromWishlist = (productId) =>
  apiFetch(`/wishlist/${productId}`, { method: 'DELETE' });

// Seller Portal API (Role 2)
export const registerSeller = (data) =>
  apiFetch('/auth/register-seller', { method: 'POST', body: JSON.stringify(data) });
export const getSellerProfile = () => apiFetch('/seller/profile');
export const updateSellerProfile = (data) =>
  apiFetch('/seller/profile', { method: 'PUT', body: JSON.stringify(data) });
export const getSellerDashboard = () => apiFetch('/seller/dashboard');
export const getSellerProducts = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/seller/products${qs ? '?' + qs : ''}`);
};
export const getSellerProduct = (id) => apiFetch(`/seller/products/${id}`);
export const createSellerProduct = (data) =>
  apiFetch('/seller/products', { method: 'POST', body: JSON.stringify(data) });
export const updateSellerProduct = (id, data) =>
  apiFetch(`/seller/products/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteSellerProduct = (id) =>
  apiFetch(`/seller/products/${id}`, { method: 'DELETE' });
export const addSellerVariant = (productId, data) =>
  apiFetch(`/seller/products/${productId}/variants`, { method: 'POST', body: JSON.stringify(data) });
export const adjustSellerStock = (variantId, quantityChange, reason) =>
  apiFetch(`/seller/variants/${variantId}/stock`, {
    method: 'PATCH',
    body: JSON.stringify({ quantityChange, reason })
  });
export const getSellerOrders = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/seller/orders${qs ? '?' + qs : ''}`);
};
export const getSellerOrder = (id) => apiFetch(`/seller/orders/${id}`);
export const acceptSellerOrder = (id) =>
  apiFetch(`/seller/orders/${id}/accept`, { method: 'PATCH' });
export const fulfillSellerOrder = (id, data) =>
  apiFetch(`/seller/orders/${id}/fulfill`, { method: 'PATCH', body: JSON.stringify(data) });
export const cancelSellerOrder = (id, reason) =>
  apiFetch(`/seller/orders/${id}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason }) });

// Inventory Manager Portal API (Role 4)
export const getInventoryDashboard = () => apiFetch('/inventory/dashboard');
export const getInventoryVariants = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/inventory/variants${qs ? '?' + qs : ''}`);
};
export const recordIncomingStock = (data) =>
  apiFetch('/inventory/incoming', { method: 'POST', body: JSON.stringify(data) });
export const recordOutgoingStock = (data) =>
  apiFetch('/inventory/outgoing', { method: 'POST', body: JSON.stringify(data) });
export const adjustInventoryVariant = (id, data) =>
  apiFetch(`/inventory/variants/${id}/adjust`, { method: 'PATCH', body: JSON.stringify(data) });
export const toggleVariantAvailability = (id, isActive) =>
  apiFetch(`/inventory/variants/${id}/availability`, { method: 'PATCH', body: JSON.stringify({ isActive }) });
export const getInventoryMovements = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/inventory/movements${qs ? '?' + qs : ''}`);
};
export const getStockMovements = getInventoryMovements;
export const getInventoryReport = () => apiFetch('/inventory/report');

// Delivery Personnel Portal API (Role 5)
export const getDeliveryShipments = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/delivery/shipments${qs ? '?' + qs : ''}`);
};
export const acceptDeliveryShipment = (id) =>
  apiFetch(`/delivery/shipments/${id}/accept`, { method: 'PATCH' });
export const collectDeliveryShipment = (id, trackingNumber) =>
  apiFetch(`/delivery/shipments/${id}/collect`, { method: 'PATCH', body: JSON.stringify({ trackingNumber }) });
export const updateDeliveryShipmentStatus = (id, data) =>
  apiFetch(`/delivery/shipments/${id}/status`, { method: 'PATCH', body: JSON.stringify(data) });
export const failDeliveryShipment = (id, data) =>
  apiFetch(`/delivery/shipments/${id}/fail`, { method: 'PATCH', body: JSON.stringify(data) });

// Customer Support Portal API (Role 6)
export const createSupportTicket = (data) =>
  apiFetch('/support/tickets', { method: 'POST', body: JSON.stringify(data) });
export const getMySupportTickets = () => apiFetch('/support/my-tickets');
export const getSupportTickets = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/support/tickets${qs ? '?' + qs : ''}`);
};
export const lookupSupportOrders = (q = '') =>
  apiFetch(`/support/orders/lookup?q=${encodeURIComponent(q)}`);
export const postSupportMessage = (ticketId, message) =>
  apiFetch(`/support/tickets/${ticketId}/messages`, { method: 'POST', body: JSON.stringify({ message }) });
export const replySupportTicket = postSupportMessage;
export const updateSupportTicketStatus = (ticketId, data) =>
  apiFetch(`/support/tickets/${ticketId}/status`, { method: 'PATCH', body: JSON.stringify(data) });
export const executeSupportTicketAction = (ticketId, data) =>
  apiFetch(`/support/tickets/${ticketId}/action`, { method: 'PATCH', body: JSON.stringify(data) });

// Finance Officer Portal API (Role 7)
export const getFinanceDashboard = () => apiFetch('/finance/dashboard');
export const verifyFinancePayment = (paymentId) =>
  apiFetch(`/finance/payments/${paymentId}/verify`, { method: 'PATCH' });
export const createFinancePayout = (data) =>
  apiFetch('/finance/payouts', { method: 'POST', body: JSON.stringify(data) });
export const createSellerPayout = createFinancePayout;
export const processFinanceRefund = (ticketId) =>
  apiFetch(`/finance/refunds/${ticketId}/process`, { method: 'POST' });
export const getFinanceReports = () => apiFetch('/finance/reports');

// Admin Portal API (Role 3)
export const getAdminSellers = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/admin/sellers${qs ? '?' + qs : ''}`);
};
export const updateAdminSellerStatus = (id, sellerStatus) =>
  apiFetch(`/admin/sellers/${id}/status`, { method: 'PATCH', body: JSON.stringify({ sellerStatus }) });
export const assignAdminBrand = (sellerId, brandId) =>
  apiFetch(`/admin/sellers/${sellerId}/assign-brand`, { method: 'POST', body: JSON.stringify({ brandId }) });
export const getAdminBrands = () => apiFetch('/admin/brands');
export const createAdminBrand = (data) =>
  apiFetch('/admin/brands', { method: 'POST', body: JSON.stringify(data) });
export const getAdminConfigStatus = () => apiFetch('/admin/config-status');
export const getAdminPaymentLogs = () => apiFetch('/admin/payment-logs');
export const getAdminOrders = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/admin/orders${qs ? '?' + qs : ''}`);
};
export const getAdminReports = () => apiFetch('/admin/reports/sales');
export const getAdminAuditLogs = () => apiFetch('/admin/audit-logs');
export const getAdminUsers = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/admin/users${qs ? '?' + qs : ''}`);
};
export const updateAdminUserRole = (id, role) =>
  apiFetch(`/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
export const updateAdminUserStatus = (id, accountStatus) =>
  apiFetch(`/admin/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ accountStatus }) });
export const getAdminPlatformConfig = () => apiFetch('/admin/platform-config');
export const updateAdminPlatformConfig = (data) =>
  apiFetch('/admin/platform-config', { method: 'PUT', body: JSON.stringify(data) });

// Revision Update — Seller Metrics, Product Edit/Archive/Restore/Images & Admin Analytics/Settings/Webhooks/Health
export const getSellerMetrics = (period = '30d') =>
  apiFetch(`/seller/metrics?period=${encodeURIComponent(period)}`);
export const archiveSellerProduct = (id) =>
  apiFetch(`/seller/products/${id}`, { method: 'DELETE' });
export const restoreSellerProduct = (id) =>
  apiFetch(`/seller/products/${id}/restore`, { method: 'PATCH' });
export const deleteSellerProductImage = (productId, imageId) =>
  apiFetch(`/seller/products/${productId}/images/${imageId}`, { method: 'DELETE' });
export async function uploadSellerProductImage(productId, file, isPrimary = false) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('stridera_token') : null;
  const formData = new FormData();
  formData.append('image', file);
  formData.append('isPrimary', String(isPrimary));
  const res = await fetch(`${API_BASE}/seller/products/${productId}/images`, {
    method: 'POST',
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Image upload failed');
  return data;
}

export const getAdminAnalytics = (period = '30d') =>
  apiFetch(`/admin/analytics?period=${encodeURIComponent(period)}`);
export const getAdminApiSettings = () => apiFetch('/admin/api-settings');
export const updateAdminApiSettings = (data) =>
  apiFetch('/admin/api-settings', { method: 'PUT', body: JSON.stringify(data) });
export const getAdminWebhooks = () => apiFetch('/admin/webhooks');
export const getAdminHealth = () => apiFetch('/admin/health');
