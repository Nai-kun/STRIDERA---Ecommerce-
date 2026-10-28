'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getSellerProducts,
  createSellerProduct,
  addSellerVariant,
  adjustSellerStock,
  getCategories
} from '../../../lib/api';

export default function SellerProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [notification, setNotification] = useState(null);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [showVariantModal, setShowVariantModal] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);

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

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: newProduct.name,
        sku: newProduct.sku,
        categoryId: newProduct.categoryId,
        basePriceCentavos: Math.round(parseFloat(newProduct.basePricePesos) * 100),
        compareAtPriceCentavos: newProduct.compareAtPricePesos ? Math.round(parseFloat(newProduct.compareAtPricePesos) * 100) : null,
        audience: newProduct.audience,
        shoeType: newProduct.shoeType,
        description: newProduct.description,
        features: newProduct.features
      };

      const res = await createSellerProduct(payload);
      if (res.success) {
        notify('Product created successfully!');
        setShowAddModal(false);
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
      notify(err.message || 'Failed to create product', true);
    }
  };

  const handleStockAdjust = async (e) => {
    e.preventDefault();
    if (!selectedVariant) return;

    try {
      const res = await adjustSellerStock(
        selectedVariant.id,
        parseInt(stockAdjustment.quantityChange),
        stockAdjustment.reason
      );
      if (res.success) {
        notify(`Stock updated! New stock: ${res.data.stockAfter}`);
        setShowStockModal(false);
        setSelectedVariant(null);
        setStockAdjustment({ quantityChange: 0, reason: 'RESTOCK' });
        loadData();
      }
    } catch (err) {
      notify(err.message || 'Failed to update stock', true);
    }
  };

  const handleAddVariant = async (e) => {
    e.preventDefault();
    if (!selectedProduct) return;

    try {
      const res = await addSellerVariant(selectedProduct.id, {
        variantSku: newVariant.variantSku,
        size: newVariant.size,
        color: newVariant.color,
        colorHex: newVariant.colorHex,
        stockQuantity: parseInt(newVariant.stockQuantity)
      });

      if (res.success) {
        notify('Variant added successfully!');
        setShowVariantModal(false);
        setSelectedProduct(null);
        setNewVariant({ variantSku: '', size: '9', color: '', colorHex: '#000000', stockQuantity: 10 });
        loadData();
      }
    } catch (err) {
      notify(err.message || 'Failed to add variant', true);
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
            <form onSubmit={handleCreateProduct} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Model Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Hyperstride 1"
                  value={newProduct.name}
                  onChange={e => setNewProduct({ ...newProduct, name: e.target.value })}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>SKU Identifier</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. APX-HYP-001"
                    value={newProduct.sku}
                    onChange={e => setNewProduct({ ...newProduct, sku: e.target.value })}
                    style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Category</label>
                  <select
                    required
                    value={newProduct.categoryId}
                    onChange={e => setNewProduct({ ...newProduct, categoryId: e.target.value })}
                    style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                  >
                    <option value="">Select Category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Base Price (₱ PHP)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder="e.g. 5495.00"
                    value={newProduct.basePricePesos}
                    onChange={e => setNewProduct({ ...newProduct, basePricePesos: e.target.value })}
                    style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Compare At Price (optional)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 6495.00"
                    value={newProduct.compareAtPricePesos}
                    onChange={e => setNewProduct({ ...newProduct, compareAtPricePesos: e.target.value })}
                    style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Audience</label>
                  <select
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
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Shoe Type</label>
                  <select
                    value={newProduct.shoeType}
                    onChange={e => setNewProduct({ ...newProduct, shoeType: e.target.value })}
                    style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                  >
                    <option value="RUNNING">Running</option>
                    <option value="LIFESTYLE">Lifestyle</option>
                    <option value="BASKETBALL">Basketball</option>
                    <option value="TRAINING">Training</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Description</label>
                <textarea
                  rows="3"
                  placeholder="Engineered for high performance and road running..."
                  value={newProduct.description}
                  onChange={e => setNewProduct({ ...newProduct, description: e.target.value })}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Product</button>
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

            <form onSubmit={handleStockAdjust} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                  Quantity Delta (Positive to add, Negative to remove)
                </label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 10 or -2"
                  value={stockAdjustment.quantityChange}
                  onChange={e => setStockAdjustment({ ...stockAdjustment, quantityChange: e.target.value })}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                  Reason (Mandatory for Audit Trail)
                </label>
                <select
                  required
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
                <button type="button" className="btn btn-ghost" onClick={() => setShowStockModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Apply Stock Update</button>
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

            <form onSubmit={handleAddVariant} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Variant SKU</label>
                <input
                  type="text"
                  required
                  placeholder={`${selectedProduct.sku}-9-BLK`}
                  value={newVariant.variantSku}
                  onChange={e => setNewVariant({ ...newVariant, variantSku: e.target.value })}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Shoe Size (US)</label>
                  <select
                    value={newVariant.size}
                    onChange={e => setNewVariant({ ...newVariant, size: e.target.value })}
                    style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                  >
                    {['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '12'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Color Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Black/Lime"
                    value={newVariant.color}
                    onChange={e => setNewVariant({ ...newVariant, color: e.target.value })}
                    style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Initial Stock Units</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={newVariant.stockQuantity}
                  onChange={e => setNewVariant({ ...newVariant, stockQuantity: e.target.value })}
                  style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowVariantModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Variant</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
