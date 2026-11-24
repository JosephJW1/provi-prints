import React, { useState, useEffect, useMemo } from 'react';
import ProtectedDesignPreview from './ProtectedDesignPreview';
import {
  useCart,
  type StoreCharity,
  type StoreProduct,
  type StoreProductVariant,
} from '../context/CartContext';
import type { Design } from '../pages/HomePage';

interface PrintPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  design: Design | null;
  allDesigns: Design[];
  products: StoreProduct[];
  charities: StoreCharity[];
  initialProductId?: number | null;
  preferredCharityName?: string | null;
  preferredTownName?: string | null;
}

const PrintPurchaseModal: React.FC<PrintPurchaseModalProps> = ({
  isOpen,
  onClose,
  design,
  allDesigns,
  products,
  charities,
  initialProductId = null,
  preferredCharityName = null,
  preferredTownName = null,
}) => {
  const { addItem, openDrawer } = useCart();

  const availableProducts = useMemo(
    () => products.filter((p) => Array.isArray(p.ProductVariants) && p.ProductVariants.length > 0),
    [products]
  );

  const [selectedDesignId, setSelectedDesignId] = useState<number | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [selectedCharityId, setSelectedCharityId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState<number>(1);

  const activeDesign = useMemo(() => {
    if (selectedDesignId) {
      return allDesigns.find((d) => d.id === selectedDesignId) || design;
    }
    return design || allDesigns[0] || null;
  }, [selectedDesignId, design, allDesigns]);

  const inferredTownName = useMemo(() => {
    if (preferredTownName) return preferredTownName;
    if (activeDesign?.Towns && activeDesign.Towns.length > 0) {
      return activeDesign.Towns[0].townName;
    }
    return 'UK Collection';
  }, [preferredTownName, activeDesign]);

  // Initialize selections when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const targetDesign = design || allDesigns[0] || null;
    setSelectedDesignId(targetDesign ? targetDesign.id : null);
    setQuantity(1);

    const defaultProd =
      (initialProductId && availableProducts.find((p) => p.id === initialProductId)) ||
      availableProducts[0] ||
      null;

    setSelectedProductId(defaultProd ? defaultProd.id : null);
    setSelectedVariantId(defaultProd?.ProductVariants?.[0]?.id ?? null);

    // Pre-select matching charity by preferred name or town
    const townLower = (
      preferredTownName ||
      targetDesign?.Towns?.[0]?.townName ||
      ''
    ).toLowerCase();

    const byName = preferredCharityName
      ? charities.find((c) => c.name.toLowerCase() === preferredCharityName.toLowerCase())
      : null;

    const byTown = townLower
      ? charities.find(
          (c) => c.Town?.townName?.toLowerCase() === townLower
        )
      : null;

    setSelectedCharityId((byName || byTown || charities[0])?.id ?? null);
  }, [
    isOpen,
    design,
    allDesigns,
    availableProducts,
    initialProductId,
    preferredCharityName,
    preferredTownName,
    charities,
  ]);

  const activeProduct = useMemo(
    () => availableProducts.find((p) => p.id === selectedProductId) || availableProducts[0] || null,
    [availableProducts, selectedProductId]
  );

  const activeVariant: StoreProductVariant | null = useMemo(() => {
    if (!activeProduct) return null;
    return (
      activeProduct.ProductVariants.find((v) => v.id === selectedVariantId) ||
      activeProduct.ProductVariants[0] ||
      null
    );
  }, [activeProduct, selectedVariantId]);

  const sortedCharities = useMemo(() => {
    const townLower = inferredTownName.toLowerCase();
    const local = charities.filter(
      (c) => c.Town?.townName?.toLowerCase() === townLower
    );
    const others = charities.filter(
      (c) => c.Town?.townName?.toLowerCase() !== townLower
    );
    return { local, others };
  }, [charities, inferredTownName]);

  if (!isOpen) return null;

  const handleProductChange = (prodId: number) => {
    setSelectedProductId(prodId);
    const nextProd = availableProducts.find((p) => p.id === prodId);
    setSelectedVariantId(nextProd?.ProductVariants?.[0]?.id ?? null);
  };

  const handleAddToBasket = () => {
    if (!activeDesign || !activeProduct || !activeVariant) return;
    addItem({
      designId: activeDesign.id,
      designTitle: activeDesign.title,
      designImageUrl: activeDesign.image_url,
      townName: inferredTownName,
      productId: activeProduct.id,
      productName: activeProduct.name,
      variantId: activeVariant.id,
      variantDescription: activeVariant.description,
      pricePence: activeVariant.price_pence,
      quantity,
      charityId: selectedCharityId,
    });
    onClose();
    openDrawer();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-[#141d2b] border border-gray-200 dark:border-slate-800 shadow-2xl overflow-hidden transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-800">
          <div>
            <span className="text-[10px] uppercase tracking-widest font-bold text-[#d4a338] dark:text-[#e9c46a]">
              Archival Print Studio • Free UK Delivery
            </span>
            <h3 className="text-xl font-serif font-bold text-gray-900 dark:text-[#fdfbf7]">
              Configure Your Print
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-5 gap-6">
          {/* Left Preview */}
          <div className="md:col-span-2 flex flex-col items-center">
            {activeDesign ? (
              <div className="w-full max-w-[210px] aspect-[3/4] rounded-xl overflow-hidden shadow-lg border border-[#e9c46a]/50 bg-gray-900">
                <ProtectedDesignPreview
                  previewUrl={activeDesign.image_url}
                  altText={activeDesign.title}
                  fallbackText={activeDesign.title}
                  className="w-full h-full"
                  imgClassName="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-full aspect-[3/4] rounded-xl border border-dashed border-gray-300 dark:border-slate-700 flex items-center justify-center text-xs text-gray-500 p-4 text-center">
                No artwork uploaded yet. Upload a design in Admin first.
              </div>
            )}

            {/* Optional Design Switcher if opened from generic Product card */}
            {!design && allDesigns.length > 1 && (
              <div className="w-full mt-3">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-1">
                  Artwork Design
                </label>
                <select
                  value={activeDesign?.id || ''}
                  onChange={(e) => setSelectedDesignId(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-[#1e293b] px-3 py-2 text-xs text-gray-800 dark:text-slate-100 focus:outline-none focus:border-[#e9c46a]"
                >
                  {allDesigns.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} {d.Towns?.[0]?.townName ? `(${d.Towns[0].townName})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {activeDesign && (
              <div className="mt-3 text-center">
                <p className="text-sm font-serif font-bold text-gray-900 dark:text-[#fdfbf7]">
                  {activeDesign.title}
                </p>
                <p className="text-xs text-gray-500 dark:text-slate-400">{inferredTownName}</p>
              </div>
            )}
          </div>

          {/* Right Configuration */}
          <div className="md:col-span-3 flex flex-col justify-between space-y-4">
            {availableProducts.length === 0 ? (
              <div className="rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 p-4 text-xs text-amber-800 dark:text-amber-200">
                No print formats or sizes are configured yet. Start the backend server or add a Product &amp; Variant in Provi Admin.
              </div>
            ) : (
              <>
                {/* 1. Format Selector */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-300 mb-2">
                    1. Print Format
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {availableProducts.map((prod) => {
                      const isSelected = activeProduct?.id === prod.id;
                      return (
                        <button
                          key={prod.id}
                          type="button"
                          onClick={() => handleProductChange(prod.id)}
                          className={`py-2 px-2.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                            isSelected
                              ? 'border-[#e9c46a] bg-[#e9c46a]/20 text-gray-900 dark:text-[#fdfbf7] shadow-xs'
                              : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-[#1e293b] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                          }`}
                        >
                          {prod.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Size / Variant Selector */}
                {activeProduct && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-300 mb-2">
                      2. Size &amp; Specification
                    </label>
                    <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                      {activeProduct.ProductVariants.map((variant) => {
                        const isSelected = activeVariant?.id === variant.id;
                        return (
                          <button
                            key={variant.id}
                            type="button"
                            onClick={() => setSelectedVariantId(variant.id)}
                            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-left text-xs transition-all cursor-pointer ${
                              isSelected
                                ? 'border-[#e9c46a] bg-[#e9c46a]/15 text-gray-900 dark:text-[#fdfbf7] font-semibold'
                                : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-[#1e293b]/70 text-gray-700 dark:text-slate-300 hover:border-gray-300'
                            }`}
                          >
                            <span>{variant.description}</span>
                            <span className="font-bold text-[#b88924] dark:text-[#e9c46a] ml-3 shrink-0">
                              £{(variant.price_pence / 100).toFixed(2)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. Charity Selector for this Print */}
                {charities.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-300 mb-1.5">
                      3. Charity Supported by This Print
                    </label>
                    <select
                      value={selectedCharityId ?? ''}
                      onChange={(e) => setSelectedCharityId(Number(e.target.value))}
                      className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-[#1e293b] px-3 py-2 text-xs font-medium text-gray-800 dark:text-slate-100 focus:outline-none focus:border-[#e9c46a]"
                    >
                      {sortedCharities.local.length > 0 && (
                        <optgroup label={`${inferredTownName} Local Charities`}>
                          {sortedCharities.local.map((c) => (
                            <option key={c.id} value={c.id}>
                              ♥ {c.name} {c.charity_reg_number ? `(${c.charity_reg_number})` : ''}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {sortedCharities.others.length > 0 && (
                        <optgroup
                          label={
                            sortedCharities.local.length > 0
                              ? 'Other UK Partner Charities'
                              : 'UK Partner Charities'
                          }
                        >
                          {sortedCharities.others.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} {c.Town?.townName ? `— ${c.Town.townName}` : ''}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
                      You can also switch between per-print charities or a single whole-order charity in your basket.
                    </p>
                  </div>
                )}

                {/* 4. Quantity + Add to Basket */}
                <div className="pt-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between gap-3">
                  <div className="flex items-center border border-gray-300 dark:border-slate-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-[#1e293b]">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="px-3 py-2 text-sm font-bold text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      −
                    </button>
                    <span className="px-3 py-2 text-xs font-bold text-gray-900 dark:text-white min-w-[2rem] text-center">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.min(25, q + 1))}
                      className="px-3 py-2 text-sm font-bold text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      +
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={!activeDesign || !activeVariant}
                    onClick={handleAddToBasket}
                    className="flex-1 py-2.5 px-5 rounded-lg bg-[#2c3e50] hover:bg-[#1f2d3a] dark:bg-[#e9c46a] dark:hover:bg-[#f4d58d] text-white dark:text-gray-900 font-bold text-xs uppercase tracking-wider shadow-md transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    Add to Basket • £
                    {activeVariant
                      ? ((activeVariant.price_pence * quantity) / 100).toFixed(2)
                      : '0.00'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintPurchaseModal;
