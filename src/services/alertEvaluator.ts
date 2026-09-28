import { PortfolioState, AlertThresholds, ActiveAlert } from '../types/orchestrator';

export const defaultAlertThresholds: AlertThresholds = {
  frequencyWarningDeltaHz: 0.08,      // |f - 50.00| > 0.08 Hz
  frequencyEmergencyDeltaHz: 0.22,    // |f - 50.00| > 0.22 Hz
  priceSpikeThresholdUsd: 120.0,      // > $120/MWh
  priceNegativeThresholdUsd: 0.0,     // < $0/MWh
  lineCongestionThresholdPct: 90.0,   // > 90% capacity
  batteryTempWarningC: 38.0,          // > 38°C
  batteryTempTripC: 50.0,             // > 50°C
  batteryMinSocFloorWarningPct: 18.0, // < 18% SOC
  windGustCutoutMs: 22.0,             // > 22 m/s
  solarRampDropPct: 45.0,             // fleet output < 55% of online nameplate
  demandDeficitMw: 50.0,              // demand exceeds clean gen by > 50 MW
};

export function evaluateActiveAlerts(
  portfolio: PortfolioState,
  thresholds: AlertThresholds,
  acknowledgedIds: Set<string> = new Set(),
  prevAlerts: ActiveAlert[] = [],
): ActiveAlert[] {
  const alerts: ActiveAlert[] = [];
  const now = new Date().toISOString();
  const prevById = new Map(prevAlerts.map((a) => [a.id, a]));
  const stamp = (id: string) => prevById.get(id)?.timestamp || now;

  // 1. Frequency Checks
  const freqDelta = Math.abs(portfolio.grid.frequencyHz - 50.0);
  if (freqDelta >= thresholds.frequencyEmergencyDeltaHz) {
    alerts.push({
      id: 'ALT-FREQ-EMERGENCY',
      timestamp: stamp('ALT-FREQ-EMERGENCY'),
      severity: 'critical',
      category: 'FREQUENCY',
      title: 'Emergency Frequency Deviation',
      message: `Grid frequency is ${portfolio.grid.frequencyHz.toFixed(2)} Hz (delta: ${(portfolio.grid.frequencyHz - 50.0).toFixed(2)} Hz), breaching the emergency limit.`,
      value: `${portfolio.grid.frequencyHz.toFixed(2)} Hz`,
      threshold: `±${thresholds.frequencyEmergencyDeltaHz.toFixed(2)} Hz`,
      acknowledged: acknowledgedIds.has('ALT-FREQ-EMERGENCY'),
      suggestedMitigation: 'Trigger instantaneous BESS Fast Frequency Response (FFR) droop curve and prepare emergency load shedding.',
      autoMitigated: false,
    });
  } else if (freqDelta >= thresholds.frequencyWarningDeltaHz) {
    alerts.push({
      id: 'ALT-FREQ-WARN',
      timestamp: stamp('ALT-FREQ-WARN'),
      severity: 'warning',
      category: 'FREQUENCY',
      title: 'Grid Frequency Warning Band',
      message: `Grid frequency is ${portfolio.grid.frequencyHz.toFixed(2)} Hz, operating outside nominal deadband (49.92 - 50.08 Hz).`,
      value: `${portfolio.grid.frequencyHz.toFixed(2)} Hz`,
      threshold: `±${thresholds.frequencyWarningDeltaHz.toFixed(2)} Hz`,
      acknowledged: acknowledgedIds.has('ALT-FREQ-WARN'),
      suggestedMitigation: 'Modulate BESS active power inverters to counter frequency drift.',
      autoMitigated: false,
    });
  }

  // 2. Market Price Checks
  if (portfolio.market.spotPriceUsdPerMwh >= thresholds.priceSpikeThresholdUsd) {
    alerts.push({
      id: 'ALT-PRICE-SPIKE',
      timestamp: stamp('ALT-PRICE-SPIKE'),
      severity: portfolio.market.spotPriceUsdPerMwh > 250 ? 'critical' : 'warning',
      category: 'MARKET',
      title: 'Wholesale Market Price Spike',
      message: `Spot price reached $${portfolio.market.spotPriceUsdPerMwh.toFixed(2)}/MWh, exceeding the $${thresholds.priceSpikeThresholdUsd.toFixed(0)} alert threshold.`,
      value: `$${portfolio.market.spotPriceUsdPerMwh.toFixed(2)}/MWh`,
      threshold: `> $${thresholds.priceSpikeThresholdUsd}/MWh`,
      acknowledged: acknowledgedIds.has('ALT-PRICE-SPIKE'),
      suggestedMitigation: 'Maximize battery discharge to sell high-value energy and avoid purchasing expensive wholesale power.',
      autoMitigated: false,
    });
  } else if (portfolio.market.spotPriceUsdPerMwh <= thresholds.priceNegativeThresholdUsd) {
    alerts.push({
      id: 'ALT-PRICE-NEGATIVE',
      timestamp: stamp('ALT-PRICE-NEGATIVE'),
      severity: 'info',
      category: 'MARKET',
      title: 'Negative Pricing Opportunity',
      message: `Spot price dropped to $${portfolio.market.spotPriceUsdPerMwh.toFixed(2)}/MWh. Grid operators are paying to offload energy.`,
      value: `$${portfolio.market.spotPriceUsdPerMwh.toFixed(2)}/MWh`,
      threshold: `<= $${thresholds.priceNegativeThresholdUsd}/MWh`,
      acknowledged: acknowledgedIds.has('ALT-PRICE-NEGATIVE'),
      suggestedMitigation: 'Ramp battery charging to maximum intake rate to capture negative pricing revenue.',
      autoMitigated: false,
    });
  }

  // 3. Transmission Congestion Checks
  portfolio.interties.forEach((line) => {
    const loadPct = (Math.abs(line.currentFlowMw) / (line.limitMw || 1)) * 100;
    if (loadPct >= 98.0 || line.congested) {
      alerts.push({
        id: `ALT-CONG-${line.id}`,
        timestamp: stamp(`ALT-CONG-${line.id}`),
        severity: 'critical',
        category: 'CONGESTION',
        title: `Critical Congestion: ${line.name}`,
        message: `${line.name} power flow is at ${line.currentFlowMw.toFixed(1)} MW (${loadPct.toFixed(1)}% of thermal rating). Tripping hazard imminent.`,
        sourceAssetId: line.id,
        value: `${line.currentFlowMw.toFixed(1)} MW (${loadPct.toFixed(0)}%)`,
        threshold: `> ${thresholds.lineCongestionThresholdPct}%`,
        acknowledged: acknowledgedIds.has(`ALT-CONG-${line.id}`),
        suggestedMitigation: 'Divert power into local BESS storage or curtail upstream wind/solar generation immediately.',
        autoMitigated: false,
      });
    } else if (loadPct >= thresholds.lineCongestionThresholdPct) {
      alerts.push({
        id: `ALT-CONG-${line.id}`,
        timestamp: stamp(`ALT-CONG-${line.id}`),
        severity: 'warning',
        category: 'CONGESTION',
        title: `Transmission Warning: ${line.name}`,
        message: `${line.name} is operating at ${loadPct.toFixed(1)}% capacity. Export headroom is constrained.`,
        sourceAssetId: line.id,
        value: `${loadPct.toFixed(1)}%`,
        threshold: `> ${thresholds.lineCongestionThresholdPct}%`,
        acknowledged: acknowledgedIds.has(`ALT-CONG-${line.id}`),
        suggestedMitigation: 'Inhibit further commercial export schedules across this corridor.',
        autoMitigated: false,
      });
    }
  });

  // 4. Battery Thermal and Low SOC Checks
  portfolio.batteries.forEach((bess) => {
    if (bess.status === 'fault' || bess.tempC >= thresholds.batteryTempTripC) {
      alerts.push({
        id: `ALT-BATT-TRIP-${bess.id}`,
        timestamp: stamp(`ALT-BATT-TRIP-${bess.id}`),
        severity: 'critical',
        category: 'THERMAL',
        title: `Emergency Trip: ${bess.name}`,
        message: `${bess.name} reported cell temperature ${bess.tempC.toFixed(1)}°C or an inverter trip fault. Asset taken offline.`,
        sourceAssetId: bess.id,
        value: `${bess.tempC.toFixed(1)}°C (${bess.status})`,
        threshold: `> ${thresholds.batteryTempTripC}°C`,
        acknowledged: acknowledgedIds.has(`ALT-BATT-TRIP-${bess.id}`),
        suggestedMitigation: 'Isolate inverter string, engage HVAC chillers, and shift remaining duty cycle to secondary storage.',
        autoMitigated: false,
      });
    } else if (bess.tempC >= thresholds.batteryTempWarningC) {
      alerts.push({
        id: `ALT-BATT-TEMP-${bess.id}`,
        timestamp: stamp(`ALT-BATT-TEMP-${bess.id}`),
        severity: 'warning',
        category: 'THERMAL',
        title: `Thermal Warning: ${bess.name}`,
        message: `${bess.name} cell temperature is elevated at ${bess.tempC.toFixed(1)}°C. Approaching derating envelope.`,
        sourceAssetId: bess.id,
        value: `${bess.tempC.toFixed(1)}°C`,
        threshold: `> ${thresholds.batteryTempWarningC}°C`,
        acknowledged: acknowledgedIds.has(`ALT-BATT-TEMP-${bess.id}`),
        suggestedMitigation: 'Derate maximum C-rate to 0.5C to prevent thermal runaway.',
        autoMitigated: false,
      });
    }

    if (bess.currentSocPct <= thresholds.batteryMinSocFloorWarningPct) {
      alerts.push({
        id: `ALT-BATT-SOC-${bess.id}`,
        timestamp: stamp(`ALT-BATT-SOC-${bess.id}`),
        severity: 'warning',
        category: 'BATTERY',
        title: `Low State of Charge: ${bess.name}`,
        message: `${bess.name} SOC is at ${bess.currentSocPct.toFixed(1)}%, approaching the ${bess.minSocPct}% emergency reserve floor.`,
        sourceAssetId: bess.id,
        value: `${bess.currentSocPct.toFixed(1)}% SOC`,
        threshold: `<= ${thresholds.batteryMinSocFloorWarningPct}%`,
        acknowledged: acknowledgedIds.has(`ALT-BATT-SOC-${bess.id}`),
        suggestedMitigation: 'Inhibit further discharge and prioritize charging from clean renewable surplus.',
        autoMitigated: false,
      });
    }
  });

  // 5. Wind Gust Cut-out Checks
  portfolio.windFarms.forEach((wind) => {
    if (wind.windSpeedMs >= thresholds.windGustCutoutMs || wind.gustWarning) {
      alerts.push({
        id: `ALT-WIND-${wind.id}`,
        timestamp: stamp(`ALT-WIND-${wind.id}`),
        severity: 'warning',
        category: 'WEATHER',
        title: `Wind Cut-Out Risk: ${wind.name}`,
        message: `Wind gusts at ${wind.windSpeedMs.toFixed(1)} m/s are approaching turbine mechanical cutout limit (25.0 m/s).`,
        sourceAssetId: wind.id,
        value: `${wind.windSpeedMs.toFixed(1)} m/s`,
        threshold: `>= ${thresholds.windGustCutoutMs} m/s`,
        acknowledged: acknowledgedIds.has(`ALT-WIND-${wind.id}`),
        suggestedMitigation: 'Pre-feather turbine blades and pre-ramp BESS reserves to cushion potential generation loss.',
        autoMitigated: false,
      });
    }
  });

  // 6. Solar Fleet Collapse (cloud-front ramp) Check
  const onlineSolar = portfolio.solarFarms.filter((s) => s.status === 'online');
  const solarCap = onlineSolar.reduce((sum, s) => sum + s.capacityMw, 0);
  const solarOut = onlineSolar.reduce((sum, s) => sum + s.currentOutputMw, 0);
  if (solarCap > 0 && (solarOut / solarCap) * 100 <= 100 - thresholds.solarRampDropPct) {
    alerts.push({
      id: 'ALT-SOLAR-RAMP',
      timestamp: stamp('ALT-SOLAR-RAMP'),
      severity: 'warning',
      category: 'SOLAR',
      title: 'Solar Fleet Collapse',
      message: `Solar fleet output fell to ${solarOut.toFixed(1)} MW (${((solarOut / solarCap) * 100).toFixed(0)}% of ${solarCap.toFixed(0)} MW online nameplate). Suspected cloud-front ramp.`,
      value: `${solarOut.toFixed(1)} MW (${((solarOut / solarCap) * 100).toFixed(0)}%)`,
      threshold: `< ${(100 - thresholds.solarRampDropPct).toFixed(0)}% of nameplate`,
      acknowledged: acknowledgedIds.has('ALT-SOLAR-RAMP'),
      suggestedMitigation: 'Pre-position BESS in hot-standby and pre-notify flexible consumers of possible DR dispatch.',
      autoMitigated: false,
    });
  }

  // 7. Supply Deficit (demand outstrips clean generation) Check
  const cleanGen = portfolio.solarFarms.reduce((sum: number, s) => sum + (s.status === 'online' ? s.currentOutputMw : 0), 0)
    + portfolio.windFarms.reduce((sum: number, w) => sum + (w.status === 'online' ? w.currentOutputMw : 0), 0);
  const deficitMw = portfolio.grid.totalDemandMw - cleanGen;
  if (deficitMw > thresholds.demandDeficitMw) {
    alerts.push({
      id: 'ALT-DEMAND-DEFICIT',
      timestamp: stamp('ALT-DEMAND-DEFICIT'),
      severity: deficitMw > thresholds.demandDeficitMw * 2 ? 'critical' : 'warning',
      category: 'DEMAND',
      title: 'Supply Deficit: Imports Required',
      message: `Demand (${portfolio.grid.totalDemandMw.toFixed(1)} MW) exceeds clean generation (${cleanGen.toFixed(1)} MW) by ${deficitMw.toFixed(1)} MW — the gap must come from batteries or market imports.`,
      value: `${deficitMw.toFixed(1)} MW shortfall`,
      threshold: `> ${thresholds.demandDeficitMw} MW deficit`,
      acknowledged: acknowledgedIds.has('ALT-DEMAND-DEFICIT'),
      suggestedMitigation: 'Discharge BESS to cover the gap; if reserves are thin, trigger demand response or schedule market imports.',
      autoMitigated: false,
    });
  }

  // 8. Hysteresis: hold previously-active alerts through minor threshold
  // flapping (release bands), preserving first-seen timestamps.
  const freshIds = new Set(alerts.map((a) => a.id));
  for (const prev of prevAlerts) {
    if (freshIds.has(prev.id) || prev.autoMitigated) continue;
    if (stillBreaching(prev, portfolio, thresholds)) {
      alerts.push({ ...prev, hysteresisHeld: true, acknowledged: acknowledgedIds.has(prev.id) });
    }
  }

  return alerts;
}

