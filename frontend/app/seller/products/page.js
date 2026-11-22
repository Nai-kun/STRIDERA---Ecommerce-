'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getSellerProducts,
  createSellerProduct,
  updateSellerProduct,
  archiveSellerProduct,
  restoreSellerProduct,
  uploadSellerProductImage,
  addSellerVariant,
  adjustSellerStock,
  getCategories
} from '../../../lib/api';
import InlineFieldError from '../../../components/InlineFieldError';
import {
  ALLOWED_SHOE_SIZES,
  validateEntityName,
  validateSku,
  validatePricePesos,
  validateOptionalText,
  validateShoeSize,
  validateColor,
  validateStock,
  focusFirstInvalidField
} from '../../../lib/validation';

const ADD_PRODUCT_FIELD_IDS = {
  name: 'sp-add-name',
  sku: 'sp-add-sku',
  categoryId: 'sp-add-category',
  basePricePesos: 'sp-add-price',
  compareAtPricePesos: 'sp-add-compare-price',
  description: 'sp-add-description'
};

const EDIT_PRODUCT_FIELD_IDS = {
  name: 'sp-edit-name',
  categoryId: 'sp-edit-category',
  basePricePesos: 'sp-edit-price',
  description: 'sp-edit-description'
};

const VARIANT_FIELD_IDS = {
  variantSku: 'sp-var-sku',
  size: 'sp-var-size',
  color: 'sp-var-color',
  stockQuantity: 'sp-var-stock'
};

const STOCK_FIELD_IDS = {
  quantityChange: 'sp-stock-delta',
  reason: 'sp-stock-reason'
};

