import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import { DataTable, type Column } from '../components/DataTable';

interface ProductVariant {
  id: number;
  description: string;
  price_pence: number;
  prodigi_sku: string;
  estimated_cost_pence: number;
}

const ProductEditPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // Product State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  // Variants State
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [showVariantModal, setShowVariantModal] = useState(false);
  const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(null);

  // Variant Form State
  const [variantDesc, setVariantDesc] = useState('');
  const [variantPrice, setVariantPrice] = useState<number | ''>('');
  const [variantSku, setVariantSku] = useState('GLOBAL-PAP-A4');
  const [variantEstCost, setVariantEstCost] = useState<number | ''>(0);

  const fetchProductData = async () => {
    if (!id) return;
    try {
      const res = await api.get('/products');
      const product = res.data.find((p: any) => p.id.toString() === id);
      if (product) {
        setName(product.name);
        setDescription(product.description || '');
        setVariants(product.ProductVariants || []);
      }
    } catch (err) {
      console.error('Failed to fetch product', err);
    }
  };

  useEffect(() => {
    fetchProductData();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      if (id) {
        await api.put(`/products/${id}`, { name, description });
      } else {
        await api.post('/products', { name, description });
      }
      navigate('/products');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save product');
    }
  };

  const openVariantModal = (variant?: ProductVariant) => {
    if (variant) {
      setEditingVariant(variant);
      setVariantDesc(variant.description);
      setVariantPrice(variant.price_pence);
      setVariantSku(variant.prodigi_sku || 'GLOBAL-PAP-A4');
      setVariantEstCost(variant.estimated_cost_pence ?? 0);
    } else {
      setEditingVariant(null);
      setVariantDesc('');
      setVariantPrice('');
      setVariantSku('GLOBAL-PAP-A4');
      setVariantEstCost(950);
    }
    setShowVariantModal(true);
  };

  const handleSaveVariant = async () => {
    if (!variantDesc || variantPrice === '' || !variantSku.trim()) {
      return alert('Please fill out description, retail price, and Prodigi SKU.');
    }

    const payload = {
      description: variantDesc,
      price_pence: Number(variantPrice),
      prodigi_sku: variantSku.trim(),
      estimated_cost_pence: variantEstCost === '' ? 0 : Number(variantEstCost),
    };

    try {
      if (editingVariant) {
        await api.put(`/variants/${editingVariant.id}`, payload);
      } else {
        await api.post('/variants/bulk', {
          ProductId: id,
          variants: [payload],
        });
      }
      setShowVariantModal(false);
      fetchProductData();
    } catch (error) {
      console.error('Error saving variant:', error);
      alert('Failed to save variant.');
    }
  };

  const handleDeleteVariant = async (variant: any) => {
    if (window.confirm('Are you sure you want to delete this variant?')) {
      try {
        await api.delete(`/variants/${variant.id}`);
        fetchProductData();
      } catch {
        alert('Failed to delete variant.');
      }
    }
  };

  const tableData = variants.map((v) => ({
    ...v,
    formatted_price: `£${(v.price_pence / 100).toFixed(2)}`,
    formatted_cost: `£${((v.estimated_cost_pence || 0) / 100).toFixed(2)}`,
  }));

  const variantColumns: Column<any>[] = [
    { key: 'id', label: 'ID' },
    { key: 'description', label: 'Description' },
    { key: 'prodigi_sku', label: 'Prodigi SKU' },
    { key: 'formatted_price', label: 'Retail Price' },
    { key: 'formatted_cost', label: 'Est. Prodigi Cost' },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <div className="mb-6 flex items-center gap-4">
          <button
            onClick={() => navigate('/products')}
            className="text-slate-500 hover:text-slate-800 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
          >
            &larr; Back
          </button>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-neutral-100">
            {id ? 'Edit Product' : 'Add New Product'}
          </h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm border border-slate-200 dark:border-neutral-800 space-y-5 transition-colors"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
              Product Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100 placeholder-slate-400 dark:placeholder-neutral-500 border border-slate-300 dark:border-neutral-700 rounded focus:ring-2 focus:ring-blue-500 dark:focus:ring-neutral-500 outline-none transition-colors"
              placeholder="e.g., Framed Art Print"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-2 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100 placeholder-slate-400 dark:placeholder-neutral-500 border border-slate-300 dark:border-neutral-700 rounded focus:ring-2 focus:ring-blue-500 dark:focus:ring-neutral-500 outline-none h-32 transition-colors"
              placeholder="Base description of the physical product..."
            />
          </div>

          {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}

          <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-neutral-800">
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 dark:bg-neutral-200 dark:hover:bg-white text-white dark:text-neutral-900 px-6 py-2 rounded font-medium transition-colors"
            >
              {id ? 'Save Changes' : 'Create Product'}
            </button>
          </div>
        </form>
      </div>

      {id && (
        <DataTable
          title="Product Variants & Prodigi SKUs"
          data={tableData}
          columns={variantColumns}
          onAdd={() => openVariantModal()}
          onEdit={(variant) => openVariantModal(variant as ProductVariant)}
          onDelete={handleDeleteVariant}
          addLabel="New Variant"
        />
      )}

      {showVariantModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 p-6 rounded-lg shadow-xl w-full max-w-md transition-colors">
            <h2 className="text-xl font-bold text-slate-800 dark:text-neutral-100 mb-4">
              {editingVariant ? 'Edit Variant' : 'Add Variant'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                  Size / Specification Description *
                </label>
                <input
                  type="text"
                  value={variantDesc}
                  onChange={(e) => setVariantDesc(e.target.value)}
                  placeholder="e.g., A4 Enhanced Matte Art Poster"
                  className="w-full p-2 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100 border border-slate-300 dark:border-neutral-700 rounded outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                  Prodigi v4 SKU *
                </label>
                <input
                  type="text"
                  value={variantSku}
                  onChange={(e) => setVariantSku(e.target.value)}
                  placeholder="e.g., GLOBAL-PAP-A4"
                  className="w-full p-2 font-mono text-sm bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100 border border-slate-300 dark:border-neutral-700 rounded outline-none"
                />
                <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">
                  Examples: <code>GLOBAL-PAP-A4</code> (Poster), <code>GLOBAL-CFPM-A4-BK</code> (Framed), <code>GLOBAL-FAP-A6</code> (Postcard)
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                    Retail Price (pence) *
                  </label>
                  <input
                    type="number"
                    value={variantPrice}
                    onChange={(e) => setVariantPrice(e.target.value ? Number(e.target.value) : '')}
                    placeholder="e.g., 1999"
                    className="w-full p-2 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100 border border-slate-300 dark:border-neutral-700 rounded outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                    Est. Prodigi Cost (pence)
                  </label>
                  <input
                    type="number"
                    value={variantEstCost}
                    onChange={(e) => setVariantEstCost(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g., 950"
                    className="w-full p-2 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100 border border-slate-300 dark:border-neutral-700 rounded outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100 dark:border-neutral-800">
              <button
                onClick={() => setShowVariantModal(false)}
                className="px-4 py-2 text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveVariant}
                className="bg-blue-600 hover:bg-blue-700 dark:bg-neutral-200 dark:hover:bg-white text-white dark:text-neutral-900 px-4 py-2 rounded font-medium transition-colors"
              >
                Save Variant
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductEditPage;