/** Relaxed release-band check: true while the condition is still close enough
 *  to the alert threshold that clearing would just be noise flapping. */
function stillBreaching(alert: ActiveAlert, portfolio: PortfolioState, t: AlertThresholds): boolean {
  switch (alert.category) {
    case 'FREQUENCY': {
      const d = Math.abs(portfolio.grid.frequencyHz - 50.0);
      return alert.severity === 'critical' ? d >= t.frequencyEmergencyDeltaHz * 0.9 : d >= t.frequencyWarningDeltaHz * 0.85;
    }
    case 'MARKET': {
      const p = portfolio.market.spotPriceUsdPerMwh;
      if (alert.id === 'ALT-PRICE-NEGATIVE') return p <= t.priceNegativeThresholdUsd + 5;
      return p >= t.priceSpikeThresholdUsd * 0.95;
    }
    case 'CONGESTION': {
      const line = portfolio.interties.find((l) => l.id === alert.sourceAssetId);
      if (!line) return false;
      if (line.congested) return true;
      const pct = (Math.abs(line.currentFlowMw) / (line.limitMw || 1)) * 100;
      return alert.severity === 'critical' ? pct >= 95 : pct >= t.lineCongestionThresholdPct - 3;
    }
    case 'THERMAL': {
      const b = portfolio.batteries.find((x) => x.id === alert.sourceAssetId);
      if (!b) return false;
      if (b.status === 'fault') return true;
      return alert.severity === 'critical'
        ? b.tempC >= t.batteryTempTripC - 3
        : b.tempC >= t.batteryTempWarningC - 2;
    }
    case 'BATTERY': {
      const b = portfolio.batteries.find((x) => x.id === alert.sourceAssetId);
      return !!b && b.currentSocPct <= t.batteryMinSocFloorWarningPct + 2;
    }
    case 'WEATHER': {
      const w = portfolio.windFarms.find((x) => x.id === alert.sourceAssetId);
      return !!w && (w.gustWarning || w.windSpeedMs >= t.windGustCutoutMs - 1.5);
    }
    case 'SOLAR': {
      const online = portfolio.solarFarms.filter((s) => s.status === 'online');
      const cap = online.reduce((s, x) => s + x.capacityMw, 0);
      const out = online.reduce((s, x) => s + x.currentOutputMw, 0);
      return cap > 0 && (out / cap) * 100 <= 100 - t.solarRampDropPct + 5;
    }
    case 'DEMAND': {
      const clean = portfolio.solarFarms.reduce((s: number, x) => s + (x.status === 'online' ? x.currentOutputMw : 0), 0)
        + portfolio.windFarms.reduce((s: number, x) => s + (x.status === 'online' ? x.currentOutputMw : 0), 0);
      return portfolio.grid.totalDemandMw - clean > t.demandDeficitMw - 10;
    }
    default:
      return false;
  }
}