export default function SellerProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [notification, setNotification] = useState(null);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [showVariantModal, setShowVariantModal] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [editProductForm, setEditProductForm] = useState({
    id: '',
    name: '',
    categoryId: '',
    basePricePesos: '',
    audience: 'UNISEX',
    shoeType: 'RUNNING',
    description: ''
  });

  // Form states
  const [newProduct, setNewProduct] = useState({
    name: '',
    sku: '',
    categoryId: '',
    basePricePesos: '',
    compareAtPricePesos: '',
    audience: 'UNISEX',
    shoeType: 'RUNNING',
    description: '',
    features: ''
  });

  const [stockAdjustment, setStockAdjustment] = useState({
    quantityChange: 0,
    reason: 'RESTOCK'
  });

  const [newVariant, setNewVariant] = useState({
    variantSku: '',
    size: '9',
    color: '',
    colorHex: '#000000',
    stockQuantity: 10
  });

  const [addErrors, setAddErrors] = useState({});
  const [editErrors, setEditErrors] = useState({});
  const [variantErrors, setVariantErrors] = useState({});
  const [stockErrors, setStockErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const notify = (msg, isError = false) => {
    setNotification({ msg, isError });
    setTimeout(() => setNotification(null), 3000);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [prodRes, catRes] = await Promise.all([
        getSellerProducts({ search }),
        getCategories()
      ]);
      if (prodRes.success) setProducts(prodRes.data);
      if (catRes.success) setCategories(catRes.data);
    } catch (e) {
      notify(e.message || 'Failed to load products', true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search]);

  const validateNewProductField = (field, value, state = newProduct) => {
    switch (field) {
      case 'name':
        return validateEntityName(value, 'Model name', { min: 2, max: 80 }).error;
      case 'sku':
        return validateSku(value, 'SKU').error;
      case 'categoryId':
        return !value ? 'Category is required.' : null;
      case 'basePricePesos':
        return validatePricePesos(value, { required: true, label: 'Base price' }).error;
      case 'compareAtPricePesos':
        return validatePricePesos(value, { required: false, label: 'Compare at price' }).error;
      case 'description':
        return validateOptionalText(value, 'Description', { max: 2000 }).error;
      default:
        return null;
    }
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const nameRes = validateEntityName(newProduct.name, 'Model name', { min: 2, max: 80 });
    const skuRes = validateSku(newProduct.sku, 'SKU');
    const catError = !newProduct.categoryId ? 'Category is required.' : null;
    const priceRes = validatePricePesos(newProduct.basePricePesos, { required: true, label: 'Base price' });
    const compareRes = validatePricePesos(newProduct.compareAtPricePesos, { required: false, label: 'Compare at price' });
    const descRes = validateOptionalText(newProduct.description, 'Description', { max: 2000 });

    const nextErrors = {
      ...(nameRes.valid ? {} : { name: nameRes.error }),
      ...(skuRes.valid ? {} : { sku: skuRes.error }),
      ...(catError ? { categoryId: catError } : {}),
      ...(priceRes.valid ? {} : { basePricePesos: priceRes.error }),
      ...(compareRes.valid ? {} : { compareAtPricePesos: compareRes.error }),
      ...(descRes.valid ? {} : { description: descRes.error })
    };

    setAddErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalidField(nextErrors, ADD_PRODUCT_FIELD_IDS);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: nameRes.value,
        sku: skuRes.value,
        categoryId: newProduct.categoryId,
        basePriceCentavos: priceRes.value,
        compareAtPriceCentavos: compareRes.value,
        audience: newProduct.audience,
        shoeType: newProduct.shoeType,
        description: descRes.value || '',
        features: newProduct.features
      };

      const res = await createSellerProduct(payload);
      if (res.success) {
        notify('Product created successfully!');
        setShowAddModal(false);
        setAddErrors({});
        setNewProduct({
          name: '',
          sku: '',
          categoryId: '',
          basePricePesos: '',
          compareAtPricePesos: '',
          audience: 'UNISEX',
          shoeType: 'RUNNING',
          description: '',
          features: ''
        });
        loadData();
      }
    } catch (err) {
      if (err.fieldErrors) setAddErrors(err.fieldErrors);
      notify(err.message || 'Failed to create product', true);
    } finally {
      setSubmitting(false);
    }
  };

  const validateStockDelta = (rawDelta, reasonVal) => {
    const errors = {};
    const str = String(rawDelta ?? '').trim();
    if (!/^-?\d+$/.test(str)) {
      errors.quantityChange = 'Enter a non-zero whole number (e.g. 10 or -2).';
    } else {
      const delta = Number.parseInt(str, 10);
      if (delta === 0) {
        errors.quantityChange = 'Quantity adjustment cannot be 0.';
      } else if (selectedVariant && selectedVariant.stockQuantity + delta < 0) {
        errors.quantityChange = `Adjustment would result in negative stock (current: ${selectedVariant.stockQuantity}).`;
      }
    }
    if (!reasonVal) errors.reason = 'Reason is required.';
    return errors;
  };

  const handleStockAdjust = async (e) => {
    e.preventDefault();
    if (!selectedVariant || submitting) return;

    const nextErrors = validateStockDelta(stockAdjustment.quantityChange, stockAdjustment.reason);
    setStockErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalidField(nextErrors, STOCK_FIELD_IDS);
      return;
    }

    setSubmitting(true);
    try {
      const res = await adjustSellerStock(
        selectedVariant.id,
        Number.parseInt(String(stockAdjustment.quantityChange).trim(), 10),
        stockAdjustment.reason
      );
      if (res.success) {
        notify(`Stock updated! New stock: ${res.data.stockAfter}`);
        setShowStockModal(false);
        setStockErrors({});
        setSelectedVariant(null);
        setStockAdjustment({ quantityChange: 0, reason: 'RESTOCK' });
        loadData();
      }
    } catch (err) {
      notify(err.message || 'Failed to update stock', true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddVariant = async (e) => {
    e.preventDefault();
    if (!selectedProduct || submitting) return;

    const skuRes = validateSku(newVariant.variantSku, 'Variant SKU');
    const sizeRes = validateShoeSize(newVariant.size);
    const colorRes = validateColor(newVariant.color);
    const stockRes = validateStock(newVariant.stockQuantity);

    const nextErrors = {
      ...(skuRes.valid ? {} : { variantSku: skuRes.error }),
      ...(sizeRes.valid ? {} : { size: sizeRes.error }),
      ...(colorRes.valid ? {} : { color: colorRes.error }),
      ...(stockRes.valid ? {} : { stockQuantity: stockRes.error })
    };

    setVariantErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalidField(nextErrors, VARIANT_FIELD_IDS);
      return;
    }

    setSubmitting(true);
    try {
      const res = await addSellerVariant(selectedProduct.id, {
        variantSku: skuRes.value,
        size: sizeRes.value,
        color: colorRes.value,
        colorHex: newVariant.colorHex,
        stockQuantity: stockRes.value
      });

      if (res.success) {
        notify('Variant added successfully!');
        setShowVariantModal(false);
        setVariantErrors({});
        setSelectedProduct(null);
        setNewVariant({ variantSku: '', size: '9', color: '', colorHex: '#000000', stockQuantity: 10 });
        loadData();
      }
    } catch (err) {
      if (err.fieldErrors) setVariantErrors(err.fieldErrors);
      notify(err.message || 'Failed to add variant', true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateProduct = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const nameRes = validateEntityName(editProductForm.name, 'Product name', { min: 2, max: 80 });
    const catError = !editProductForm.categoryId ? 'Category is required.' : null;
    const priceRes = validatePricePesos(editProductForm.basePricePesos, { required: true, label: 'Base price' });
    const descRes = validateOptionalText(editProductForm.description, 'Description', { max: 2000 });

    const nextErrors = {
      ...(nameRes.valid ? {} : { name: nameRes.error }),
      ...(catError ? { categoryId: catError } : {}),
      ...(priceRes.valid ? {} : { basePricePesos: priceRes.error }),
      ...(descRes.valid ? {} : { description: descRes.error })
    };

    setEditErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalidField(nextErrors, EDIT_PRODUCT_FIELD_IDS);
      return;
    }

    setSubmitting(true);
    try {
      await updateSellerProduct(editProductForm.id, {
        name: nameRes.value,
        categoryId: editProductForm.categoryId,
        basePriceCentavos: priceRes.value,
        audience: editProductForm.audience,
        shoeType: editProductForm.shoeType,
        description: descRes.value || ''
      });
      notify('Product updated!');
      setShowEditModal(false);
      setEditErrors({});
      loadData();
    } catch (err) {
      if (err.fieldErrors) setEditErrors(err.fieldErrors);
      notify(err.message || 'Update failed', true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh', paddingBottom: 'var(--space-16)' }}>
      {/* Toast Notification */}
      {notification && (
        <div style={{
          position: 'fixed',
          bottom: 'var(--space-6)',
          right: 'var(--space-6)',
          background: notification.isError ? 'var(--color-error)' : 'var(--color-text)',
          color: '#fff',
          padding: 'var(--space-3) var(--space-6)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 9999,
          fontSize: 'var(--text-sm)'
        }}>
          {notification.msg}
        </div>
      )}

      {/* Merchant Header */}
      <header style={{ background: 'var(--color-brand-dark)', color: '#fff', padding: 'var(--space-4) 0' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <Link href="/seller/dashboard" style={{ color: '#fff', textDecoration: 'none', fontWeight: 700 }}>
              STRIDERA MERCHANT
            </Link>
          </div>
          <Link href="/seller/dashboard" className="btn btn-ghost btn-sm" style={{ color: '#fff' }}>
            ← Back to Overview
          </Link>
        </div>
      </header>

      <main className="container" style={{ marginTop: 'var(--space-8)' }}>
        {/* Title and Action */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)' }}>My Products & Inventory</h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
              Manage brand catalog items, color/size variants, and live warehouse inventory.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            + Add New Product
          </button>
        </div>

        {/* Search Bar */}
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <input
            type="text"
            placeholder="Search by product name or SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              maxWidth: '400px',
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)'
            }}
          />
        </div>

        {/* Products Table */}
        {loading ? (
          <p style={{ textAlign: 'center', padding: 'var(--space-12) 0', color: 'var(--color-text-muted)' }}>
            Loading products...
          </p>
        ) : products.length === 0 ? (
          <div style={{
            background: 'var(--color-surface)',
            padding: 'var(--space-12)',
            borderRadius: 'var(--radius-lg)',
            textAlign: 'center'
          }}>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>No products listed yet.</p>
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              List Your First Footwear Model
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {products.map(product => (
              <div key={product.id} style={{
                background: 'var(--color-surface)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-6)',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                  <div>
                    <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 600 }}>{product.name}</h2>
                    <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', marginTop: 'var(--space-1)' }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>SKU: {product.sku}</span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Category: {product.category?.name}</span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Type: {product.shoeType}</span>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-brand-primary)' }}>
                        Base: {product.basePriceFormatted}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{
                      padding: '4px 10px', borderRadius: 'var(--radius-full)', fontSize: '11px', fontWeight: 700,
                      background: product.isActive ? '#DCFCE7' : '#F3F4F6',
                      color: product.isActive ? '#166534' : '#374151'
                    }}>
                      {product.status || (product.isActive ? 'ACTIVE' : 'ARCHIVED')}
                    </span>

                    <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
                      📷 Upload Image
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            await uploadSellerProductImage(product.id, file, (product.images?.length || 0) === 0);
                            notify('Product image uploaded!');
                            loadData();
                          } catch (err) {
                            notify(err.message || 'Upload failed', true);
                          }
                        }}
                      />
                    </label>

                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        setEditProductForm({
                          id: product.id,
                          name: product.name,
                          categoryId: product.categoryId,
                          basePricePesos: (product.basePriceCentavos / 100).toFixed(2),
                          audience: product.audience,
                          shoeType: product.shoeType,
                          description: product.description || ''
                        });
                        setShowEditModal(true);
                      }}
                    >
                      ✏️ Edit
                    </button>

                    {product.isActive ? (
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={async () => {
                          try {
                            await archiveSellerProduct(product.id);
                            notify('Product archived (hidden from storefront).');
                            loadData();
                          } catch (err) {
                            notify(err.message || 'Archive failed', true);
                          }
                        }}
                      >
                        Archive
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={async () => {
                          try {
                            await restoreSellerProduct(product.id);
                            notify('Product restored to storefront!');
                            loadData();
                          } catch (err) {
                            notify(err.message || 'Restore failed', true);
                          }
                        }}
                      >
                        Restore
                      </button>
                    )}

                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        setSelectedProduct(product);
                        setShowVariantModal(true);
                      }}
                    >
                      + Add Variant
                    </button>
                  </div>
                </div>

                {/* Variants List for this Product */}
                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)' }}>
                  <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
                    Inventory Variants ({product.variants?.length || 0})
                  </h3>

                  {(!product.variants || product.variants.length === 0) ? (
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning)' }}>
                      ⚠️ No variants configured. Click "+ Add Variant" to enable sizes and stock.
                    </p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--space-3)' }}>
                      {product.variants.map(variant => (
                        <div key={variant.id} style={{
                          background: 'var(--color-surface-raised)',
                          padding: 'var(--space-3)',
                          borderRadius: 'var(--radius-md)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                              Size: {variant.size} • {variant.color}
                            </div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                              Stock: <strong style={{ color: variant.stockQuantity <= 5 ? 'var(--color-error)' : 'inherit' }}>{variant.stockQuantity}</strong>
                            </div>
                          </div>

                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ fontSize: 'var(--text-xs)' }}
                            onClick={() => {
                              setSelectedVariant(variant);
                              setShowStockModal(true);
                            }}
                          >
                            Adjust
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal: Add Product */}
      {showAddModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 'var(--space-4)'
        }}>
          <div style={{
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-8)',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>
              Create New Footwear Model
            </h2>
            <form onSubmit={handleCreateProduct} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label htmlFor="sp-add-name" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Model Name *</label>
                <input
                  id="sp-add-name"
                  type="text"
                  required
                  aria-required="true"
                  maxLength={80}
                  aria-invalid={Boolean(addErrors.name)}
                  aria-describedby={addErrors.name ? 'sp-add-name-error' : undefined}
                  placeholder="e.g. Apex Hyperstride 1"
                  value={newProduct.name}
                  onChange={e => {
                    setNewProduct({ ...newProduct, name: e.target.value });
                    if (addErrors.name) setAddErrors(prev => ({ ...prev, name: null }));
                  }}
                  onBlur={e => setAddErrors(prev => ({ ...prev, name: validateNewProductField('name', e.target.value) }))}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1px solid ${addErrors.name ? 'var(--color-error)' : 'var(--color-border)'}` }}
                />
                <InlineFieldError id="sp-add-name-error" error={addErrors.name} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                <div>
                  <label htmlFor="sp-add-sku" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>SKU Identifier *</label>
                  <input
                    id="sp-add-sku"
                    type="text"
                    required
                    aria-required="true"
                    maxLength={60}
                    aria-invalid={Boolean(addErrors.sku)}
                    aria-describedby={addErrors.sku ? 'sp-add-sku-error' : undefined}
                    placeholder="e.g. APX-HYP-001"
                    value={newProduct.sku}
                    onChange={e => {
                      setNewProduct({ ...newProduct, sku: e.target.value });
                      if (addErrors.sku) setAddErrors(prev => ({ ...prev, sku: null }));
                    }}
                    onBlur={e => setAddErrors(prev => ({ ...prev, sku: validateNewProductField('sku', e.target.value) }))}
                    style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1px solid ${addErrors.sku ? 'var(--color-error)' : 'var(--color-border)'}` }}
                  />
                  <InlineFieldError id="sp-add-sku-error" error={addErrors.sku} />
                </div>
                <div>
                  <label htmlFor="sp-add-category" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Category *</label>
                  <select
                    id="sp-add-category"
                    required
                    aria-required="true"
                    aria-invalid={Boolean(addErrors.categoryId)}
                    aria-describedby={addErrors.categoryId ? 'sp-add-category-error' : undefined}
                    value={newProduct.categoryId}
                    onChange={e => {
                      setNewProduct({ ...newProduct, categoryId: e.target.value });
                      if (addErrors.categoryId) setAddErrors(prev => ({ ...prev, categoryId: null }));
                    }}
                    onBlur={e => setAddErrors(prev => ({ ...prev, categoryId: validateNewProductField('categoryId', e.target.value) }))}
                    style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1px solid ${addErrors.categoryId ? 'var(--color-error)' : 'var(--color-border)'}` }}
                  >
                    <option value="">Select Category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <InlineFieldError id="sp-add-category-error" error={addErrors.categoryId} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                <div>
                  <label htmlFor="sp-add-price" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Base Price (₱ PHP) *</label>
                  <input
                    id="sp-add-price"
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    aria-required="true"
                    aria-invalid={Boolean(addErrors.basePricePesos)}
                    aria-describedby={addErrors.basePricePesos ? 'sp-add-price-error' : undefined}
                    placeholder="e.g. 5495.00"
                    value={newProduct.basePricePesos}
                    onChange={e => {
                      setNewProduct({ ...newProduct, basePricePesos: e.target.value });
                      if (addErrors.basePricePesos) setAddErrors(prev => ({ ...prev, basePricePesos: null }));
                    }}
                    onBlur={e => setAddErrors(prev => ({ ...prev, basePricePesos: validateNewProductField('basePricePesos', e.target.value) }))}
                    style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1px solid ${addErrors.basePricePesos ? 'var(--color-error)' : 'var(--color-border)'}` }}
                  />
                  <InlineFieldError id="sp-add-price-error" error={addErrors.basePricePesos} />
                </div>
                <div>
                  <label htmlFor="sp-add-compare-price" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Compare At Price <span className="form-optional">(optional)</span></label>
                  <input
                    id="sp-add-compare-price"
                    type="number"
                    step="0.01"
                    min="0.01"
                    aria-invalid={Boolean(addErrors.compareAtPricePesos)}
                    aria-describedby={addErrors.compareAtPricePesos ? 'sp-add-compare-error' : undefined}
                    placeholder="e.g. 6495.00"
                    value={newProduct.compareAtPricePesos}
                    onChange={e => {
                      setNewProduct({ ...newProduct, compareAtPricePesos: e.target.value });
                      if (addErrors.compareAtPricePesos) setAddErrors(prev => ({ ...prev, compareAtPricePesos: null }));
                    }}
                    onBlur={e => setAddErrors(prev => ({ ...prev, compareAtPricePesos: validateNewProductField('compareAtPricePesos', e.target.value) }))}
                    style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1px solid ${addErrors.compareAtPricePesos ? 'var(--color-error)' : 'var(--color-border)'}` }}
                  />
                  <InlineFieldError id="sp-add-compare-error" error={addErrors.compareAtPricePesos} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                <div>
                  <label htmlFor="sp-add-audience" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Audience *</label>
                  <select
                    id="sp-add-audience"
                    value={newProduct.audience}
                    onChange={e => setNewProduct({ ...newProduct, audience: e.target.value })}
                    style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                  >
                    <option value="MEN">Men</option>
                    <option value="WOMEN">Women</option>
                    <option value="UNISEX">Unisex</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="sp-add-type" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Shoe Type *</label>
                  <select
                    id="sp-add-type"
                    value={newProduct.shoeType}
                    onChange={e => setNewProduct({ ...newProduct, shoeType: e.target.value })}
                    style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                  >
                    <option value="RUNNING">Running</option>
                    <option value="LIFESTYLE">Lifestyle</option>
                    <option value="BASKETBALL">Basketball</option>
                    <option value="TRAINING">Training</option>
                    <option value="FORMAL">Formal</option>
                    <option value="LOAFERS">Loafers</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="sp-add-description" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Description <span className="form-optional">(optional)</span></label>
                <textarea
                  id="sp-add-description"
                  rows="3"
                  maxLength={2000}
                  aria-invalid={Boolean(addErrors.description)}
                  aria-describedby={addErrors.description ? 'sp-add-description-error' : undefined}
                  placeholder="Engineered for high performance and road running..."
                  value={newProduct.description}
                  onChange={e => {
                    setNewProduct({ ...newProduct, description: e.target.value });
                    if (addErrors.description) setAddErrors(prev => ({ ...prev, description: null }));
                  }}
                  onBlur={e => setAddErrors(prev => ({ ...prev, description: validateNewProductField('description', e.target.value) }))}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1px solid ${addErrors.description ? 'var(--color-error)' : 'var(--color-border)'}` }}
                />
                <InlineFieldError id="sp-add-description-error" error={addErrors.description} />
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                <button type="button" className="btn btn-ghost" onClick={() => { setShowAddModal(false); setAddErrors({}); }}>Cancel</button>
                <button type="submit" disabled={submitting} className="btn btn-primary">{submitting ? 'Saving…' : 'Save Product'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Adjust Stock */}
      {showStockModal && selectedVariant && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 'var(--space-4)'
        }}>
          <div style={{
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-6)',
            maxWidth: '450px',
            width: '100%'
          }}>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
              Adjust Stock Level
            </h2>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
              Variant SKU: {selectedVariant.variantSku} | Current Stock: <strong>{selectedVariant.stockQuantity}</strong>
            </p>

            <form onSubmit={handleStockAdjust} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label htmlFor="sp-stock-delta" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                  Quantity Delta (Positive to add, Negative to remove) *
                </label>
                <input
                  id="sp-stock-delta"
                  type="number"
                  required
                  aria-required="true"
                  aria-invalid={Boolean(stockErrors.quantityChange)}
                  aria-describedby={stockErrors.quantityChange ? 'sp-stock-delta-error' : undefined}
                  placeholder="e.g. 10 or -2"
                  value={stockAdjustment.quantityChange}
                  onChange={e => {
                    setStockAdjustment({ ...stockAdjustment, quantityChange: e.target.value });
                    if (stockErrors.quantityChange) setStockErrors(prev => ({ ...prev, quantityChange: null }));
                  }}
                  onBlur={e => setStockErrors(prev => ({ ...prev, ...validateStockDelta(e.target.value, stockAdjustment.reason) }))}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1px solid ${stockErrors.quantityChange ? 'var(--color-error)' : 'var(--color-border)'}` }}
                />
                <InlineFieldError id="sp-stock-delta-error" error={stockErrors.quantityChange} />
              </div>

              <div>
                <label htmlFor="sp-stock-reason" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                  Reason (Mandatory for Audit Trail) *
                </label>
                <select
                  id="sp-stock-reason"
                  required
                  aria-required="true"
                  value={stockAdjustment.reason}
                  onChange={e => setStockAdjustment({ ...stockAdjustment, reason: e.target.value })}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                >
                  <option value="RESTOCK">Restock Shipment</option>
                  <option value="INVENTORY_COUNT">Physical Inventory Count Adjustment</option>
                  <option value="DAMAGE">Damaged / Written-Off Goods</option>
                  <option value="RETURN">Customer Return Restock</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                <button type="button" className="btn btn-ghost" onClick={() => { setShowStockModal(false); setStockErrors({}); }}>Cancel</button>
                <button type="submit" disabled={submitting} className="btn btn-primary">{submitting ? 'Updating…' : 'Apply Stock Update'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Variant */}
      {showVariantModal && selectedProduct && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 'var(--space-4)'
        }}>
          <div style={{
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-6)',
            maxWidth: '500px',
            width: '100%'
          }}>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
              Add Variant to {selectedProduct.name}
            </h2>

            <form onSubmit={handleAddVariant} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label htmlFor="sp-var-sku" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Variant SKU *</label>
                <input
                  id="sp-var-sku"
                  type="text"
                  required
                  aria-required="true"
                  maxLength={60}
                  aria-invalid={Boolean(variantErrors.variantSku)}
                  aria-describedby={variantErrors.variantSku ? 'sp-var-sku-error' : undefined}
                  placeholder={`${selectedProduct.sku}-9-BLK`}
                  value={newVariant.variantSku}
                  onChange={e => {
                    setNewVariant({ ...newVariant, variantSku: e.target.value });
                    if (variantErrors.variantSku) setVariantErrors(prev => ({ ...prev, variantSku: null }));
                  }}
                  onBlur={e => setVariantErrors(prev => ({ ...prev, variantSku: validateSku(e.target.value, 'Variant SKU').error }))}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1px solid ${variantErrors.variantSku ? 'var(--color-error)' : 'var(--color-border)'}` }}
                />
                <InlineFieldError id="sp-var-sku-error" error={variantErrors.variantSku} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div>
                  <label htmlFor="sp-var-size" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Shoe Size (US) *</label>
                  <select
                    id="sp-var-size"
                    value={newVariant.size}
                    onChange={e => {
                      setNewVariant({ ...newVariant, size: e.target.value });
                      if (variantErrors.size) setVariantErrors(prev => ({ ...prev, size: null }));
                    }}
                    aria-invalid={Boolean(variantErrors.size)}
                    aria-describedby={variantErrors.size ? 'sp-var-size-error' : undefined}
                    style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1px solid ${variantErrors.size ? 'var(--color-error)' : 'var(--color-border)'}` }}
                  >
                    {ALLOWED_SHOE_SIZES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <InlineFieldError id="sp-var-size-error" error={variantErrors.size} />
                </div>

                <div>
                  <label htmlFor="sp-var-color" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Color Name *</label>
                  <input
                    id="sp-var-color"
                    type="text"
                    required
                    aria-required="true"
                    maxLength={60}
                    aria-invalid={Boolean(variantErrors.color)}
                    aria-describedby={variantErrors.color ? 'sp-var-color-error' : undefined}
                    placeholder="e.g. Black/Lime"
                    value={newVariant.color}
                    onChange={e => {
                      setNewVariant({ ...newVariant, color: e.target.value });
                      if (variantErrors.color) setVariantErrors(prev => ({ ...prev, color: null }));
                    }}
                    onBlur={e => setVariantErrors(prev => ({ ...prev, color: validateColor(e.target.value).error }))}
                    style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1px solid ${variantErrors.color ? 'var(--color-error)' : 'var(--color-border)'}` }}
                  />
                  <InlineFieldError id="sp-var-color-error" error={variantErrors.color} />
                </div>
              </div>

              <div>
                <label htmlFor="sp-var-stock" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Initial Stock Units *</label>
                <input
                  id="sp-var-stock"
                  type="number"
                  min="0"
                  required
                  aria-required="true"
                  aria-invalid={Boolean(variantErrors.stockQuantity)}
                  aria-describedby={variantErrors.stockQuantity ? 'sp-var-stock-error' : undefined}
                  value={newVariant.stockQuantity}
                  onChange={e => {
                    setNewVariant({ ...newVariant, stockQuantity: e.target.value });
                    if (variantErrors.stockQuantity) setVariantErrors(prev => ({ ...prev, stockQuantity: null }));
                  }}
                  onBlur={e => setVariantErrors(prev => ({ ...prev, stockQuantity: validateStock(e.target.value).error }))}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1px solid ${variantErrors.stockQuantity ? 'var(--color-error)' : 'var(--color-border)'}` }}
                />
                <InlineFieldError id="sp-var-stock-error" error={variantErrors.stockQuantity} />
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                <button type="button" className="btn btn-ghost" onClick={() => { setShowVariantModal(false); setVariantErrors({}); }}>Cancel</button>
                <button type="submit" disabled={submitting} className="btn btn-primary">{submitting ? 'Creating…' : 'Create Variant'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Edit Product Modal */}
      {showEditModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)'
        }}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', width: '100%', maxWidth: 500 }}>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Edit Product</h2>
            <form
              onSubmit={handleUpdateProduct}
              noValidate
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
            >
              <div>
                <label htmlFor="sp-edit-name" className="form-label">Product Name *</label>
                <input
                  id="sp-edit-name"
                  type="text"
                  required
                  aria-required="true"
                  maxLength={80}
                  aria-invalid={Boolean(editErrors.name)}
                  aria-describedby={editErrors.name ? 'sp-edit-name-error' : undefined}
                  className="form-input"
                  value={editProductForm.name}
                  onChange={e => {
                    setEditProductForm(p => ({ ...p, name: e.target.value }));
                    if (editErrors.name) setEditErrors(prev => ({ ...prev, name: null }));
                  }}
                  onBlur={e => setEditErrors(prev => ({ ...prev, name: validateEntityName(e.target.value, 'Product name', { min: 2, max: 80 }).error }))}
                />
                <InlineFieldError id="sp-edit-name-error" error={editErrors.name} />
              </div>
              <div>
                <label htmlFor="sp-edit-category" className="form-label">Category *</label>
                <select
                  id="sp-edit-category"
                  required
                  aria-required="true"
                  aria-invalid={Boolean(editErrors.categoryId)}
                  aria-describedby={editErrors.categoryId ? 'sp-edit-category-error' : undefined}
                  className="form-input"
                  value={editProductForm.categoryId}
                  onChange={e => {
                    setEditProductForm(p => ({ ...p, categoryId: e.target.value }));
                    if (editErrors.categoryId) setEditErrors(prev => ({ ...prev, categoryId: null }));
                  }}
                >
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <InlineFieldError id="sp-edit-category-error" error={editErrors.categoryId} />
              </div>
              <div>
                <label htmlFor="sp-edit-price" className="form-label">Base Price (PHP) *</label>
                <input
                  id="sp-edit-price"
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  aria-required="true"
                  aria-invalid={Boolean(editErrors.basePricePesos)}
                  aria-describedby={editErrors.basePricePesos ? 'sp-edit-price-error' : undefined}
                  className="form-input"
                  value={editProductForm.basePricePesos}
                  onChange={e => {
                    setEditProductForm(p => ({ ...p, basePricePesos: e.target.value }));
                    if (editErrors.basePricePesos) setEditErrors(prev => ({ ...prev, basePricePesos: null }));
                  }}
                  onBlur={e => setEditErrors(prev => ({ ...prev, basePricePesos: validatePricePesos(e.target.value, { required: true, label: 'Base price' }).error }))}
                />
                <InlineFieldError id="sp-edit-price-error" error={editErrors.basePricePesos} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div>
                  <label htmlFor="sp-edit-audience" className="form-label">Audience *</label>
                  <select id="sp-edit-audience" className="form-input" value={editProductForm.audience} onChange={e => setEditProductForm(p => ({ ...p, audience: e.target.value }))}>
                    <option value="MEN">Men</option>
                    <option value="WOMEN">Women</option>
                    <option value="UNISEX">Unisex</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="sp-edit-type" className="form-label">Shoe Type *</label>
                  <select id="sp-edit-type" className="form-input" value={editProductForm.shoeType} onChange={e => setEditProductForm(p => ({ ...p, shoeType: e.target.value }))}>
                    <option value="RUNNING">Running</option>
                    <option value="LIFESTYLE">Lifestyle</option>
                    <option value="BASKETBALL">Basketball</option>
                    <option value="TRAINING">Training</option>
                    <option value="FORMAL">Formal</option>
                    <option value="LOAFERS">Loafers</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="sp-edit-description" className="form-label">Description <span className="form-optional">(optional)</span></label>
                <textarea
                  id="sp-edit-description"
                  rows={3}
                  maxLength={2000}
                  aria-invalid={Boolean(editErrors.description)}
                  aria-describedby={editErrors.description ? 'sp-edit-description-error' : undefined}
                  className="form-input"
                  value={editProductForm.description}
                  onChange={e => {
                    setEditProductForm(p => ({ ...p, description: e.target.value }));
                    if (editErrors.description) setEditErrors(prev => ({ ...prev, description: null }));
                  }}
                  onBlur={e => setEditErrors(prev => ({ ...prev, description: validateOptionalText(e.target.value, 'Description', { max: 2000 }).error }))}
                />
                <InlineFieldError id="sp-edit-description-error" error={editErrors.description} />
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                <button type="button" className="btn btn-ghost" onClick={() => { setShowEditModal(false); setEditErrors({}); }}>Cancel</button>
                <button type="submit" disabled={submitting} className="btn btn-primary">{submitting ? 'Saving…' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

