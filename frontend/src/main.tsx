import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const API = '/api';
type Product = { id: number; sku: string; name: string; category_id: number; category: string; price: number; stock: number };
type Category = { id: number; name: string };
type Warehouse = { id: number; name: string; location: string };
type InventoryRow = { product_id: number; sku: string; product: string; warehouse_id: number; warehouse: string; location: string; quantity: number; low_stock: boolean };
type Customer = { id: number; name: string; email: string; address?: string };
type Order = { id: number; customer_id: number; customer: string; status: string; total: number; created_at: string; item_count: number };
type OrderLine = { id: number; product_id: number; sku: string; product: string; warehouse_id: number; warehouse: string; quantity: number; unit_price: number; line_total: number };
type OrderDetails = { order: Order & { email: string }; items: OrderLine[] };
type Payment = { id: number; order_id: number; customer: string; amount: number; status: string; payment_method: string; transaction_reference?: string; created_at: string; paid_at?: string };
type Shipment = { id: number; order_id: number; customer: string; status: string; tracking_number?: string; carrier?: string; shipped_at?: string; estimated_delivery?: string; delivered_at?: string };
type ProductForm = { sku: string; name: string; categoryId: string; price: string };
type CartLine = { key: number; productId: string; warehouseId: string; quantity: string };
const emptyForm: ProductForm = { sku: '', name: '', categoryId: '', price: '' };

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.text();
    let message = body;
    try { const parsed = JSON.parse(body); message = parsed.detail || parsed.message || body; } catch { /* plain text */ }
    throw new Error(message || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [stockProduct, setStockProduct] = useState('');
  const [stockWarehouse, setStockWarehouse] = useState('');
  const [stockQuantity, setStockQuantity] = useState('10');
  const [orderCustomer, setOrderCustomer] = useState('');
  const [cart, setCart] = useState<CartLine[]>([{ key: 1, productId: '', warehouseId: '', quantity: '1' }]);
  const [nextCartKey, setNextCartKey] = useState(2);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    try {
      const [p, c, w, i, cust, o, d, pay, ship] = await Promise.all([
        request<Product[]>('/products'), request<Category[]>('/categories'),
        request<Warehouse[]>('/warehouses'), request<InventoryRow[]>('/inventory'),
        request<Customer[]>('/customers'), request<Order[]>('/orders'),
        request<Record<string, number>>('/dashboard'), request<Payment[]>('/payments'),
        request<Shipment[]>('/shipments'),
      ]);
      setProducts(p); setCategories(c); setWarehouses(w); setInventory(i);
      setCustomers(cust); setOrders(o); setStats(d); setPayments(pay); setShipments(ship);
      setStockProduct((old) => old || (p[0] ? String(p[0].id) : ''));
      setStockWarehouse((old) => old || (w[0] ? String(w[0].id) : ''));
      setOrderCustomer((old) => old || (cust[0] ? String(cust[0].id) : ''));
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  useEffect(() => { void load(); }, []);

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((p) => {
      const textMatch = !term || [p.sku, p.name, p.category].some((v) => v.toLowerCase().includes(term));
      return textMatch && (categoryFilter === 'all' || String(p.category_id) === categoryFilter);
    });
  }, [products, search, categoryFilter]);
  const lowStockCount = inventory.filter((row) => row.low_stock).length;

  const openAdd = () => {
    setEditingId(null); setForm({ ...emptyForm, categoryId: categories[0] ? String(categories[0].id) : '' });
    setShowForm(true); setError(''); setMessage('');
  };
  const openEdit = (p: Product) => {
    setEditingId(p.id); setForm({ sku: p.sku, name: p.name, categoryId: String(p.category_id), price: String(p.price) });
    setShowForm(true); setError(''); setMessage('');
  };
  const saveProduct = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const payload = { sku: form.sku.trim(), name: form.name.trim(), categoryId: Number(form.categoryId), price: Number(form.price) };
      if (!payload.sku || !payload.name || !payload.categoryId || !Number.isFinite(payload.price) || payload.price < 0) throw new Error('Please complete all fields and enter a valid non-negative price.');
      if (editingId === null) {
        await request('/products', { method: 'POST', body: JSON.stringify(payload) });
        setMessage('Product added successfully. Set its stock below.');
      } else {
        await request(`/products/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        setMessage('Product updated successfully.');
      }
      setShowForm(false); setForm(emptyForm); await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const deleteProduct = async (p: Product) => {
    if (!window.confirm(`Delete "${p.name}"? Products already used in orders cannot be deleted.`)) return;
    setBusy(true); setError(''); setMessage('');
    try { await request(`/products/${p.id}`, { method: 'DELETE' }); setMessage(`${p.name} deleted.`); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const placeQuickOrder = async (p: Product) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await request('/orders', { method: 'POST', body: JSON.stringify({
        customerId: 1, items: [{ productId: p.id, warehouseId: 1, quantity: 1 }],
      }) });
      setMessage(`Order created for ${p.name}.`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const updateStock = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const quantity = Number(stockQuantity);
      if (!stockProduct || !stockWarehouse || !Number.isInteger(quantity) || quantity < 0) throw new Error('Choose a product and warehouse, and enter a whole number of 0 or more.');
      const result = await request<InventoryRow>('/inventory', { method: 'PUT', body: JSON.stringify({ productId: Number(stockProduct), warehouseId: Number(stockWarehouse), quantity }) });
      setMessage(`Stock updated: ${result.product} at ${result.warehouse} now has ${result.quantity} units.`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const updateCartLine = (key: number, field: keyof Omit<CartLine, 'key'>, value: string) => {
    setCart((old) => old.map((line) => line.key === key ? { ...line, [field]: value } : line));
  };
  const addCartLine = () => {
    setCart((old) => [...old, { key: nextCartKey, productId: '', warehouseId: '', quantity: '1' }]);
    setNextCartKey((n) => n + 1);
  };
  const removeCartLine = (key: number) => setCart((old) => old.length === 1 ? old : old.filter((line) => line.key !== key));

  const createOrder = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      if (!orderCustomer) throw new Error('Choose a customer.');
      const items = cart.map((line) => ({
        productId: Number(line.productId), warehouseId: Number(line.warehouseId), quantity: Number(line.quantity),
      }));
      if (items.some((line) => !line.productId || !line.warehouseId || !Number.isInteger(line.quantity) || line.quantity <= 0)) {
        throw new Error('Complete every order line with a product, warehouse and positive whole-number quantity.');
      }
      const seen = new Set<string>();
      for (const line of items) {
        const key = `${line.productId}:${line.warehouseId}`;
        if (seen.has(key)) throw new Error('A product can appear only once per warehouse in an order. Update the quantity on its existing line.');
        seen.add(key);
      }
      const created = await request<{ id: number; total: number }>('/orders', {
        method: 'POST', body: JSON.stringify({ customerId: Number(orderCustomer), items }),
      });
      setMessage(`Order #${created.id} created successfully. Total: $${Number(created.total).toFixed(2)}.`);
      setCart([{ key: nextCartKey, productId: '', warehouseId: '', quantity: '1' }]);
      setNextCartKey((n) => n + 1);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const openOrder = async (id: number) => {
    setError('');
    try { setSelectedOrder(await request<OrderDetails>(`/orders/${id}`)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const changeOrderStatus = async (id: number, status: string) => {
    const prompt = status === 'CANCELLED'
      ? 'Cancel this order? Its quantities will be returned to inventory.'
      : status === 'PAID' ? 'Mark this order as paid?' : 'Mark this order as shipped?';
    if (!window.confirm(prompt)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await request(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setMessage(`Order #${id} updated to ${status}.`);
      await load();
      if (selectedOrder?.order.id === id) await openOrder(id);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const editPaymentDetails = async (payment: Payment) => {
    const method = window.prompt('Payment method (e.g. CARD, BANK_TRANSFER, CASH):', payment.payment_method === 'UNSPECIFIED' ? 'CARD' : payment.payment_method);
    if (!method) return;
    const reference = window.prompt('Transaction reference (optional):', payment.transaction_reference || '');
    setBusy(true); setError(''); setMessage('');
    try {
      await request(`/payments/${payment.order_id}`, { method: 'PUT', body: JSON.stringify({ paymentMethod: method, transactionReference: reference || null }) });
      setMessage(`Payment details saved for order #${payment.order_id}.`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const editShipmentDetails = async (shipment: Shipment) => {
    const carrier = window.prompt('Shipping carrier (e.g. UPS, FedEx, USPS):', shipment.carrier || 'UPS');
    if (!carrier) return;
    const tracking = window.prompt('Tracking number (optional):', shipment.tracking_number || '');
    if (tracking === null) return;
    const delivery = window.prompt('Estimated delivery date (YYYY-MM-DD, optional):', shipment.estimated_delivery || '');
    if (delivery === null) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await request(`/shipments/${shipment.order_id}`, { method: 'PUT', body: JSON.stringify({ carrier, trackingNumber: tracking || null, estimatedDelivery: delivery || null }) });
      setMessage(`Tracking details saved for order #${shipment.order_id}.`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const markDelivered = async (shipment: Shipment) => {
    if (!window.confirm(`Mark order #${shipment.order_id} as delivered?`)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await request(`/shipments/${shipment.order_id}/deliver`, { method: 'PATCH' });
      setMessage(`Order #${shipment.order_id} marked as delivered.`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const cartEstimate = cart.reduce((sum, line) => {
    const p = products.find((item) => String(item.id) === line.productId);
    const qty = Number(line.quantity);
    return sum + (p && Number.isInteger(qty) && qty > 0 ? Number(p.price) * qty : 0);
  }, 0);

  return <main>
    <header className="topbar">
      <div><span className="eyebrow">OPERATIONS / INVENTORY CONTROL</span><h1>Smart Inventory</h1><p>Manage products, monitor stock and keep orders moving.</p></div>
      <button className="primary add-top" onClick={openAdd}>＋ Add product</button>
    </header>
    <section className="stats">
      <article><small>Total products</small><strong>{stats.products ?? '—'}</strong><span>Catalog items</span></article>
      <article><small>Total orders</small><strong>{stats.orders ?? '—'}</strong><span>Orders created</span></article>
      <article><small>Units in stock</small><strong>{stats.unitsInStock ?? '—'}</strong><span>Across warehouses</span></article>
      <article><small>Low-stock entries</small><strong>{lowStockCount}</strong><span>At or below 5 units</span></article>
    </section>
    {error && <div className="notice error">{error}</div>}
    {message && <div className="notice success">{message}</div>}

    <section className="panel">
      <div className="section-heading"><div><span className="section-kicker">CATALOG</span><h2>Product management</h2><p>Search, filter, add and maintain your product catalog.</p></div><button className="primary" onClick={openAdd}>＋ New product</button></div>
      <div className="filters"><input aria-label="Search products" placeholder="Search by name, SKU or category…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Filter by category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="all">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <span className="result-count">{visibleProducts.length} products</span></div>
      <div className="scroll"><table><thead><tr><th>SKU</th><th>Product</th><th>Category</th><th>Unit price</th><th>Stock</th><th>Quick order</th><th>Manage</th></tr></thead>
        <tbody>{visibleProducts.map((p) => <tr key={p.id}><td><span className="sku">{p.sku}</span></td><td className="product-name">{p.name}</td><td>{p.category}</td><td>${Number(p.price).toFixed(2)}</td><td><span className={p.stock > 5 ? 'stock' : 'stock low'}>{p.stock}</span></td><td><button className="small primary" disabled={busy || p.stock < 1} onClick={() => void placeQuickOrder(p)}>Order 1</button></td><td><div className="actions"><button className="small secondary" disabled={busy} onClick={() => openEdit(p)}>Edit</button><button className="small danger" disabled={busy} onClick={() => void deleteProduct(p)}>Delete</button></div></td></tr>)}
          {visibleProducts.length === 0 && <tr><td colSpan={7} className="empty">No products match your search.</td></tr>}</tbody></table></div>
    </section>

    <section className="panel">
      <div className="section-heading"><div><span className="section-kicker">WAREHOUSE OPERATIONS</span><h2>Inventory management</h2><p>Set on-hand quantities for each product at a warehouse.</p></div></div>
      <form className="stock-form" onSubmit={updateStock}>
        <label>Product<select required value={stockProduct} onChange={(e) => setStockProduct(e.target.value)}><option value="">Choose product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}</select></label>
        <label>Warehouse<select required value={stockWarehouse} onChange={(e) => setStockWarehouse(e.target.value)}><option value="">Choose warehouse</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        <label>New quantity<input required type="number" min="0" step="1" value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value)} /></label>
        <button className="primary stock-submit" type="submit" disabled={busy || !products.length || !warehouses.length}>Update stock</button>
      </form>
      <div className="scroll inventory-table"><table><thead><tr><th>SKU</th><th>Product</th><th>Warehouse</th><th>Location</th><th>Quantity</th><th>Stock status</th></tr></thead>
        <tbody>{inventory.map((row) => <tr key={`${row.product_id}-${row.warehouse_id}`}><td><span className="sku">{row.sku}</span></td><td className="product-name">{row.product}</td><td>{row.warehouse}</td><td>{row.location || '—'}</td><td>{row.quantity}</td><td><span className={row.low_stock ? 'stock low' : 'stock'}>{row.low_stock ? 'Low stock' : 'Healthy'}</span></td></tr>)}
          {inventory.length === 0 && <tr><td colSpan={6} className="empty">No inventory records found.</td></tr>}</tbody></table></div>
      <p className="form-hint">Low stock is defined as 5 units or fewer. Updating stock sets the on-hand quantity to the value entered.</p>
    </section>

    <section className="panel">
      <div className="section-heading"><div><span className="section-kicker">ORDER ENTRY</span><h2>Create an order</h2><p>Create an order with one or more product lines.</p></div></div>
      <form onSubmit={createOrder} className="order-form">
        <label className="customer-field">Customer<select required value={orderCustomer} onChange={(e) => setOrderCustomer(e.target.value)}><option value="">Choose customer</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.email}</option>)}</select></label>
        {cart.map((line, index) => {
          const selectedProduct = products.find((p) => String(p.id) === line.productId);
          const selectedWarehouse = warehouses.find((w) => String(w.id) === line.warehouseId);
          const available = selectedProduct ? inventory.find((r) => r.product_id === selectedProduct.id && String(r.warehouse_id) === line.warehouseId)?.quantity ?? 0 : 0;
          return <div className="cart-line" key={line.key}>
            <div className="line-title">Item {index + 1}</div>
            <label>Product<select required value={line.productId} onChange={(e) => updateCartLine(line.key, 'productId', e.target.value)}><option value="">Choose product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name} (${Number(p.price).toFixed(2)})</option>)}</select></label>
            <label>Warehouse<select required value={line.warehouseId} onChange={(e) => updateCartLine(line.key, 'warehouseId', e.target.value)}><option value="">Choose warehouse</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
            <label>Quantity<input required type="number" min="1" step="1" value={line.quantity} onChange={(e) => updateCartLine(line.key, 'quantity', e.target.value)} /></label>
            <div className="line-availability">{selectedWarehouse && selectedProduct ? `${available} available` : 'Select product and warehouse'}</div>
            <button type="button" className="small danger remove-line" disabled={cart.length === 1} onClick={() => removeCartLine(line.key)}>Remove</button>
          </div>;
        })}
        <div className="order-form-footer"><button type="button" className="secondary" onClick={addCartLine}>＋ Add another item</button><div className="estimate">Estimated total <strong>${cartEstimate.toFixed(2)}</strong></div><button type="submit" className="primary" disabled={busy || !products.length || !warehouses.length || !customers.length}>{busy ? 'Creating…' : 'Create order'}</button></div>
        <p className="form-hint">Stock is checked and deducted transactionally when the order is created. Orders start as Pending.</p>
      </form>
    </section>

    <section className="panel">
      <div className="section-heading"><div><span className="section-kicker">FULFILLMENT</span><h2>Order management</h2><p>View order details and progress orders through fulfillment.</p></div></div>
      <div className="scroll"><table><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Status</th><th>Total</th><th>Actions</th></tr></thead>
        <tbody>{orders.map((o) => <tr key={o.id}><td>#{o.id}</td><td>{o.customer}</td><td>{o.item_count}</td><td><span className={`status ${o.status.toLowerCase()}`}>{o.status}</span></td><td>${Number(o.total).toFixed(2)}</td><td><div className="actions"><button className="small secondary" onClick={() => void openOrder(o.id)}>Details</button>
          {o.status === 'PENDING' && <button className="small primary" disabled={busy} onClick={() => void changeOrderStatus(o.id, 'PAID')}>Mark paid</button>}
          {o.status === 'PAID' && <button className="small primary" disabled={busy} onClick={() => void changeOrderStatus(o.id, 'SHIPPED')}>Ship</button>}
          {(o.status === 'PENDING' || o.status === 'PAID') && <button className="small danger" disabled={busy} onClick={() => void changeOrderStatus(o.id, 'CANCELLED')}>Cancel</button>}
        </div></td></tr>)}
          {orders.length === 0 && <tr><td colSpan={6} className="empty">No orders yet.</td></tr>}</tbody></table></div>
    </section>

    <section className="panel">
      <div className="section-heading"><div><span className="section-kicker">FINANCE</span><h2>Payment management</h2><p>Review payment records and attach payment methods and transaction references.</p></div></div>
      <div className="mini-stats"><article><small>Paid payments</small><strong>{stats.paidPayments ?? 0}</strong></article><article><small>Pending payments</small><strong>{stats.pendingPayments ?? 0}</strong></article></div>
      <div className="scroll"><table><thead><tr><th>Order</th><th>Customer</th><th>Amount</th><th>Status</th><th>Method</th><th>Transaction reference</th><th>Action</th></tr></thead><tbody>
        {payments.map((payment) => <tr key={payment.id}><td>#{payment.order_id}</td><td>{payment.customer}</td><td>${Number(payment.amount).toFixed(2)}</td><td><span className={`status ${payment.status.toLowerCase()}`}>{payment.status}</span></td><td>{payment.payment_method || '—'}</td><td>{payment.transaction_reference || '—'}</td><td>{payment.status === 'PAID' ? <button className="small secondary" disabled={busy} onClick={() => void editPaymentDetails(payment)}>Edit details</button> : '—'}</td></tr>)}
        {payments.length === 0 && <tr><td colSpan={7} className="empty">No payment records found.</td></tr>}
      </tbody></table></div>
    </section>

    <section className="panel">
      <div className="section-heading"><div><span className="section-kicker">LOGISTICS</span><h2>Shipment management</h2><p>Manage tracking information and confirm delivery for shipped orders.</p></div></div>
      <div className="mini-stats"><article><small>Shipped</small><strong>{stats.shippedOrders ?? 0}</strong></article><article><small>Delivered</small><strong>{stats.deliveredOrders ?? 0}</strong></article></div>
      <div className="scroll"><table><thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Carrier</th><th>Tracking number</th><th>Estimated delivery</th><th>Actions</th></tr></thead><tbody>
        {shipments.map((shipment) => <tr key={shipment.id}><td>#{shipment.order_id}</td><td>{shipment.customer}</td><td><span className={`status ${shipment.status.toLowerCase()}`}>{shipment.status}</span></td><td>{shipment.carrier || '—'}</td><td>{shipment.tracking_number || '—'}</td><td>{shipment.estimated_delivery || '—'}</td><td><div className="actions">{shipment.status === 'SHIPPED' && <><button className="small secondary" disabled={busy} onClick={() => void editShipmentDetails(shipment)}>Tracking</button><button className="small primary" disabled={busy} onClick={() => void markDelivered(shipment)}>Mark delivered</button></>}</div></td></tr>)}
        {shipments.length === 0 && <tr><td colSpan={7} className="empty">No shipment records found.</td></tr>}
      </tbody></table></div>
    </section>

    {selectedOrder && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedOrder(null); }}>
      <section className="modal order-modal" role="dialog" aria-modal="true" aria-labelledby="order-detail-title">
        <div className="modal-heading"><div><span className="section-kicker">ORDER DETAILS</span><h2 id="order-detail-title">Order #{selectedOrder.order.id}</h2></div><button className="icon-button" aria-label="Close" onClick={() => setSelectedOrder(null)}>×</button></div>
        <div className="detail-grid"><div><small>Customer</small><strong>{selectedOrder.order.customer}</strong><span>{selectedOrder.order.email}</span></div><div><small>Status</small><strong><span className={`status ${selectedOrder.order.status.toLowerCase()}`}>{selectedOrder.order.status}</span></strong></div><div><small>Created</small><strong>{new Date(selectedOrder.order.created_at).toLocaleString()}</strong></div><div><small>Order total</small><strong>${Number(selectedOrder.order.total).toFixed(2)}</strong></div></div>
        <div className="scroll"><table><thead><tr><th>Product</th><th>Warehouse</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr></thead><tbody>{selectedOrder.items.map((item) => <tr key={item.id}><td>{item.sku} — {item.product}</td><td>{item.warehouse}</td><td>{item.quantity}</td><td>${Number(item.unit_price).toFixed(2)}</td><td>${Number(item.line_total).toFixed(2)}</td></tr>)}</tbody></table></div>
        <div className="modal-actions"><button className="secondary" onClick={() => setSelectedOrder(null)}>Close</button></div>
      </section>
    </div>}

    {showForm && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="product-form-title">
        <div className="modal-heading"><div><span className="section-kicker">PRODUCT CATALOG</span><h2 id="product-form-title">{editingId === null ? 'Add a product' : 'Edit product'}</h2></div><button className="icon-button" aria-label="Close" onClick={() => setShowForm(false)}>×</button></div>
        <form onSubmit={saveProduct}>
          <label>SKU<input required maxLength={60} value={form.sku} placeholder="e.g. KB-002" onChange={(e) => setForm({ ...form, sku: e.target.value })} /></label>
          <label>Product name<input required maxLength={160} value={form.name} placeholder="e.g. Ergonomic Keyboard" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Category<select required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}><option value="">Choose a category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Unit price (USD)<input required type="number" min="0" step="0.01" value={form.price} placeholder="0.00" onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
          <p className="form-hint">New products start with zero stock. Set their quantity in Inventory Management.</p>
          <div className="modal-actions"><button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancel</button><button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : editingId === null ? 'Create product' : 'Save changes'}</button></div>
        </form>
      </section>
    </div>}
    <footer>Smart Inventory · Production environment</footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
