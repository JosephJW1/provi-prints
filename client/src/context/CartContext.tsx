import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface StoreCharity {
  id: number;
  name: string;
  charity_reg_number?: string | null;
  logo_url?: string | null;
  description?: string | null;
  townId?: number | null;
  Town?: {
    id: number;
    townName: string;
  } | null;
}

export interface StoreProductVariant {
  id: number;
  description: string;
  price_pence: number;
  prodigi_sku?: string;
  estimated_cost_pence?: number;
  productId?: number;
}

export interface StoreProduct {
  id: number;
  name: string;
  description: string | null;
  ProductVariants: StoreProductVariant[];
}

export type CharitySelectionMode = 'per_item' | 'per_order';

export interface CartItem {
  key: string;
  designId: number;
  designTitle: string;
  designImageUrl: string;
  townName: string;
  productId: number;
  productName: string;
  variantId: number;
  variantDescription: string;
  pricePence: number;
  quantity: number;
  charityId: number | null;
}

interface StoredCartState {
  items: CartItem[];
  charityMode: CharitySelectionMode;
  orderCharityId: number | null;
}

interface CartContextValue {
  items: CartItem[];
  totalItemsCount: number;
  subtotalPence: number;
  charityMode: CharitySelectionMode;
  orderCharityId: number | null;
  isDrawerOpen: boolean;
  setCharityMode: (mode: CharitySelectionMode) => void;
  setOrderCharityId: (charityId: number | null) => void;
  addItem: (item: Omit<CartItem, 'key'>) => void;
  removeItem: (key: string) => void;
  updateQuantity: (key: string, quantity: number) => void;
  updateItemCharity: (key: string, charityId: number) => void;
  clearCart: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const STORAGE_KEY = 'provi-prints-cart-v1';

const CartContext = createContext<CartContextValue | undefined>(undefined);

function loadInitialCart(): StoredCartState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { items: [], charityMode: 'per_item', orderCharityId: null };
    }
    const parsed = JSON.parse(raw) as Partial<StoredCartState>;
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      charityMode: parsed.charityMode === 'per_order' ? 'per_order' : 'per_item',
      orderCharityId: typeof parsed.orderCharityId === 'number' ? parsed.orderCharityId : null,
    };
  } catch {
    return { items: [], charityMode: 'per_item', orderCharityId: null };
  }
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cartState, setCartState] = useState<StoredCartState>(loadInitialCart);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cartState));
    } catch {
      // Ignore storage quota errors
    }
  }, [cartState]);

  const addItem = useCallback((incoming: Omit<CartItem, 'key'>) => {
    const itemKey = `${incoming.designId}-${incoming.variantId}`;
    setCartState((prev) => {
      const existingIndex = prev.items.findIndex((i) => i.key === itemKey);
      let nextItems: CartItem[];
      if (existingIndex >= 0) {
        nextItems = prev.items.map((item, idx) =>
          idx === existingIndex
            ? {
                ...item,
                quantity: Math.min(25, item.quantity + incoming.quantity),
                charityId: incoming.charityId ?? item.charityId,
              }
            : item
        );
      } else {
        nextItems = [
          ...prev.items,
          {
            ...incoming,
            key: itemKey,
            quantity: Math.max(1, Math.min(25, incoming.quantity)),
          },
        ];
      }

      return {
        ...prev,
        orderCharityId: prev.orderCharityId ?? incoming.charityId ?? null,
        items: nextItems,
      };
    });
  }, []);

  const removeItem = useCallback((key: string) => {
    setCartState((prev) => ({
      ...prev,
      items: prev.items.filter((i) => i.key !== key),
    }));
  }, []);

  const updateQuantity = useCallback((key: string, quantity: number) => {
    if (quantity <= 0) {
      setCartState((prev) => ({
        ...prev,
        items: prev.items.filter((i) => i.key !== key),
      }));
      return;
    }
    const clamped = Math.min(25, Math.round(quantity));
    setCartState((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.key === key ? { ...i, quantity: clamped } : i)),
    }));
  }, []);

  const updateItemCharity = useCallback((key: string, charityId: number) => {
    setCartState((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.key === key ? { ...i, charityId } : i)),
    }));
  }, []);

  const setCharityMode = useCallback((mode: CharitySelectionMode) => {
    setCartState((prev) => ({ ...prev, charityMode: mode }));
  }, []);

  const setOrderCharityId = useCallback((charityId: number | null) => {
    setCartState((prev) => ({ ...prev, orderCharityId: charityId }));
  }, []);

  const clearCart = useCallback(() => {
    setCartState((prev) => ({ ...prev, items: [] }));
  }, []);

  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);

  const totalItemsCount = cartState.items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalPence = cartState.items.reduce(
    (sum, item) => sum + item.pricePence * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        items: cartState.items,
        totalItemsCount,
        subtotalPence,
        charityMode: cartState.charityMode,
        orderCharityId: cartState.orderCharityId,
        isDrawerOpen,
        setCharityMode,
        setOrderCharityId,
        addItem,
        removeItem,
        updateQuantity,
        updateItemCharity,
        clearCart,
        openDrawer,
        closeDrawer,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used inside a CartProvider');
  }
  return ctx;
}
