import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { useCart } from '../context/CartContext';

interface OrderItemSummary {
  id: number;
  quantity: number;
  unitPricePence: number;
  lineTotalPence: number;
  allocatedProfitPence: number;
  designTitle: string;
  designImageUrl: string;
  variantDescription: string;
  productName: string;
  charity: {
    id: number;
    name: string;
    charityRegNumber: string | null;
    logoUrl: string | null;
  } | null;
}

interface OrderConfirmationResponse {
  orderNumber: string;
  status: string;
  prodigiStage: string | null;
  customerName: string | null;
  charitySelectionMode: 'per_item' | 'per_order';
  subtotalPence: number;
  shippingPence: number;
  totalPaidPence: number;
  charityProfitPence: number;
  trackingUrl: string | null;
  items: OrderItemSummary[];
}

const OrderSuccessPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const { clearCart } = useCart();

  const [order, setOrder] = useState<OrderConfirmationResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError('Missing checkout session reference.');
      setLoading(false);
      return;
    }

    let isMounted = true;
    api
      .get<OrderConfirmationResponse>(`/checkout/session/${encodeURIComponent(sessionId)}`)
      .then((res) => {
        if (!isMounted) return;
        setOrder(res.data);
        clearCart();
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.response?.data?.error || 'Could not load order confirmation details.');
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [sessionId, clearCart]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-14">
      <div className="rounded-3xl bg-white dark:bg-[#141d2b] border border-gray-200 dark:border-slate-800 shadow-xl p-8 md:p-10 transition-colors">
        {loading ? (
          <div className="py-12 flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-full border-4 border-[#e9c46a]/30 border-t-[#e9c46a] animate-spin mb-4" />
            <h2 className="text-xl font-serif font-bold text-gray-900 dark:text-[#fdfbf7]">
              Confirming Your Order &amp; Submitting to Print Studio...
            </h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              Verifying payment with Stripe and preparing your 300 DPI archival master files.
            </p>
          </div>
        ) : error || !order ? (
          <div className="py-10 text-center space-y-4">
            <h2 className="text-2xl font-serif font-bold text-gray-900 dark:text-[#fdfbf7]">
              Order Lookup Notice
            </h2>
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <Link
              to="/"
              className="inline-block px-6 py-2.5 rounded-lg bg-[#2c3e50] dark:bg-[#e9c46a] text-white dark:text-gray-900 font-bold text-xs uppercase tracking-wider"
            >
              Return to Gallery
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="text-center border-b border-gray-100 dark:border-slate-800 pb-6">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold uppercase tracking-wider mb-3">
                ✓ Payment Confirmed
              </span>
              <h2 className="text-3xl font-serif font-bold text-gray-900 dark:text-[#fdfbf7]">
                Thank You{order.customerName ? `, ${order.customerName}` : ''}!
              </h2>
              <p className="text-sm text-gray-600 dark:text-slate-300 mt-2">
                Order Reference:{' '}
                <span className="font-mono font-bold text-gray-900 dark:text-[#e9c46a]">
                  {order.orderNumber}
                </span>
              </p>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                Status:{' '}
                <span className="font-semibold capitalize">
                  {order.status.replace(/_/g, ' ')}
                </span>
                {order.prodigiStage ? ` • Print Studio Stage: ${order.prodigiStage}` : ''}
              </p>
            </div>

            {/* Charity Impact Highlight */}
            <div className="rounded-2xl bg-[#fdfbf7] dark:bg-[#1e293b] border border-[#e9c46a]/60 p-5">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <h3 className="text-sm font-serif font-bold text-gray-900 dark:text-[#fdfbf7] flex items-center gap-2">
                  <span className="text-red-500">♥</span> Your Local Charity Impact
                </h3>
                {order.charityProfitPence > 0 && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#e9c46a]/25 text-gray-900 dark:text-[#e9c46a]">
                    Est. £{(order.charityProfitPence / 100).toFixed(2)} Accrued for Charity
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
                Your order net profit has been logged in our Charity Ledger and will be disbursed once Prodigi confirms final shipping.
              </p>
            </div>

            {/* Ordered Prints */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                Prints in Production
              </h3>
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-gray-50 dark:bg-[#1e293b]/60 border border-gray-200 dark:border-slate-800"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {item.designImageUrl && (
                      <img
                        src={item.designImageUrl}
                        alt={item.designTitle}
                        className="w-14 h-18 rounded-lg object-cover border border-gray-200 dark:border-slate-700 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-serif font-bold text-gray-900 dark:text-[#fdfbf7] truncate">
                        {item.designTitle} × {item.quantity}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-slate-300">
                        {item.productName} — {item.variantDescription}
                      </p>
                      {item.charity && (
                        <p className="text-[11px] text-[#b88924] dark:text-[#e9c46a] font-medium mt-0.5">
                          ♥ Supporting {item.charity.name}
                          {item.allocatedProfitPence > 0
                            ? ` (£${(item.allocatedProfitPence / 100).toFixed(2)})`
                            : ''}
                        </p>
                      )}
                    </div>
                  </div>

                  <span className="text-sm font-bold text-gray-900 dark:text-white shrink-0">
                    £{(item.lineTotalPence / 100).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 dark:text-slate-400">Total Paid</p>
                <p className="text-xl font-serif font-bold text-gray-900 dark:text-[#fdfbf7]">
                  £{(order.totalPaidPence / 100).toFixed(2)}
                </p>
              </div>
              <Link
                to="/"
                className="px-6 py-2.5 rounded-xl bg-[#2c3e50] hover:bg-[#1f2d3a] dark:bg-[#e9c46a] dark:hover:bg-[#f4d58d] text-white dark:text-gray-900 font-bold text-xs uppercase tracking-wider transition-colors"
              >
                Continue Exploring UK Towns
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderSuccessPage;
