import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { useCart, type StoreCharity } from '../context/CartContext';

const CartDrawer: React.FC = () => {
  const {
    items,
    totalItemsCount,
    subtotalPence,
    charityMode,
    orderCharityId,
    isDrawerOpen,
    setCharityMode,
    setOrderCharityId,
    removeItem,
    updateQuantity,
    updateItemCharity,
    closeDrawer,
  } = useCart();

  const [charities, setCharities] = useState<StoreCharity[]>([]);
  const [isCheckingOut, setIsCheckingOut] = useState<boolean>(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!isDrawerOpen) return;
    setCheckoutError(null);
    api
      .get<StoreCharity[]>('/charities')
      .then((res) => {
        setCharities(res.data || []);
        if (!orderCharityId && res.data && res.data.length > 0) {
          setOrderCharityId(res.data[0].id);
        }
      })
      .catch((err) => {
        console.error('Failed to load charities for basket:', err);
      });
  }, [isDrawerOpen, orderCharityId, setOrderCharityId]);

  if (!isDrawerOpen) return null;

  const handleStripeCheckout = async () => {
    if (items.length === 0) return;
    setCheckoutError(null);
    setIsCheckingOut(true);

    try {
      const effectiveOrderCharityId =
        orderCharityId || items[0]?.charityId || charities[0]?.id || null;

      const payload = {
        charityMode,
        orderCharityId: charityMode === 'per_order' ? effectiveOrderCharityId : null,
        items: items.map((item) => ({
          designId: item.designId,
          variantId: item.variantId,
          quantity: item.quantity,
          charityId:
            charityMode === 'per_order'
              ? effectiveOrderCharityId
              : item.charityId || effectiveOrderCharityId,
        })),
      };

      const res = await api.post<{ url: string }>('/checkout/create-session', payload);
      if (res.data?.url) {
        window.location.href = res.data.url;
        return;
      }
      setCheckoutError('Checkout session created, but no redirect URL was returned.');
      setIsCheckingOut(false);
    } catch (err: any) {
      const msg =
        err.response?.data?.error ||
        'Unable to connect to Stripe Checkout. Please verify server configuration.';
      setCheckoutError(msg);
      setIsCheckingOut(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs"
      onClick={closeDrawer}
    >
      <aside
        className="w-full max-w-md h-full bg-[#fdfbf7] dark:bg-[#141d2b] border-l border-gray-200 dark:border-slate-800 shadow-2xl flex flex-col justify-between transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="px-6 py-4 bg-white dark:bg-[#1a2536] border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-serif font-bold text-gray-900 dark:text-[#fdfbf7]">
              Your Print Basket ({totalItemsCount})
            </h2>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Printed on-demand in the UK • Free UK Delivery
            </p>
          </div>
          <button
            type="button"
            onClick={closeDrawer}
            className="p-2 rounded-full text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close basket"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-16">
              <div className="w-14 h-14 rounded-full bg-[#e9c46a]/20 text-[#d4a338] dark:text-[#e9c46a] flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
                </svg>
              </div>
              <p className="font-serif font-bold text-lg text-gray-800 dark:text-slate-200">
                Your basket is empty
              </p>
              <p className="text-xs text-gray-500 dark:text-slate-400 max-w-xs mt-1">
                Explore a UK town on the map or select any vintage travel poster to support local charities.
              </p>
            </div>
          ) : (
            <>
              {/* Charity Mode Toggle: Per-Item vs Per-Order */}
              <div className="rounded-xl bg-white dark:bg-[#1e293b] border border-[#e9c46a]/50 p-4 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-800 dark:text-[#fdfbf7] flex items-center gap-1.5">
                    <span className="text-red-500">♥</span> Charity Profit Allocation
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-gray-100 dark:bg-slate-900/80 mb-3">
                  <button
                    type="button"
                    onClick={() => setCharityMode('per_item')}
                    className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      charityMode === 'per_item'
                        ? 'bg-white dark:bg-[#141d2b] text-gray-900 dark:text-[#e9c46a] shadow-xs'
                        : 'text-gray-600 dark:text-slate-400 hover:text-gray-900'
                    }`}
                  >
                    Charity per Print
                  </button>
                  <button
                    type="button"
                    onClick={() => setCharityMode('per_order')}
                    className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      charityMode === 'per_order'
                        ? 'bg-white dark:bg-[#141d2b] text-gray-900 dark:text-[#e9c46a] shadow-xs'
                        : 'text-gray-600 dark:text-slate-400 hover:text-gray-900'
                    }`}
                  >
                    One Charity for Order
                  </button>
                </div>

                {charityMode === 'per_order' ? (
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 dark:text-slate-300 mb-1">
                      All net profits from this order will support:
                    </label>
                    <select
                      value={orderCharityId ?? charities[0]?.id ?? ''}
                      onChange={(e) => setOrderCharityId(Number(e.target.value))}
                      className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-[#141d2b] px-3 py-2 text-xs font-medium text-gray-800 dark:text-slate-100 focus:outline-none focus:border-[#e9c46a]"
                    >
                      {charities.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.Town?.townName ? ` (${c.Town.townName})` : ''}
                          {c.charity_reg_number ? ` • Reg ${c.charity_reg_number}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-600 dark:text-slate-300 leading-relaxed">
                    Net profits are split proportionally across each print below so every town design can support its own local cause.
                  </p>
                )}
              </div>

              {/* Line Items */}
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.key}
                    className="rounded-xl bg-white dark:bg-[#1e293b]/90 border border-gray-200 dark:border-slate-800 p-3.5 shadow-xs space-y-2.5"
                  >
                    <div className="flex gap-3">
                      <img
                        src={item.designImageUrl}
                        alt={item.designTitle}
                        className="w-16 h-20 rounded-lg object-cover border border-gray-200 dark:border-slate-700 shrink-0 bg-gray-900"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-serif font-bold text-gray-900 dark:text-[#fdfbf7] truncate">
                              {item.designTitle}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-slate-300">
                              {item.productName} • {item.variantDescription}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItem(item.key)}
                            className="text-gray-400 hover:text-red-500 text-xs p-1 cursor-pointer"
                            aria-label="Remove item"
                          >
                            ✕
                          </button>
                        </div>

                        <div className="mt-2.5 flex items-center justify-between">
                          <div className="inline-flex items-center border border-gray-200 dark:border-slate-700 rounded-md bg-gray-50 dark:bg-slate-900/60">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.key, item.quantity - 1)}
                              className="px-2 py-0.5 text-xs font-bold text-gray-700 dark:text-slate-200 cursor-pointer"
                            >
                              −
                            </button>
                            <span className="px-2.5 py-0.5 text-xs font-semibold text-gray-900 dark:text-white">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.key, item.quantity + 1)}
                              className="px-2 py-0.5 text-xs font-bold text-gray-700 dark:text-slate-200 cursor-pointer"
                            >
                              +
                            </button>
                          </div>

                          <span className="text-sm font-bold text-gray-900 dark:text-[#e9c46a]">
                            £{((item.pricePence * item.quantity) / 100).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Per-Item Charity Selector */}
                    {charityMode === 'per_item' && charities.length > 0 && (
                      <div className="pt-2 border-t border-gray-100 dark:border-slate-800 flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 shrink-0">
                          Supports:
                        </span>
                        <select
                          value={item.charityId ?? charities[0]?.id ?? ''}
                          onChange={(e) => updateItemCharity(item.key, Number(e.target.value))}
                          className="flex-1 rounded-md border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-[#141d2b] px-2 py-1 text-xs text-gray-800 dark:text-slate-200 focus:outline-none focus:border-[#e9c46a]"
                        >
                          {charities.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} {c.Town?.townName ? `(${c.Town.townName})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Drawer Footer */}
        {items.length > 0 && (
          <div className="p-6 bg-white dark:bg-[#1a2536] border-t border-gray-200 dark:border-slate-800 space-y-3">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-gray-600 dark:text-slate-300">
                <span>UK Tracked Print Delivery</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">FREE</span>
              </div>
              <div className="flex justify-between text-base font-serif font-bold text-gray-900 dark:text-[#fdfbf7] pt-1">
                <span>Total (GBP)</span>
                <span>£{(subtotalPence / 100).toFixed(2)}</span>
              </div>
            </div>

            {/* Mandatory UK CPA Solicitation Disclosure */}
            <p className="text-[11px] text-gray-500 dark:text-slate-400 leading-snug bg-gray-50 dark:bg-slate-900/60 p-2.5 rounded-lg border border-gray-200/80 dark:border-slate-800">
              <strong>Charity Pledge:</strong> 100% of net profits from your order (gross price minus Prodigi UK archival printing/shipping and Stripe payment processing fees) are accrued and donated to your selected UK registered charities.
            </p>

            {checkoutError && (
              <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                {checkoutError}
              </div>
            )}

            <button
              type="button"
              disabled={isCheckingOut}
              onClick={handleStripeCheckout}
              className="w-full py-3 px-4 rounded-xl bg-[#2c3e50] hover:bg-[#1f2d3a] dark:bg-[#e9c46a] dark:hover:bg-[#f4d58d] text-white dark:text-gray-900 font-bold text-xs uppercase tracking-widest shadow-lg transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {isCheckingOut ? (
                <span>Redirecting to Stripe Pay...</span>
              ) : (
                <>
                  <span>Checkout with Stripe Pay</span>
                  <span>&rarr;</span>
                </>
              )}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
};

export default CartDrawer;
