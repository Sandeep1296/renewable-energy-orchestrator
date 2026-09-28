import { SimulationScenario } from '../types/orchestrator';

export const simulationScenarios: SimulationScenario[] = [
  {
    id: 'SCEN-01',
    num: 1,
    name: 'Sudden Cloud Front: 70% Solar Drop',
    category: 'WEATHER_SURGE',
    description: 'Heavy cumulonimbus cloud bank moves rapidly over Desert Sun and Solaria West farms. Solar output collapses from 163 MW to 48 MW within minutes.',
    expectedStrategy: 'Ramp BESS-Alpha and BESS-Beta discharge to prevent grid deficit without importing high-carbon power.',
    stressFactor: 'Solar generation down -70%',
    apply: (current) => ({
      ...current,
      weather: { ...current.weather, condition: 'heavy_overcast', cloudCoverPct: 88 },
      solarFarms: current.solarFarms.map((s) => ({
        ...s,
        currentOutputMw: s.capacityMw * 0.22,
        forecast15minMw: s.capacityMw * 0.18,
        status: 'online',
      })),
      grid: {
        ...current.grid,
        totalRenewableMw:
          current.solarFarms.reduce((sum, s) => sum + s.capacityMw * 0.22, 0) +
          current.windFarms.reduce((sum, w) => sum + w.currentOutputMw, 0),
        frequencyHz: 49.92,
        frequencyStatus: 'warning',
      },
    }),
  },
  {
    id: 'SCEN-02',
    num: 2,
    name: 'Afternoon Heatwave Price Spike ($380/MWh)',
    category: 'MARKET_VOLATILITY',
    description: 'Regional grid demand peaks due to air conditioning loads. Wholesale spot electricity prices spike from $48 to $380/MWh with steep upward momentum.',
    expectedStrategy: 'Aggressive battery discharge (up to thermal limits) to sell high-value power to the market and offset local purchase costs.',
    stressFactor: 'Market price spikes 7.8x',
    apply: (current) => ({
      ...current,
      market: {
        ...current.market,
        spotPriceUsdPerMwh: 380.0,
        forecastPrice1hr: 410.0,
        priceTrend: 'spiking',
      },
    }),
  },
  {
    id: 'SCEN-03',
    num: 3,
    name: 'Negative Pricing & Clean Energy Glut (-$25/MWh)',
    category: 'MARKET_VOLATILITY',
    description: 'Surplus wind and solar across the regional ISO drives market prices negative (-$25/MWh). Generators must pay the grid to take excess energy.',
    expectedStrategy: 'Maximum battery charging at full 90 MW rate from grid/renewables; curtail wind/solar if batteries reach max SOC (95%).',
    stressFactor: 'Spot price -$25.00/MWh',
    apply: (current) => ({
      ...current,
      market: {
        ...current.market,
        spotPriceUsdPerMwh: -25.0,
        forecastPrice1hr: -15.0,
        priceTrend: 'negative',
      },
      solarFarms: current.solarFarms.map((s) => ({
        ...s,
        currentOutputMw: s.capacityMw * 0.94,
      })),
      windFarms: current.windFarms.map((w) => ({
        ...w,
        currentOutputMw: w.capacityMw * 0.92,
      })),
    }),
  },
  {
    id: 'SCEN-04',
    num: 4,
    name: 'Regional Intertie North Congestion (148/150 MW)',
    category: 'GRID_CONGESTION',
    description: 'High exports along the 345kV North transmission corridor push power flow to 148 MW, 98.7% of its thermal stability limit.',
    expectedStrategy: 'Prevent additional transmission export; divert local renewable generation into BESS-Alpha and BESS-Beta or enact selective curtailment.',
    stressFactor: 'Line North flow at 98.7% capacity',
    apply: (current) => ({
      ...current,
      interties: current.interties.map((i) =>
        i.id === 'LINE-NORTH'
          ? { ...i, currentFlowMw: 148.0, congested: true }
          : i,
      ),
    }),
  },
  {
    id: 'SCEN-05',
    num: 5,
    name: 'BESS-Beta NMC Inverter Thermal Fault',
    category: 'ASSET_FAILURE',
    description: 'BESS-Beta (40 MW / 160 MWh) experiences an emergency coolant pump trip. Inverters shut down into safe lock mode.',
    expectedStrategy: 'Rebalance storage schedule to BESS-Alpha exclusively; maintain reserve buffer and re-evaluate industrial flexible load availability.',
    stressFactor: 'BESS-Beta offline (0 MW available)',
    apply: (current) => ({
      ...current,
      batteries: current.batteries.map((b) =>
        b.id === 'BESS-02'
          ? { ...b, status: 'fault', targetPowerMw: 0, tempC: 58.5 }
          : b,
      ),
    }),
  },
  {
    id: 'SCEN-06',
    num: 6,
    name: 'Sudden Wind Stagnation Calm Event',
    category: 'WEATHER_SURGE',
    description: 'A thermal inversion abruptly halts wind across Ridge Crest and Columbia Gorge. Wind generation collapses from 154 MW to 22 MW.',
    expectedStrategy: 'Smooth the steep wind ramp using battery discharge; evaluate baseline industrial loads.',
    stressFactor: 'Wind drops -85%',
    apply: (current) => ({
      ...current,
      weather: { ...current.weather, condition: 'partly_cloudy', windSpeedMs: 2.1 },
      windFarms: current.windFarms.map((w) => ({
        ...w,
        currentOutputMw: w.capacityMw * 0.12,
        forecast15minMw: w.capacityMw * 0.08,
        windSpeedMs: 2.1,
      })),
      grid: {
        ...current.grid,
        frequencyHz: 49.88,
        frequencyStatus: 'warning',
      },
    }),
  },
  {
    id: 'SCEN-07',
    num: 7,
    name: 'Wind Storm & Cut-Out Gust Alert (>24 m/s)',
    category: 'WEATHER_SURGE',
    description: 'Severe weather front brings gusts exceeding 24 m/s. Turbines risk mechanical overspeed damage if not feathered or curtailed.',
    expectedStrategy: 'Proactively curtail wind output to rated safe levels; absorb peak surges into BESS-Alpha.',
    stressFactor: 'Gusts 25.2 m/s (cutoff warning)',
    apply: (current) => ({
      ...current,
      weather: { ...current.weather, condition: 'gusty_wind', windSpeedMs: 24.5, stormAlert: true },
      windFarms: current.windFarms.map((w) => ({
        ...w,
        windSpeedMs: 24.5,
        gustWarning: true,
      })),
    }),
  },
  {
    id: 'SCEN-08',
    num: 8,
    name: 'Apex Steel Foundry Unannounced Arc Furnace Ramp (+20 MW)',
    category: 'DEMAND_SPIKE',
    description: 'Apex Steel starts secondary electric arc furnace without advance 30-min schedule notification, surging total demand to 170 MW.',
    expectedStrategy: 'Trigger Demand Response on flexible industrial loads and discharge fast-ramping BESS to maintain grid balance.',
    stressFactor: 'Industrial demand +20 MW instant ramp',
    apply: (current) => ({
      ...current,
      consumers: current.consumers.map((c) =>
        c.id === 'IND-01'
          ? { ...c, totalDemandMw: 65, flexibleDemandMw: 25 }
          : c,
      ),
      grid: {
        ...current.grid,
        totalDemandMw: 170,
        frequencyHz: 49.91,
      },
    }),
  },
  {
    id: 'SCEN-09',
    num: 9,
    name: 'Grid Frequency Droop Event (49.72 Hz)',
    category: 'FREQUENCY_EVENT',
    description: 'A major coal plant trips 150 miles away on the regional grid, causing frequency to droop to 49.72 Hz (severe under-frequency).',
    expectedStrategy: 'Immediate synthetic inertia response: discharge batteries at maximum rate and reduce non-critical loads to assist grid frequency recovery.',
    stressFactor: 'Frequency droop to 49.72 Hz',
    apply: (current) => ({
      ...current,
      grid: {
        ...current.grid,
        frequencyHz: 49.72,
        frequencyStatus: 'emergency',
        inertiaScore: 48.0,
      },
    }),
  },
  {
    id: 'SCEN-10',
    num: 10,
    name: 'Grid Over-Frequency Surge (50.28 Hz)',
    category: 'FREQUENCY_EVENT',
    description: 'Sudden disconnection of major industrial load pocket causes excess regional generation; frequency rises to 50.28 Hz.',
    expectedStrategy: 'Rapid frequency response: ramp BESS charging to maximum rate and throttle renewable inverters down (over-frequency curtailment).',
    stressFactor: 'Over-frequency 50.28 Hz',
    apply: (current) => ({
      ...current,
      grid: {
        ...current.grid,
        frequencyHz: 50.28,
        frequencyStatus: 'emergency',
      },
    }),
  },
  {
    id: 'SCEN-11',
    num: 11,
    name: 'Severe Storm Alert & Islanding Preparation',
    category: 'WEATHER_SURGE',
    description: 'National Weather Service issues severe derecho warning with transmission pole damage threat.',
    expectedStrategy: 'Switch to islanding readiness: charge batteries to $\\ge 85\\%$ SOC immediately and hold reserve capacity.',
    stressFactor: 'Severe storm alert / Islanding prep',
    apply: (current) => ({
      ...current,
      weather: { ...current.weather, condition: 'severe_storm', stormAlert: true, windSpeedMs: 18.5 },
    }),
  },
  {
    id: 'SCEN-12',
    num: 12,
    name: 'Low Solar + Zero Wind Night Peak',
    category: 'DEMAND_SPIKE',
    description: 'Evening hours (20:30): Solar is 0 MW, stagnant air keeps wind at 8 MW, while industrial loads are at baseline 150 MW.',
    expectedStrategy: 'Coordinated battery discharge across BESS-01 and BESS-02; import remainder from grid or trigger DR if prices exceed $120.',
    stressFactor: 'Renewables only 8 MW total',
    apply: (current) => ({
      ...current,
      solarFarms: current.solarFarms.map((s) => ({
        ...s,
        currentOutputMw: 0,
        forecast15minMw: 0,
        forecast1hrMw: 0,
      })),
      windFarms: current.windFarms.map((w) => ({
        ...w,
        currentOutputMw: w.capacityMw * 0.05,
        windSpeedMs: 1.5,
      })),
      market: {
        ...current.market,
        spotPriceUsdPerMwh: 125.0,
        priceTrend: 'rising',
      },
      grid: {
        ...current.grid,
        totalRenewableMw: 10.0,
      },
    }),
  },
  {
    id: 'SCEN-13',
    num: 13,
    name: 'BESS-Alpha Low State of Charge (13% SOC)',
    category: 'ASSET_FAILURE',
    description: 'BESS-Alpha has discharged down to 13%, right at its 12% emergency floor limit.',
    expectedStrategy: 'Inhibit any further discharge on BESS-01 to prevent cell degradation; direct generation to maintain critical reserves.',
    stressFactor: 'BESS-01 SOC at 13.0%',
    apply: (current) => ({
      ...current,
      batteries: current.batteries.map((b) =>
        b.id === 'BESS-01' ? { ...b, currentSocPct: 13.0 } : b,
      ),
    }),
  },
  {
    id: 'SCEN-14',
    num: 14,
    name: 'Midday Solar Glut & Transmission Export Ceiling',
    category: 'GRID_CONGESTION',
    description: 'Solar farms generating at 100% capacity (200 MW) while local load is 110 MW; transmission lines are near thermal limits.',
    expectedStrategy: 'Absorb surplus into storage until batteries reach 92%; curtail excess solar generation systematically.',
    stressFactor: 'Solar 200 MW + Export capped',
    apply: (current) => ({
      ...current,
      solarFarms: current.solarFarms.map((s) => ({
        ...s,
        currentOutputMw: s.capacityMw,
      })),
      interties: current.interties.map((i) => ({
        ...i,
        currentFlowMw: i.limitMw * 0.95,
      })),
    }),
  },
  {
    id: 'SCEN-15',
    num: 15,
    name: 'High Carbon Tax Escalation ($120/ton CO2)',
    category: 'MARKET_VOLATILITY',
    description: 'Regulatory carbon tariff increases to $120.00/tCO2, making grid imports highly punitive economically.',
    expectedStrategy: 'Strict zero-curtailment policy, prioritizing clean power over all market imports.',
    stressFactor: 'Carbon price $120/ton',
    apply: (current) => ({
      ...current,
      market: { ...current.market, carbonPriceUsdPerTon: 120.0 },
    }),
  },
  {
    id: 'SCEN-16',
    num: 16,
    name: 'Lucrative Demand Response Incentive ($180/MWh)',
    category: 'MARKET_VOLATILITY',
    description: 'Grid operator offers peak DR incentive bonus ($180/MWh) for voluntary industrial load reduction.',
    expectedStrategy: 'Trigger flexible load shedding across Apex Steel, HyperScale Data Center, and Pacific Chemical to capture incentive payouts.',
    stressFactor: 'DR incentive $180/MWh',
    apply: (current) => ({
      ...current,
      market: { ...current.market, drIncentiveUsdPerMwh: 180.0 },
    }),
  },
  {
    id: 'SCEN-17',
    num: 17,
    name: 'Line South Planned Maintenance Outage',
    category: 'GRID_CONGESTION',
    description: 'Scheduled breaker servicing on Intertie South 230kV reduces total grid interconnection capacity from 270 MW to 150 MW.',
    expectedStrategy: 'Constrain maximum export to Line North 150 MW limit; manage local generation and storage balance.',
    stressFactor: 'Intertie South offline',
    apply: (current) => ({
      ...current,
      interties: current.interties.map((i) =>
        i.id === 'LINE-SOUTH'
          ? { ...i, currentFlowMw: 0, limitMw: 0, congested: true }
          : i,
      ),
    }),
  },
  {
    id: 'SCEN-18',
    num: 18,
    name: 'Steep Duck-Curve Dusk Ramp',
    category: 'DEMAND_SPIKE',
    description: 'Sunset arrives as residential and commercial loads rise; solar drops by 120 MW in 30 minutes.',
    expectedStrategy: 'Pre-position BESS to ramp up discharge smoothly, matching the negative derivative of solar output.',
    stressFactor: 'Solar dropping -4 MW/min',
    apply: (current) => ({
      ...current,
      solarFarms: current.solarFarms.map((s) => ({
        ...s,
        currentOutputMw: s.capacityMw * 0.15,
        forecast15minMw: 0,
      })),
      market: { ...current.market, spotPriceUsdPerMwh: 88.0, priceTrend: 'rising' },
    }),
  },
  {
    id: 'SCEN-19',
    num: 19,
    name: 'Dual BESS Asymmetric SOC Rebalancing',
    category: 'ASSET_FAILURE',
    description: 'BESS-Alpha is at 91% SOC (near full) while BESS-Beta is at 24% SOC (near empty).',
    expectedStrategy: 'Prefer BESS-Alpha for discharge tasks and prioritize BESS-Beta for charging to equalize fleet health.',
    stressFactor: 'BESS SOC divergence: 91% vs 24%',
    apply: (current) => ({
      ...current,
      batteries: [
        { ...current.batteries[0], currentSocPct: 91.0 },
        { ...current.batteries[1], currentSocPct: 24.0 },
      ],
    }),
  },
  {
    id: 'SCEN-20',
    num: 20,
    name: 'HyperScale Data Center Batch Job Shed',
    category: 'DEMAND_SPIKE',
    description: 'HyperScale Data Center flags 8 MW of flexible batch AI training workloads ready for immediate shedding.',
    expectedStrategy: 'Incorporate 8 MW demand reduction into energy balance to avoid firing fossil peaker units on the grid.',
    stressFactor: 'Data Center 8 MW shed available',
    apply: (current) => ({
      ...current,
      consumers: current.consumers.map((c) =>
        c.id === 'IND-02' ? { ...c, flexibleDemandMw: 8 } : c,
      ),
    }),
  },
  {
    id: 'SCEN-21',
    num: 21,
    name: 'Extreme Heatwave Ambient 43°C Derating',
    category: 'WEATHER_SURGE',
    description: 'Summer heatwave ambient temperature reaches 43°C. Inverter efficiency derates by 10% and battery thermal cooling loads rise.',
    expectedStrategy: 'Derate maximum battery charge/discharge rates by 15% to keep cell temperatures safely below 45°C.',
    stressFactor: 'Ambient 43°C (thermal derating)',
    apply: (current) => ({
      ...current,
      weather: { ...current.weather, temperatureC: 43.0 },
      batteries: current.batteries.map((b) => ({ ...b, tempC: 38.5 })),
    }),
  },
  {
    id: 'SCEN-22',
    num: 22,
    name: 'Microgrid Emergency Islanding Readiness Drill',
    category: 'FREQUENCY_EVENT',
    description: 'Utility ISO conducts unannounced islanding readiness verification for the renewable substation.',
    expectedStrategy: 'Enforce minimum 35% BESS reserve capacity and guarantee zero reliance on external interties.',
    stressFactor: 'Islanding drill active',
    apply: (current) => ({
      ...current,
      grid: { ...current.grid, inertiaScore: 92.0 },
    }),
  },
  {
    id: 'SCEN-23',
    num: 23,
    name: 'Sub-Zero Freeze & Turbine Blade Icing Risk',
    category: 'WEATHER_SURGE',
    description: 'Freezing rain causes aerodynamic profile degradation on Coastal Breeze and Ridge Crest wind farms.',
    expectedStrategy: 'Derate wind output projections by 25% and verify heating element draw on auxiliary circuits.',
    stressFactor: 'Blade icing risk (wind derating)',
    apply: (current) => ({
      ...current,
      weather: { ...current.weather, condition: 'partly_cloudy', temperatureC: -4.5 },
      windFarms: current.windFarms.map((w) => ({
        ...w,
        currentOutputMw: w.currentOutputMw * 0.75,
      })),
    }),
  },
  {
    id: 'SCEN-24',
    num: 24,
    name: 'Optimal Nominal Baseline (Clear Sky & Steady Wind)',
    category: 'MARKET_VOLATILITY',
    description: 'Nominal operating conditions: 23°C, 9.4 m/s steady wind, clear skies, standard $48.50/MWh price, nominal 50.01 Hz frequency.',
    expectedStrategy: 'Balanced economic dispatch with minimal degradation, high renewable utilization, and modest grid export.',
    stressFactor: 'Nominal baseline (steady state)',
    apply: (current) => ({
      ...current,
      weather: {
        condition: 'partly_cloudy',
        cloudCoverPct: 20,
        windSpeedMs: 9.4,
        stormAlert: false,
        temperatureC: 23.5,
      },
      grid: {
        ...current.grid,
        frequencyHz: 50.01,
        frequencyStatus: 'nominal',
      },
      market: {
        spotPriceUsdPerMwh: 48.5,
        forecastPrice1hr: 52.0,
        carbonPriceUsdPerTon: 45.0,
        drIncentiveUsdPerMwh: 85.0,
        priceTrend: 'stable',
      },
      batteries: current.batteries.map((b) => ({
        ...b,
        status: 'idle',
        tempC: 25.0,
      })),
    }),
  },
];
