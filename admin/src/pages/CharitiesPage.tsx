import React, { useEffect, useState } from 'react';
import api from '../api/axios';

interface AdminCharity {
  id: number;
  name: string;
  charity_reg_number: string | null;
  logo_url: string | null;
  description: string | null;
  townId: number | null;
  payout_provider: 'manual_batch' | 'work_for_good' | 'wise' | 'goodstack';
  external_payout_id: string | null;
  bank_sort_code: string | null;
  bank_account_number: string | null;
  is_active: boolean;
  Town?: { id: number; townName: string } | null;
  balances: {
    estimatedPence: number;
    accruedPence: number;
    unpaidTotalPence: number;
    paidPence: number;
  };
}

interface TownOption {
  id: number;
  townName: string;
}

const formatGbp = (pence: number) => `£${((pence || 0) / 100).toFixed(2)}`;

const CharitiesPage: React.FC = () => {
  const [charities, setCharities] = useState<AdminCharity[]>([]);
  const [towns, setTowns] = useState<TownOption[]>([]);
  const [includeEstimated, setIncludeEstimated] = useState<boolean>(true);
  const [isProcessingBatch, setIsProcessingBatch] = useState<boolean>(false);
  const [batchBanner, setBatchBanner] = useState<string | null>(null);

  // Modal state for creating/editing a charity
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editing, setEditing] = useState<AdminCharity | null>(null);
  const [formName, setFormName] = useState('');
  const [formReg, setFormReg] = useState('');
  const [formTownId, setFormTownId] = useState<string>('');
  const [formDesc, setFormDesc] = useState('');
  const [formLogo, setFormLogo] = useState('');
  const [formProvider, setFormProvider] = useState<AdminCharity['payout_provider']>('manual_batch');
  const [formExternalId, setFormExternalId] = useState('');
  const [formSortCode, setFormSortCode] = useState('');
  const [formAccountNum, setFormAccountNum] = useState('');

  const loadData = async () => {
    try {
      const [charitiesRes, townsRes] = await Promise.all([
        api.get<AdminCharity[]>('/charities/admin'),
        api.get<TownOption[]>('/towns'),
      ]);
      setCharities(charitiesRes.data || []);
      setTowns(townsRes.data || []);
    } catch (err) {
      console.error('Failed to load charities data:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const downloadCsvFile = (filename: string, csvText: string) => {
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePayoutBatch = async (markPaid: boolean) => {
    if (
      markPaid &&
      !window.confirm(
        'Mark all included unpaid charity ledger entries as PAID and download the settlement CSV?'
      )
    ) {
      return;
    }

    setIsProcessingBatch(true);
    setBatchBanner(null);
    try {
      const res = await api.post('/charities/payouts/settle', {
        includeEstimated,
        markPaid,
      });

      const { batchId, csv, totalDisbursedPence, charityCount } = res.data;
      downloadCsvFile(`${batchId}-charity-payouts.csv`, csv);

      setBatchBanner(
        `${markPaid ? 'Settled' : 'Exported preview'} batch ${batchId} across ${charityCount} charities (${formatGbp(totalDisbursedPence)}).`
      );
      if (markPaid) {
        await loadData();
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to generate payout batch.');
    } finally {
      setIsProcessingBatch(false);
    }
  };

  const openEditModal = (charity?: AdminCharity) => {
    if (charity) {
      setEditing(charity);
      setFormName(charity.name);
      setFormReg(charity.charity_reg_number || '');
      setFormTownId(charity.townId ? String(charity.townId) : '');
      setFormDesc(charity.description || '');
      setFormLogo(charity.logo_url || '');
      setFormProvider(charity.payout_provider || 'manual_batch');
      setFormExternalId(charity.external_payout_id || '');
      setFormSortCode(charity.bank_sort_code || '');
      setFormAccountNum(charity.bank_account_number || '');
    } else {
      setEditing(null);
      setFormName('');
      setFormReg('');
      setFormTownId(towns[0]?.id ? String(towns[0].id) : '');
      setFormDesc('');
      setFormLogo('');
      setFormProvider('manual_batch');
      setFormExternalId('');
      setFormSortCode('');
      setFormAccountNum('');
    }
    setShowModal(true);
  };

  const handleSaveCharity = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: formName,
      charity_reg_number: formReg || null,
      townId: formTownId ? Number(formTownId) : null,
      description: formDesc || null,
      logo_url: formLogo || null,
      payout_provider: formProvider,
      external_payout_id: formExternalId || null,
      bank_sort_code: formSortCode || null,
      bank_account_number: formAccountNum || null,
    };

    try {
      if (editing) {
        await api.put(`/charities/${editing.id}`, payload);
      } else {
        await api.post('/charities', payload);
      }
      setShowModal(false);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save charity.');
    }
  };

  const totalUnpaidPence = charities.reduce((s, c) => s + c.balances.unpaidTotalPence, 0);
  const totalPaidPence = charities.reduce((s, c) => s + c.balances.paidPence, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-neutral-100">
            Charities &amp; Automated Profit Payouts
          </h1>
          <p className="text-sm text-slate-500 dark:text-neutral-400">
            Manage UK/Scottish partner charities, monitor accrued profit per cause, and export Wise / Work for Good / Goodstack payout batches.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openEditModal()}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
        >
          + Add Charity
        </button>
      </div>

      {/* Payout Controls Card */}
      <div className="p-5 rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-neutral-400">
            Unpaid Charity Pool: <strong className="text-emerald-600 dark:text-emerald-400">{formatGbp(totalUnpaidPence)}</strong> • Disbursed to Date: <strong>{formatGbp(totalPaidPence)}</strong>
          </p>
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-neutral-300 mt-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeEstimated}
              onChange={(e) => setIncludeEstimated(e.target.checked)}
            />
            <span>Include &lsquo;estimated&rsquo; entries (orders not yet marked Shipped by Prodigi)</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={isProcessingBatch}
            onClick={() => handlePayoutBatch(false)}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-neutral-700 text-slate-700 dark:text-neutral-200 hover:bg-slate-50 dark:hover:bg-neutral-800 text-xs font-semibold"
          >
            Preview Payout CSV
          </button>
          <button
            type="button"
            disabled={isProcessingBatch}
            onClick={() => handlePayoutBatch(true)}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
          >
            Execute Batch &amp; Mark Paid
          </button>
        </div>
      </div>

      {batchBanner && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-sm text-emerald-800 dark:text-emerald-300">
          {batchBanner}
        </div>
      )}

      {/* Charities Ledger Table */}
      <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl overflow-x-auto shadow-xs">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 dark:bg-neutral-800/70 text-xs uppercase text-slate-500 dark:text-neutral-400 border-b border-slate-200 dark:border-neutral-800">
            <tr>
              <th className="px-4 py-3">Charity</th>
              <th className="px-4 py-3">Town</th>
              <th className="px-4 py-3">Reg Number</th>
              <th className="px-4 py-3">Payout Method</th>
              <th className="px-4 py-3">Estimated</th>
              <th className="px-4 py-3">Accrued (Confirmed)</th>
              <th className="px-4 py-3">Total Paid</th>
              <th className="px-4 py-3 text-right">Edit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
            {charities.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-neutral-100">
                  {c.name}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-neutral-300">
                  {c.Town?.townName || 'UK-Wide'}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                  {c.charity_reg_number || '—'}
                </td>
                <td className="px-4 py-3 text-xs capitalize text-slate-600 dark:text-neutral-300">
                  {c.payout_provider.replace(/_/g, ' ')}
                </td>
                <td className="px-4 py-3 text-amber-600 dark:text-amber-400 font-medium">
                  {formatGbp(c.balances.estimatedPence)}
                </td>
                <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 font-bold">
                  {formatGbp(c.balances.accruedPence)}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-neutral-300">
                  {formatGbp(c.balances.paidPence)}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => openEditModal(c)}
                    className="text-blue-600 dark:text-blue-400 hover:underline text-xs font-medium"
                  >
                    Configure
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Charity Configuration Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveCharity}
            className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl p-6 w-full max-w-lg space-y-4 shadow-xl"
          >
            <h2 className="text-lg font-bold text-slate-900 dark:text-neutral-100">
              {editing ? `Configure ${editing.name}` : 'Add Partner Charity'}
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-neutral-300 mb-1">
                  Charity Name *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full p-2 text-sm rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-neutral-300 mb-1">
                  UK / OSCR Reg Number
                </label>
                <input
                  type="text"
                  value={formReg}
                  onChange={(e) => setFormReg(e.target.value)}
                  placeholder="e.g., 1078337 or SC020862"
                  className="w-full p-2 text-sm rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-neutral-300 mb-1">
                  Associated Town
                </label>
                <select
                  value={formTownId}
                  onChange={(e) => setFormTownId(e.target.value)}
                  className="w-full p-2 text-sm rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100"
                >
                  <option value="">UK-Wide</option>
                  {towns.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.townName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-neutral-300 mb-1">
                  Payout Channel
                </label>
                <select
                  value={formProvider}
                  onChange={(e) => setFormProvider(e.target.value as AdminCharity['payout_provider'])}
                  className="w-full p-2 text-sm rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100"
                >
                  <option value="manual_batch">CSV Batch / Bank Transfer</option>
                  <option value="work_for_good">Work for Good (UK CPA)</option>
                  <option value="wise">Wise Business Batch</option>
                  <option value="goodstack">Goodstack API</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-neutral-300 mb-1">
                  UK Sort Code
                </label>
                <input
                  type="text"
                  value={formSortCode}
                  onChange={(e) => setFormSortCode(e.target.value)}
                  placeholder="00-00-00"
                  className="w-full p-2 text-sm rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-neutral-300 mb-1">
                  Account Number
                </label>
                <input
                  type="text"
                  value={formAccountNum}
                  onChange={(e) => setFormAccountNum(e.target.value)}
                  placeholder="12345678"
                  className="w-full p-2 text-sm rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-neutral-300 mb-1">
                  External API ID
                </label>
                <input
                  type="text"
                  value={formExternalId}
                  onChange={(e) => setFormExternalId(e.target.value)}
                  placeholder="Goodstack ID"
                  className="w-full p-2 text-sm rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-neutral-300 mb-1">
                Logo URL
              </label>
              <input
                type="text"
                value={formLogo}
                onChange={(e) => setFormLogo(e.target.value)}
                className="w-full p-2 text-sm rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-neutral-300 mb-1">
                Mission Description
              </label>
              <textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                rows={2}
                className="w-full p-2 text-sm rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-slate-600 dark:text-neutral-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
              >
                Save Charity
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default CharitiesPage;
