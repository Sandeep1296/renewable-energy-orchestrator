import React, { useState } from 'react';
import {
  Settings,
  Sun,
  Wind,
  BatteryCharging,
  Factory,
  ArrowRightLeft,
  CheckCircle2,
  X,
  RotateCcw,
  Plus,
  Trash2,
  Edit2,
  Save,
  AlertTriangle,
  Info,
} from 'lucide-react';
import {
  PortfolioState,
  SolarAsset,
  WindAsset,
  BatteryAsset,
  IndustrialConsumer,
  GridIntertie,
  AssetStatus,
  BatteryStatus,
  ConsumerStatus,
} from '../types/orchestrator';
import { initialPortfolio } from '../data/initialPortfolio';

interface PortfolioManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolio: PortfolioState;
  onUpdatePortfolio: (updated: PortfolioState) => void;
}

type CategoryType = 'bess' | 'solar' | 'wind' | 'industrial' | 'grid';

export const PortfolioManagementModal: React.FC<PortfolioManagementModalProps> = ({
  isOpen,
  onClose,
  portfolio,
  onUpdatePortfolio,
}) => {
  const [activeCategory, setActiveCategory] = useState<CategoryType>('bess');
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [addForm, setAddForm] = useState<any>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  if (!isOpen) return null;

  // Helper to sync aggregate portfolio grid metrics
  const syncGridState = (state: PortfolioState): PortfolioState => {
    const totalDemand = state.consumers.reduce(
      (sum, c) => sum + (c.status !== 'offline' ? c.totalDemandMw : 0),
      0,
    );
    const totalSolar = state.solarFarms.reduce(
      (sum, s) => sum + (s.status === 'online' ? s.currentOutputMw : s.status === 'degraded' ? s.currentOutputMw * 0.5 : 0),
      0,
    );
    const totalWind = state.windFarms.reduce(
      (sum, w) => sum + (w.status === 'online' ? w.currentOutputMw : w.status === 'degraded' ? w.currentOutputMw * 0.5 : 0),
      0,
    );
    return {
      ...state,
      grid: {
        ...state.grid,
        totalDemandMw: Math.round(totalDemand * 10) / 10,
        totalRenewableMw: Math.round((totalSolar + totalWind) * 10) / 10,
      },
    };
  };

  // --- DELETE HANDLER ---
  const handleDeleteAsset = (id: string, category: CategoryType) => {
    let updated = { ...portfolio };
    if (category === 'solar') {
      updated.solarFarms = portfolio.solarFarms.filter((a) => a.id !== id);
    } else if (category === 'wind') {
      updated.windFarms = portfolio.windFarms.filter((a) => a.id !== id);
    } else if (category === 'bess') {
      updated.batteries = portfolio.batteries.filter((a) => a.id !== id);
    } else if (category === 'industrial') {
      updated.consumers = portfolio.consumers.filter((a) => a.id !== id);
    } else if (category === 'grid') {
      updated.interties = portfolio.interties.filter((a) => a.id !== id);
    }
    setDeleteConfirmId(null);
    if (editingAssetId === id) setEditingAssetId(null);
    onUpdatePortfolio(syncGridState(updated));
  };

  // --- EDIT HANDLERS ---
  const handleStartEdit = (asset: any) => {
    setEditingAssetId(asset.id);
    setEditForm({ ...asset });
    setIsAddingNew(false);
  };

  const handleSaveEdit = (category: CategoryType) => {
    let updated = { ...portfolio };
    if (category === 'solar') {
      updated.solarFarms = portfolio.solarFarms.map((s) => (s.id === editingAssetId ? { ...s, ...editForm } : s));
    } else if (category === 'wind') {
      updated.windFarms = portfolio.windFarms.map((w) => (w.id === editingAssetId ? { ...w, ...editForm } : w));
    } else if (category === 'bess') {
      updated.batteries = portfolio.batteries.map((b) => (b.id === editingAssetId ? { ...b, ...editForm } : b));
    } else if (category === 'industrial') {
      const baseload = Number(editForm.baseloadDemandMw) || 0;
      const flex = Number(editForm.flexibleDemandMw) || 0;
      const total = baseload + flex;
      updated.consumers = portfolio.consumers.map((c) =>
        c.id === editingAssetId ? { ...c, ...editForm, totalDemandMw: total, baseloadDemandMw: baseload, flexibleDemandMw: flex } : c,
      );
    } else if (category === 'grid') {
      updated.interties = portfolio.interties.map((i) => (i.id === editingAssetId ? { ...i, ...editForm } : i));
    }
    setEditingAssetId(null);
    setEditForm({});
    onUpdatePortfolio(syncGridState(updated));
  };

  // --- ADD HANDLERS ---
  const handleStartAdd = (category: CategoryType) => {
    setIsAddingNew(true);
    setEditingAssetId(null);
    if (category === 'solar') {
      const nextNum = portfolio.solarFarms.length + 1;
      setAddForm({
        id: `SOL-${String(nextNum).padStart(2, '0')}`,
        name: `Solar Array ${nextNum}`,
        capacityMw: 40,
        currentOutputMw: 32,
        forecast15minMw: 34,
        forecast1hrMw: 36,
        status: 'online' as AssetStatus,
        tiltAngle: 25,
        degradationPct: 1.2,
        curtailedMw: 0,
      });
    } else if (category === 'wind') {
      const nextNum = portfolio.windFarms.length + 1;
      setAddForm({
        id: `WND-${String(nextNum).padStart(2, '0')}`,
        name: `Wind Farm ${nextNum}`,
        capacityMw: 60,
        currentOutputMw: 45,
        forecast15minMw: 48,
        forecast1hrMw: 50,
        status: 'online' as AssetStatus,
        windSpeedMs: 10.5,
        gustWarning: false,
        curtailedMw: 0,
      });
    } else if (category === 'bess') {
      const nextNum = portfolio.batteries.length + 1;
      setAddForm({
        id: `BESS-${String(nextNum).padStart(2, '0')}`,
        name: `BESS-${String(nextNum).padStart(2, '0')} Storage Facility`,
        chemistry: 'LFP' as const,
        capacityMwh: 160,
        powerRatingMw: 40,
        currentSocPct: 60,
        minSocPct: 12,
        maxSocPct: 95,
        efficiency: 0.92,
        targetPowerMw: 0,
        status: 'idle' as BatteryStatus,
        degradationRate: 0.00015,
        cycleCount: 120,
        tempC: 28,
      });
    } else if (category === 'industrial') {
      const nextNum = portfolio.consumers.length + 1;
      setAddForm({
        id: `IND-${String(nextNum).padStart(2, '0')}`,
        name: `Industrial Consumer ${nextNum}`,
        baseloadDemandMw: 30,
        flexibleDemandMw: 10,
        totalDemandMw: 40,
        curtailedMw: 0,
        status: 'normal' as ConsumerStatus,
        drIncentiveRate: 85,
      });
    } else if (category === 'grid') {
      const nextNum = portfolio.interties.length + 1;
      setAddForm({
        id: `TIE-${String(nextNum).padStart(2, '0')}`,
        name: `Intertie Corridor ${nextNum}`,
        capacityMw: 150,
        currentFlowMw: 25,
        limitMw: 140,
        congested: false,
      });
    }
  };

  const handleSaveAdd = (category: CategoryType) => {
    let updated = { ...portfolio };
    if (category === 'solar') {
      updated.solarFarms = [...portfolio.solarFarms, addForm as SolarAsset];
    } else if (category === 'wind') {
      updated.windFarms = [...portfolio.windFarms, addForm as WindAsset];
    } else if (category === 'bess') {
      updated.batteries = [...portfolio.batteries, addForm as BatteryAsset];
    } else if (category === 'industrial') {
      const baseload = Number(addForm.baseloadDemandMw) || 0;
      const flex = Number(addForm.flexibleDemandMw) || 0;
      const total = baseload + flex;
      updated.consumers = [...portfolio.consumers, { ...addForm, totalDemandMw: total, baseloadDemandMw: baseload, flexibleDemandMw: flex } as IndustrialConsumer];
    } else if (category === 'grid') {
      updated.interties = [...portfolio.interties, addForm as GridIntertie];
    }
    setIsAddingNew(false);
    setAddForm({});
    onUpdatePortfolio(syncGridState(updated));
  };

  // Quick toggle status helper
  const handleToggleStatus = (id: string, category: CategoryType) => {
    let updated = { ...portfolio };
    if (category === 'solar') {
      updated.solarFarms = portfolio.solarFarms.map((s) => {
        if (s.id !== id) return s;
        const next = s.status === 'online' ? 'degraded' : s.status === 'degraded' ? 'curtailed' : s.status === 'curtailed' ? 'offline' : 'online';
        const mult = next === 'online' ? 0.8 : next === 'degraded' ? 0.4 : 0;
        return { ...s, status: next as AssetStatus, currentOutputMw: s.capacityMw * mult };
      });
    } else if (category === 'wind') {
      updated.windFarms = portfolio.windFarms.map((w) => {
        if (w.id !== id) return w;
        const next = w.status === 'online' ? 'degraded' : w.status === 'degraded' ? 'curtailed' : w.status === 'curtailed' ? 'offline' : 'online';
        const mult = next === 'online' ? 0.75 : next === 'degraded' ? 0.35 : 0;
        return { ...w, status: next as AssetStatus, currentOutputMw: w.capacityMw * mult };
      });
    } else if (category === 'bess') {
      updated.batteries = portfolio.batteries.map((b) => {
        if (b.id !== id) return b;
        const next = b.status === 'idle' ? 'fault' : b.status === 'fault' ? 'maintenance' : 'idle';
        return { ...b, status: next as BatteryStatus, targetPowerMw: 0 };
      });
    } else if (category === 'industrial') {
      updated.consumers = portfolio.consumers.map((c) => {
        if (c.id !== id) return c;
        const next = c.status === 'normal' ? 'dr_active' : c.status === 'dr_active' ? 'offline' : 'normal';
        return { ...c, status: next as ConsumerStatus };
      });
    }
    onUpdatePortfolio(syncGridState(updated));
  };

  const handleResetDefaults = () => {
    onUpdatePortfolio(initialPortfolio);
    setEditingAssetId(null);
    setIsAddingNew(false);
    setDeleteConfirmId(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-panel border border-linestrong rounded-xl p-5 max-w-5xl w-full shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-line">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cy">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-paper tracking-tight">
                Portfolio Topology & Asset Lifecycle Management
              </h3>
              <p className="text-xs text-muted">
                Add, reconfigure, decommission, or adjust operational parameters for renewable farms, BESS storage, and grid interties.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted hover:text-paper hover:bg-raise rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Tabs & Add Button Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
          <div className="flex flex-wrap gap-1.5 text-xs">
            <button
              onClick={() => { setActiveCategory('bess'); setIsAddingNew(false); setEditingAssetId(null); }}
              className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors ${
                activeCategory === 'bess'
                  ? 'bg-emerald-600 text-onaccent shadow-xs'
                  : 'bg-raise/80 text-soft hover:text-onaccent'
              }`}
            >
              <BatteryCharging className="w-3.5 h-3.5" />
              <span>BESS Fleet ({portfolio.batteries.length})</span>
            </button>

            <button
              onClick={() => { setActiveCategory('solar'); setIsAddingNew(false); setEditingAssetId(null); }}
              className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors ${
                activeCategory === 'solar'
                  ? 'bg-amber-600 text-onaccent shadow-xs'
                  : 'bg-raise/80 text-soft hover:text-onaccent'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Solar Arrays ({portfolio.solarFarms.length})</span>
            </button>

            <button
              onClick={() => { setActiveCategory('wind'); setIsAddingNew(false); setEditingAssetId(null); }}
              className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors ${
                activeCategory === 'wind'
                  ? 'bg-cyan-600 text-onaccent shadow-xs'
                  : 'bg-raise/80 text-soft hover:text-onaccent'
              }`}
            >
              <Wind className="w-3.5 h-3.5" />
              <span>Wind Arrays ({portfolio.windFarms.length})</span>
            </button>

            <button
              onClick={() => { setActiveCategory('industrial'); setIsAddingNew(false); setEditingAssetId(null); }}
              className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors ${
                activeCategory === 'industrial'
                  ? 'bg-purple-600 text-onaccent shadow-xs'
                  : 'bg-raise/80 text-soft hover:text-onaccent'
              }`}
            >
              <Factory className="w-3.5 h-3.5" />
              <span>Industrial Loads ({portfolio.consumers.length})</span>
            </button>

            <button
              onClick={() => { setActiveCategory('grid'); setIsAddingNew(false); setEditingAssetId(null); }}
              className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors ${
                activeCategory === 'grid'
                  ? 'bg-strong text-paper shadow-xs'
                  : 'bg-raise/80 text-soft hover:text-paper'
              }`}
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Interties ({portfolio.interties.length})</span>
            </button>
          </div>

          {/* Add Asset Trigger */}
          <button
            onClick={() => handleStartAdd(activeCategory)}
            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-onaccent text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add {activeCategory === 'bess' ? 'Battery System' : activeCategory === 'solar' ? 'Solar Farm' : activeCategory === 'wind' ? 'Wind Farm' : activeCategory === 'industrial' ? 'Industrial Consumer' : 'Intertie Corridor'}</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto space-y-3.5 text-xs pr-1">
          {/* ADD NEW ASSET FORM DRAWER */}
          {isAddingNew && (
            <div className="p-4 rounded-xl bg-page border border-cyan-500/40 space-y-3 shadow-lg">
              <div className="flex items-center justify-between pb-2 border-b border-line">
                <span className="font-semibold text-cy text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Commission New {activeCategory.toUpperCase()} Asset
                </span>
                <button
                  onClick={() => setIsAddingNew(false)}
                  className="p-1 text-muted hover:text-paper rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Dynamic Add Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] text-muted block mb-1">Asset ID</label>
                  <input
                    type="text"
                    value={addForm.id || ''}
                    onChange={(e) => setAddForm({ ...addForm, id: e.target.value })}
                    className="w-full bg-panel border border-linestrong rounded px-2.5 py-1 text-paper font-mono text-xs focus:border-cyan-400 outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted block mb-1">Asset Name</label>
                  <input
                    type="text"
                    value={addForm.name || ''}
                    onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                    className="w-full bg-panel border border-linestrong rounded px-2.5 py-1 text-paper text-xs focus:border-cyan-400 outline-hidden"
                  />
                </div>

                {activeCategory === 'bess' && (
                  <>
                    <div>
                      <label className="text-[11px] text-muted block mb-1">Chemistry</label>
                      <select
                        value={addForm.chemistry || 'LFP'}
                        onChange={(e) => setAddForm({ ...addForm, chemistry: e.target.value })}
                        className="w-full bg-panel border border-linestrong rounded px-2.5 py-1 text-paper text-xs focus:border-cyan-400 outline-hidden"
                      >
                        <option value="LFP">LFP (Lithium Iron Phosphate)</option>
                        <option value="NMC">NMC (Nickel Manganese Cobalt)</option>
                        <option value="Sodium-Ion">Sodium-Ion (Na-Ion)</option>
                        <option value="Flow">Vanadium Redox Flow</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-muted block mb-1">Power Rating (MW)</label>
                      <input
                        type="number"
                        value={addForm.powerRatingMw || 0}
                        onChange={(e) => setAddForm({ ...addForm, powerRatingMw: Number(e.target.value) })}
                        className="w-full bg-panel border border-linestrong rounded px-2.5 py-1 text-paper font-mono text-xs focus:border-cyan-400 outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted block mb-1">Storage Capacity (MWh)</label>
                      <input
                        type="number"
                        value={addForm.capacityMwh || 0}
                        onChange={(e) => setAddForm({ ...addForm, capacityMwh: Number(e.target.value) })}
                        className="w-full bg-panel border border-linestrong rounded px-2.5 py-1 text-paper font-mono text-xs focus:border-cyan-400 outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted block mb-1">Current State of Charge (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={addForm.currentSocPct || 50}
                        onChange={(e) => setAddForm({ ...addForm, currentSocPct: Number(e.target.value) })}
                        className="w-full bg-panel border border-linestrong rounded px-2.5 py-1 text-paper font-mono text-xs focus:border-cyan-400 outline-hidden"
                      />
                    </div>
                  </>
                )}

                {(activeCategory === 'solar' || activeCategory === 'wind') && (
                  <>
                    <div>
                      <label className="text-[11px] text-muted block mb-1">Nameplate Capacity (MW)</label>
                      <input
                        type="number"
                        value={addForm.capacityMw || 0}
                        onChange={(e) => setAddForm({ ...addForm, capacityMw: Number(e.target.value) })}
                        className="w-full bg-panel border border-linestrong rounded px-2.5 py-1 text-paper font-mono text-xs focus:border-cyan-400 outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted block mb-1">Current Output (MW)</label>
                      <input
                        type="number"
                        value={addForm.currentOutputMw || 0}
                        onChange={(e) => setAddForm({ ...addForm, currentOutputMw: Number(e.target.value) })}
                        className="w-full bg-panel border border-linestrong rounded px-2.5 py-1 text-paper font-mono text-xs focus:border-cyan-400 outline-hidden"
                      />
                    </div>
                  </>
                )}

                {activeCategory === 'industrial' && (
                  <>
                    <div>
                      <label className="text-[11px] text-muted block mb-1">Baseload Demand (MW)</label>
                      <input
                        type="number"
                        value={addForm.baseloadDemandMw || 0}
                        onChange={(e) => setAddForm({ ...addForm, baseloadDemandMw: Number(e.target.value) })}
                        className="w-full bg-panel border border-linestrong rounded px-2.5 py-1 text-paper font-mono text-xs focus:border-cyan-400 outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted block mb-1">Flexible Load Headroom (MW)</label>
                      <input
                        type="number"
                        value={addForm.flexibleDemandMw || 0}
                        onChange={(e) => setAddForm({ ...addForm, flexibleDemandMw: Number(e.target.value) })}
                        className="w-full bg-panel border border-linestrong rounded px-2.5 py-1 text-paper font-mono text-xs focus:border-cyan-400 outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted block mb-1">DR Incentive Rate ($/MWh)</label>
                      <input
                        type="number"
                        value={addForm.drIncentiveRate || 80}
                        onChange={(e) => setAddForm({ ...addForm, drIncentiveRate: Number(e.target.value) })}
                        className="w-full bg-panel border border-linestrong rounded px-2.5 py-1 text-paper font-mono text-xs focus:border-cyan-400 outline-hidden"
                      />
                    </div>
                  </>
                )}

                {activeCategory === 'grid' && (
                  <>
                    <div>
                      <label className="text-[11px] text-muted block mb-1">Thermal Limit (MW)</label>
                      <input
                        type="number"
                        value={addForm.limitMw || 150}
                        onChange={(e) => setAddForm({ ...addForm, limitMw: Number(e.target.value) })}
                        className="w-full bg-panel border border-linestrong rounded px-2.5 py-1 text-paper font-mono text-xs focus:border-cyan-400 outline-hidden"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setIsAddingNew(false)}
                  className="px-3 py-1 rounded bg-raise hover:bg-strong text-soft font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSaveAdd(activeCategory)}
                  className="px-4 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-onaccent font-semibold flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Commit to Portfolio
                </button>
              </div>
            </div>
          )}

          {/* ASSET LIST FOR ACTIVE CATEGORY */}
          <div className="space-y-3">
            {/* BESS Category */}
            {activeCategory === 'bess' && (
              portfolio.batteries.map((bess) => {
                const isEditing = editingAssetId === bess.id;
                return (
                  <div
                    key={bess.id}
                    className="p-4 rounded-xl bg-page border border-line space-y-3 transition-colors hover:border-linestrong"
                  >
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-line">
                          <span className="font-semibold text-cy">Editing {bess.name}</span>
                          <span className="font-mono text-xs text-muted">ID: {bess.id}</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Name</label>
                            <input
                              type="text"
                              value={editForm.name || ''}
                              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Power Rating (MW)</label>
                            <input
                              type="number"
                              value={editForm.powerRatingMw || 0}
                              onChange={(e) => setEditForm({ ...editForm, powerRatingMw: Number(e.target.value) })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Storage Capacity (MWh)</label>
                            <input
                              type="number"
                              value={editForm.capacityMwh || 0}
                              onChange={(e) => setEditForm({ ...editForm, capacityMwh: Number(e.target.value) })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Current SOC (%)</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={editForm.currentSocPct || 0}
                              onChange={(e) => setEditForm({ ...editForm, currentSocPct: Number(e.target.value) })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Min SOC Reserve (%)</label>
                            <input
                              type="number"
                              value={editForm.minSocPct || 0}
                              onChange={(e) => setEditForm({ ...editForm, minSocPct: Number(e.target.value) })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Status</label>
                            <select
                              value={editForm.status || 'idle'}
                              onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper text-xs"
                            >
                              <option value="idle">Idle / Standby</option>
                              <option value="discharging">Discharging</option>
                              <option value="charging">Charging</option>
                              <option value="fault">Fault Alert</option>
                              <option value="maintenance">Maintenance</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Cell Temp (°C)</label>
                            <input
                              type="number"
                              value={editForm.tempC || 25}
                              onChange={(e) => setEditForm({ ...editForm, tempC: Number(e.target.value) })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Efficiency Ratio</label>
                            <input
                              type="number"
                              step="0.01"
                              value={editForm.efficiency || 0.92}
                              onChange={(e) => setEditForm({ ...editForm, efficiency: Number(e.target.value) })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper font-mono text-xs"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            onClick={() => setEditingAssetId(null)}
                            className="px-3 py-1 rounded bg-raise hover:bg-strong text-soft font-medium"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveEdit('bess')}
                            className="px-3.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-onaccent font-semibold flex items-center gap-1.5"
                          >
                            <Save className="w-3.5 h-3.5" /> Save Changes
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-semibold text-paper text-sm">{bess.name}</h4>
                            <span className="text-muted font-mono text-[11px]">
                              ID: {bess.id} · Chemistry: {bess.chemistry} · Efficiency: {(bess.efficiency * 100).toFixed(0)}% · Cycles: {bess.cycleCount}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`font-mono text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                                bess.status === 'fault'
                                  ? 'bg-rose-500/20 text-ro border border-rose-500/40'
                                  : bess.status === 'maintenance'
                                  ? 'bg-amber-500/20 text-am border border-amber-500/40'
                                  : 'bg-emerald-500/20 text-em border border-emerald-500/40'
                              }`}
                            >
                              {bess.status}
                            </span>

                            <button
                              onClick={() => handleToggleStatus(bess.id, 'bess')}
                              className="px-2.5 py-1 text-[11px] font-medium rounded bg-raise hover:bg-strong text-paper"
                            >
                              Toggle Status
                            </button>

                            <button
                              onClick={() => handleStartEdit(bess)}
                              className="p-1 rounded bg-raise hover:bg-strong text-soft hover:text-paper"
                              title="Edit Asset"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {deleteConfirmId === bess.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleDeleteAsset(bess.id, 'bess')}
                                  className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-onaccent text-[10px] font-bold"
                                >
                                  Confirm Delete
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="p-1 text-muted hover:text-paper text-[10px]"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirmId(bess.id)}
                                className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-ro hover:text-ro"
                                title="Decommission and Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                          <div className="p-2 rounded bg-panel border border-line/80">
                            <span className="text-muted text-[10px] block">Nameplate Power</span>
                            <span className="text-paper font-bold">{bess.powerRatingMw} MW</span>
                          </div>
                          <div className="p-2 rounded bg-panel border border-line/80">
                            <span className="text-muted text-[10px] block">Storage Capacity</span>
                            <span className="text-paper font-bold">{bess.capacityMwh} MWh</span>
                          </div>
                          <div className="p-2 rounded bg-panel border border-line/80">
                            <span className="text-muted text-[10px] block">Current SOC / Reserve</span>
                            <span className="text-em font-bold">{bess.currentSocPct.toFixed(1)}%</span>
                            <span className="text-muted text-[10px] ml-1">(&gt;{bess.minSocPct}%)</span>
                          </div>
                          <div className="p-2 rounded bg-panel border border-line/80">
                            <span className="text-muted text-[10px] block">Cell Temperature</span>
                            <span className="text-paper font-bold">{bess.tempC}°C</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}

            {/* Solar Category */}
            {activeCategory === 'solar' && (
              portfolio.solarFarms.map((farm) => {
                const isEditing = editingAssetId === farm.id;
                return (
                  <div
                    key={farm.id}
                    className="p-3.5 rounded-xl bg-page border border-line space-y-2.5 transition-colors hover:border-linestrong"
                  >
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-line">
                          <span className="font-semibold text-am">Editing {farm.name}</span>
                          <span className="font-mono text-xs text-muted">ID: {farm.id}</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Name</label>
                            <input
                              type="text"
                              value={editForm.name || ''}
                              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Capacity (MW)</label>
                            <input
                              type="number"
                              value={editForm.capacityMw || 0}
                              onChange={(e) => setEditForm({ ...editForm, capacityMw: Number(e.target.value) })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Current Output (MW)</label>
                            <input
                              type="number"
                              value={editForm.currentOutputMw || 0}
                              onChange={(e) => setEditForm({ ...editForm, currentOutputMw: Number(e.target.value) })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Status</label>
                            <select
                              value={editForm.status || 'online'}
                              onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper text-xs"
                            >
                              <option value="online">Online</option>
                              <option value="degraded">Degraded</option>
                              <option value="curtailed">Curtailed</option>
                              <option value="offline">Offline</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Tilt Angle (°)</label>
                            <input
                              type="number"
                              value={editForm.tiltAngle || 0}
                              onChange={(e) => setEditForm({ ...editForm, tiltAngle: Number(e.target.value) })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Degradation (%)</label>
                            <input
                              type="number"
                              step="0.1"
                              value={editForm.degradationPct || 0}
                              onChange={(e) => setEditForm({ ...editForm, degradationPct: Number(e.target.value) })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper font-mono text-xs"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            onClick={() => setEditingAssetId(null)}
                            className="px-3 py-1 rounded bg-raise hover:bg-strong text-soft font-medium"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveEdit('solar')}
                            className="px-3.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-onaccent font-semibold flex items-center gap-1.5"
                          >
                            <Save className="w-3.5 h-3.5" /> Save Changes
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-paper">{farm.name}</span>
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.2 rounded uppercase ${
                                farm.status === 'online'
                                  ? 'bg-emerald-500/20 text-em'
                                  : farm.status === 'degraded'
                                  ? 'bg-amber-500/20 text-am'
                                  : 'bg-rose-500/20 text-ro'
                              }`}
                            >
                              {farm.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted font-mono">
                            ID: {farm.id} · Capacity: {farm.capacityMw} MW · Tilt: {farm.tiltAngle}° · Output: {farm.currentOutputMw.toFixed(1)} MW
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleStatus(farm.id, 'solar')}
                            className="px-3 py-1 rounded bg-raise hover:bg-strong text-paper font-medium text-xs"
                          >
                            Toggle Status
                          </button>
                          <button
                            onClick={() => handleStartEdit(farm)}
                            className="p-1.5 rounded bg-raise hover:bg-strong text-soft hover:text-paper"
                            title="Edit Farm"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {deleteConfirmId === farm.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDeleteAsset(farm.id, 'solar')}
                                className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-onaccent text-[10px] font-bold"
                              >
                                Confirm Delete
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="p-1 text-muted hover:text-paper text-[10px]"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirmId(farm.id)}
                              className="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-ro hover:text-ro"
                              title="Delete Farm"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Wind Category */}
            {activeCategory === 'wind' && (
              portfolio.windFarms.map((farm) => {
                const isEditing = editingAssetId === farm.id;
                return (
                  <div
                    key={farm.id}
                    className="p-3.5 rounded-xl bg-page border border-line space-y-2.5 transition-colors hover:border-linestrong"
                  >
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-line">
                          <span className="font-semibold text-cy">Editing {farm.name}</span>
                          <span className="font-mono text-xs text-muted">ID: {farm.id}</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Name</label>
                            <input
                              type="text"
                              value={editForm.name || ''}
                              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Capacity (MW)</label>
                            <input
                              type="number"
                              value={editForm.capacityMw || 0}
                              onChange={(e) => setEditForm({ ...editForm, capacityMw: Number(e.target.value) })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Current Output (MW)</label>
                            <input
                              type="number"
                              value={editForm.currentOutputMw || 0}
                              onChange={(e) => setEditForm({ ...editForm, currentOutputMw: Number(e.target.value) })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Wind Speed (m/s)</label>
                            <input
                              type="number"
                              step="0.1"
                              value={editForm.windSpeedMs || 0}
                              onChange={(e) => setEditForm({ ...editForm, windSpeedMs: Number(e.target.value) })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Status</label>
                            <select
                              value={editForm.status || 'online'}
                              onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper text-xs"
                            >
                              <option value="online">Online</option>
                              <option value="degraded">Degraded</option>
                              <option value="curtailed">Curtailed</option>
                              <option value="offline">Offline</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-2 pt-5">
                            <input
                              type="checkbox"
                              id={`gust-${farm.id}`}
                              checked={Boolean(editForm.gustWarning)}
                              onChange={(e) => setEditForm({ ...editForm, gustWarning: e.target.checked })}
                              className="rounded border-linestrong text-ro focus:ring-0"
                            />
                            <label htmlFor={`gust-${farm.id}`} className="text-xs text-ro">Gust Warning Alert</label>
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            onClick={() => setEditingAssetId(null)}
                            className="px-3 py-1 rounded bg-raise hover:bg-strong text-soft font-medium"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveEdit('wind')}
                            className="px-3.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-onaccent font-semibold flex items-center gap-1.5"
                          >
                            <Save className="w-3.5 h-3.5" /> Save Changes
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-paper">{farm.name}</span>
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.2 rounded uppercase ${
                                farm.status === 'online'
                                  ? 'bg-emerald-500/20 text-em'
                                  : farm.status === 'degraded'
                                  ? 'bg-amber-500/20 text-am'
                                  : 'bg-rose-500/20 text-ro'
                              }`}
                            >
                              {farm.status}
                            </span>
                            {farm.gustWarning && (
                              <span className="text-[10px] font-mono text-ro bg-rose-500/10 px-1 rounded flex items-center gap-0.5">
                                <AlertTriangle className="w-3 h-3" /> GUST
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted font-mono">
                            ID: {farm.id} · Capacity: {farm.capacityMw} MW · Wind: {farm.windSpeedMs.toFixed(1)} m/s · Output: {farm.currentOutputMw.toFixed(1)} MW
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleStatus(farm.id, 'wind')}
                            className="px-3 py-1 rounded bg-raise hover:bg-strong text-paper font-medium text-xs"
                          >
                            Toggle Status
                          </button>
                          <button
                            onClick={() => handleStartEdit(farm)}
                            className="p-1.5 rounded bg-raise hover:bg-strong text-soft hover:text-paper"
                            title="Edit Farm"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {deleteConfirmId === farm.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDeleteAsset(farm.id, 'wind')}
                                className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-onaccent text-[10px] font-bold"
                              >
                                Confirm Delete
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="p-1 text-muted hover:text-paper text-[10px]"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirmId(farm.id)}
                              className="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-ro hover:text-ro"
                              title="Delete Farm"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Industrial Consumers */}
            {activeCategory === 'industrial' && (
              portfolio.consumers.map((c) => {
                const isEditing = editingAssetId === c.id;
                return (
                  <div
                    key={c.id}
                    className="p-3.5 rounded-xl bg-page border border-line space-y-2.5 transition-colors hover:border-linestrong"
                  >
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-line">
                          <span className="font-semibold text-pu">Editing {c.name}</span>
                          <span className="font-mono text-xs text-muted">ID: {c.id}</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Name</label>
                            <input
                              type="text"
                              value={editForm.name || ''}
                              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Baseload Demand (MW)</label>
                            <input
                              type="number"
                              value={editForm.baseloadDemandMw || 0}
                              onChange={(e) => setEditForm({ ...editForm, baseloadDemandMw: Number(e.target.value) })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Flexible Load (MW)</label>
                            <input
                              type="number"
                              value={editForm.flexibleDemandMw || 0}
                              onChange={(e) => setEditForm({ ...editForm, flexibleDemandMw: Number(e.target.value) })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-1">DR Incentive Rate ($/MWh)</label>
                            <input
                              type="number"
                              value={editForm.drIncentiveRate || 0}
                              onChange={(e) => setEditForm({ ...editForm, drIncentiveRate: Number(e.target.value) })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Status</label>
                            <select
                              value={editForm.status || 'normal'}
                              onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper text-xs"
                            >
                              <option value="normal">Normal Operation</option>
                              <option value="dr_active">Demand Response Active</option>
                              <option value="offline">Offline</option>
                            </select>
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            onClick={() => setEditingAssetId(null)}
                            className="px-3 py-1 rounded bg-raise hover:bg-strong text-soft font-medium"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveEdit('industrial')}
                            className="px-3.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-onaccent font-semibold flex items-center gap-1.5"
                          >
                            <Save className="w-3.5 h-3.5" /> Save Changes
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-paper">{c.name}</span>
                              <span
                                className={`text-[10px] font-mono px-1.5 py-0.2 rounded uppercase ${
                                  c.status === 'normal'
                                    ? 'bg-emerald-500/20 text-em'
                                    : c.status === 'dr_active'
                                    ? 'bg-amber-500/20 text-am'
                                    : 'bg-rose-500/20 text-ro'
                                }`}
                              >
                                {c.status}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted font-mono">
                              ID: {c.id} · Total: {c.totalDemandMw} MW (Base: {c.baseloadDemandMw} MW + Flex: {c.flexibleDemandMw} MW) · DR Rate: ${c.drIncentiveRate}/MWh
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleToggleStatus(c.id, 'industrial')}
                              className="px-2.5 py-1 rounded bg-raise hover:bg-strong text-paper font-medium text-xs"
                            >
                              Toggle DR
                            </button>
                            <button
                              onClick={() => handleStartEdit(c)}
                              className="p-1.5 rounded bg-raise hover:bg-strong text-soft hover:text-paper"
                              title="Edit Consumer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {deleteConfirmId === c.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleDeleteAsset(c.id, 'industrial')}
                                  className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-onaccent text-[10px] font-bold"
                                >
                                  Confirm Delete
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="p-1 text-muted hover:text-paper text-[10px]"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirmId(c.id)}
                                className="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-ro hover:text-ro"
                                title="Delete Consumer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Slider for flexible demand headroom */}
                        <div className="space-y-1 pt-1 border-t border-line/60">
                          <div className="flex justify-between text-[11px] text-muted">
                            <span>Adjustable Demand Response Headroom:</span>
                            <span className="font-mono text-cy font-bold">{c.flexibleDemandMw} MW</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max={Math.max(10, c.totalDemandMw - c.baseloadDemandMw + 15)}
                            step="1"
                            value={c.flexibleDemandMw}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              const updated = {
                                ...portfolio,
                                consumers: portfolio.consumers.map((item) =>
                                  item.id === c.id
                                    ? { ...item, flexibleDemandMw: val, totalDemandMw: item.baseloadDemandMw + val }
                                    : item,
                                ),
                              };
                              onUpdatePortfolio(syncGridState(updated));
                            }}
                            className="w-full h-1.5 bg-raise rounded appearance-none cursor-pointer accent-cyan-500"
                          />
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}

            {/* Transmission Interties */}
            {activeCategory === 'grid' && (
              portfolio.interties.map((line) => {
                const isEditing = editingAssetId === line.id;
                return (
                  <div
                    key={line.id}
                    className="p-3.5 rounded-xl bg-page border border-line space-y-2.5 transition-colors hover:border-linestrong"
                  >
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-line">
                          <span className="font-semibold text-pu">Editing {line.name}</span>
                          <span className="font-mono text-xs text-muted">ID: {line.id}</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Name</label>
                            <input
                              type="text"
                              value={editForm.name || ''}
                              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Thermal Limit (MW)</label>
                            <input
                              type="number"
                              value={editForm.limitMw || 0}
                              onChange={(e) => setEditForm({ ...editForm, limitMw: Number(e.target.value) })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-1">Current Flow (MW)</label>
                            <input
                              type="number"
                              value={editForm.currentFlowMw || 0}
                              onChange={(e) => setEditForm({ ...editForm, currentFlowMw: Number(e.target.value) })}
                              className="w-full bg-panel border border-linestrong rounded px-2 py-1 text-paper font-mono text-xs"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            onClick={() => setEditingAssetId(null)}
                            className="px-3 py-1 rounded bg-raise hover:bg-strong text-soft font-medium"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveEdit('grid')}
                            className="px-3.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-onaccent font-semibold flex items-center gap-1.5"
                          >
                            <Save className="w-3.5 h-3.5" /> Save Changes
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-paper">{line.name}</span>
                              {line.congested && (
                                <span className="text-[10px] font-mono text-ro bg-rose-500/20 px-1.5 py-0.2 rounded font-bold">
                                  CONGESTED
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted font-mono">
                              ID: {line.id} · Current Flow: {line.currentFlowMw.toFixed(1)} MW · Thermal Rating: {line.limitMw} MW
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleStartEdit(line)}
                              className="p-1.5 rounded bg-raise hover:bg-strong text-soft hover:text-paper"
                              title="Edit Intertie"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {deleteConfirmId === line.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleDeleteAsset(line.id, 'grid')}
                                  className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-onaccent text-[10px] font-bold"
                                >
                                  Confirm Delete
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="p-1 text-muted hover:text-paper text-[10px]"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirmId(line.id)}
                                className="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-ro hover:text-ro"
                                title="Delete Intertie"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Slider for Intertie Thermal Rating */}
                        <div className="space-y-1 pt-1 border-t border-line/60">
                          <div className="flex justify-between text-[11px] text-muted">
                            <span>Thermal Power Transmission Rating:</span>
                            <span className="font-mono text-pu font-bold">{line.limitMw} MW</span>
                          </div>
                          <input
                            type="range"
                            min="40"
                            max="300"
                            step="5"
                            value={line.limitMw}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              const updated = {
                                ...portfolio,
                                interties: portfolio.interties.map((item) =>
                                  item.id === line.id ? { ...item, limitMw: val } : item,
                                ),
                              };
                              onUpdatePortfolio(syncGridState(updated));
                            }}
                            className="w-full h-1.5 bg-raise rounded appearance-none cursor-pointer accent-purple-500"
                          />
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-line flex flex-col sm:flex-row justify-between items-center gap-2 text-xs">
          <button
            onClick={handleResetDefaults}
            className="text-xs text-muted hover:text-paper flex items-center gap-1.5 font-mono py-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Entire Portfolio to Nominal Benchmark Defaults</span>
          </button>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-onaccent rounded-lg font-semibold shadow-sm transition-colors"
          >
            Apply & Return to Control Room
          </button>
        </div>
      </div>
    </div>
  );
};
