import React, { useEffect, useState } from 'react';
import api from '../api/axios';

interface AdminOrderItem {
  id: number;
  quantity: number;
  line_total_pence: number;
  prodigi_sku_snapshot: string;
  allocated_profit_pence: number;
  Design?: { id: number; title: string };
  ProductVariant?: { id: number; description: string; Product?: { name: string } };
  Charity?: { id: number; name: string };
}

interface AdminOrder {
  id: number;
  order_number: string;
  customer_name: string | null;
  customer_email: string | null;
  shipping_address_json?: { postal_code?: string; city?: string } | null;
  charity_selection_mode: 'per_item' | 'per_order';
  prodigi_order_id: string | null;
  prodigi_stage: string | null;
  tracking_url: string | null;
  total_paid_pence: number;
  stripe_fee_pence: number;
  prodigi_cost_pence: number;
  net_profit_pence: number;
  charity_profit_pence: number;
  fulfillment_error_message: string | null;
  status: string;
  createdAt: string;
  OrderItems?: AdminOrderItem[];
}

const formatGbp = (pence: number) => `£${((pence || 0) / 100).toFixed(2)}`;

const OrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const res = await api.get<AdminOrder[]>('/orders');
      setOrders(res.data || []);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleRetryProdigi = async (orderId: number) => {
    setBusyOrderId(orderId);
    setMessage(null);
    try {
      await api.post(`/orders/${orderId}/retry-prodigi`);
      setMessage('Submitted order to Prodigi Sandbox successfully.');
      await loadOrders();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Prodigi submission failed.');
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleSyncProdigi = async (orderId: number) => {
    setBusyOrderId(orderId);
    setMessage(null);
    try {
      await api.post(`/orders/${orderId}/sync-prodigi`);
      setMessage('Synced latest Prodigi status, cost, and reconciled Charity Ledger.');
      await loadOrders();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Prodigi sync failed.');
    } finally {
      setBusyOrderId(null);
    }
  };

  const paidOrders = orders.filter((o) => o.status !== 'pending_payment');
  const totalRevenuePence = paidOrders.reduce((s, o) => s + o.total_paid_pence, 0);
  const totalCharityProfitPence = paidOrders.reduce((s, o) => s + o.charity_profit_pence, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-neutral-100">
            Orders &amp; Prodigi Fulfillment
          </h1>
          <p className="text-sm text-slate-500 dark:text-neutral-400">
            Track Stripe payments, Prodigi v4 print fulfillment, and net charity profit per order.
          </p>
        </div>
        <button
          type="button"
          onClick={loadOrders}
          className="px-4 py-2 rounded-lg bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-sm font-medium text-slate-700 dark:text-neutral-200 hover:bg-slate-50 dark:hover:bg-neutral-700 transition-colors"
        >
          Refresh Orders
        </button>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-neutral-400">
            Paid Orders
          </p>
          <p className="text-2xl font-bold text-slate-900 dark:text-neutral-100 mt-1">
            {paidOrders.length}
          </p>
        </div>
        <div className="p-5 rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-neutral-400">
            Gross Revenue (GBP)
          </p>
          <p className="text-2xl font-bold text-slate-900 dark:text-neutral-100 mt-1">
            {formatGbp(totalRevenuePence)}
          </p>
        </div>
        <div className="p-5 rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Total Net Profit for Charities
          </p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">
            {formatGbp(totalCharityProfitPence)}
          </p>
        </div>
      </div>

      {message && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-sm text-emerald-800 dark:text-emerald-300">
          {message}
        </div>
      )}

      <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl overflow-x-auto shadow-xs">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 dark:bg-neutral-800/70 text-xs uppercase text-slate-500 dark:text-neutral-400 border-b border-slate-200 dark:border-neutral-800">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer / UK Dest</th>
              <th className="px-4 py-3">Status &amp; Prodigi</th>
              <th className="px-4 py-3">Items &amp; Charity Split</th>
              <th className="px-4 py-3">Financials (Paid / Costs / Charity)</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Loading orders...
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No orders yet. Place a test order from the storefront using Stripe Sandbox!
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="align-top">
                  <td className="px-4 py-4">
                    <p className="font-mono font-bold text-slate-900 dark:text-neutral-100">
                      {order.order_number}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(order.createdAt).toLocaleString()}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-slate-800 dark:text-neutral-200">
                      {order.customer_name || 'Guest'}
                    </p>
                    <p className="text-xs text-slate-500">{order.customer_email || '—'}</p>
                    {order.shipping_address_json?.postal_code && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {order.shipping_address_json.city}, {order.shipping_address_json.postal_code}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-neutral-800 text-blue-700 dark:text-neutral-200 capitalize">
                      {order.status.replace(/_/g, ' ')}
                    </span>
                    {order.prodigi_order_id && (
                      <p className="text-xs font-mono text-slate-500 mt-1">
                        Prodigi: {order.prodigi_order_id} ({order.prodigi_stage || 'Submitted'})
                      </p>
                    )}
                    {order.tracking_url && (
                      <a
                        href={order.tracking_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 underline block mt-1"
                      >
                        Track Shipment &rarr;
                      </a>
                    )}
                    {order.fulfillment_error_message && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 max-w-xs">
                        {order.fulfillment_error_message}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4 space-y-1">
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
                      Mode: {order.charity_selection_mode === 'per_order' ? 'Whole Order' : 'Per Print'}
                    </span>
                    {(order.OrderItems || []).map((item) => (
                      <div key={item.id} className="text-xs text-slate-700 dark:text-neutral-300">
                        • {item.Design?.title || 'Print'} × {item.quantity} ({item.prodigi_sku_snapshot})
                        {item.Charity ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            {' '}
                            → {item.Charity.name} ({formatGbp(item.allocated_profit_pence)})
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-4 text-xs space-y-0.5">
                    <p className="text-slate-800 dark:text-neutral-200">
                      Paid: <strong>{formatGbp(order.total_paid_pence)}</strong>
                    </p>
                    <p className="text-slate-500">
                      Stripe Fee: {formatGbp(order.stripe_fee_pence)}
                    </p>
                    <p className="text-slate-500">
                      Prodigi Cost:{' '}
                      {order.prodigi_cost_pence > 0
                        ? formatGbp(order.prodigi_cost_pence)
                        : 'Est. fallback'}
                    </p>
                    <p className="text-emerald-600 dark:text-emerald-400 font-bold pt-0.5">
                      Charity Profit: {formatGbp(order.charity_profit_pence)}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-right space-y-2">
                    {!order.prodigi_order_id &&
                      order.status !== 'pending_payment' &&
                      order.status !== 'refunded' && (
                        <button
                          type="button"
                          disabled={busyOrderId === order.id}
                          onClick={() => handleRetryProdigi(order.id)}
                          className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50"
                        >
                          Submit to Prodigi
                        </button>
                      )}
                    {order.prodigi_order_id && (
                      <button
                        type="button"
                        disabled={busyOrderId === order.id}
                        onClick={() => handleSyncProdigi(order.id)}
                        className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-800 dark:text-neutral-200 text-xs font-medium disabled:opacity-50"
                      >
                        Sync Prodigi Cost
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default OrdersPage;
