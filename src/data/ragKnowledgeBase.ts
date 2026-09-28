import { RAGDocument } from '../types/orchestrator';

export const ragKnowledgeBase: RAGDocument[] = [
  {
    id: 'RAG-ASSET-01',
    title: 'BESS-01 Alpha: Lithium Iron Phosphate (LFP) Operational Limits',
    category: 'ASSET_SPEC',
    summary: 'Technical operating boundaries, C-rate, thermal derating, and cycle life characteristics of 50 MW / 200 MWh LFP storage.',
    content: `Chemistry: LiFePO4 (Lithium Iron Phosphate)
Rated Power: 50.0 MW continuous (1.0C rating: 50 MW for 4 hours)
Nameplate Capacity: 200.0 MWh
Roundtrip AC Efficiency: 92.4% at 0.5C, 89.8% at 1.0C
Recommended Operational SOC Range: 12.0% - 95.0%
Emergency Frequency Reserve Floor: 15.0% SOC
Degradation Factor: 0.00015% capacity fade per full equivalent cycle
Thermal Limits:
- Nominal: 20°C - 30°C
- Cooling Active: > 35°C
- Derate Power 25%: > 45°C
- Hard Trip / Lockout: > 55°C
Cycling Guideline: LFP tolerates higher cycle depth and frequency regulation cycling compared to NMC. Ideal for frequent daily peak shaving and arbitrage.`,
    relevanceTags: ['BESS-01', 'LFP', 'battery', 'efficiency', 'degradation', 'soc'],
  },
  {
    id: 'RAG-ASSET-02',
    title: 'BESS-02 Beta: Nickel Manganese Cobalt (NMC) Characteristics & Degradation',
    category: 'ASSET_SPEC',
    summary: 'Higher energy density NMC battery parameters (40 MW / 160 MWh), strict temperature boundaries, and degradation penalty.',
    content: `Chemistry: LiNiMnCoO2 (NMC 811)
Rated Power: 40.0 MW continuous
Nameplate Capacity: 160.0 MWh
Roundtrip AC Efficiency: 88.2%
Recommended Operational SOC Range: 15.0% - 92.0%
Emergency Frequency Reserve Floor: 20.0% SOC
Degradation Factor: 0.00022% capacity fade per equivalent cycle (1.46x higher wear than LFP)
Thermal Sensitivities: Highly sensitive to calendar aging at high SOC (> 90%) in elevated ambient temperatures.
Operational Rule: Reserve BESS-02 for high-margin market spikes, steep demand ramps, or severe emergency reserve support. Avoid excessive shallow micro-cycling to preserve asset life.`,
    relevanceTags: ['BESS-02', 'NMC', 'battery', 'degradation', 'thermal'],
  },
  {
    id: 'RAG-ASSET-03',
    title: 'Solar Generation Fleet: Tracking, Inverter Clipping, and Temperature Derating',
    category: 'ASSET_SPEC',
    summary: 'Technical specifications for 5 solar farms (200 MW aggregate) including tracking mechanisms and temperature coefficients.',
    content: `Solar Portfolio Aggregate: 200 MW peak DC capacity across 5 utility sites:
1. Desert Sun (50 MW): Single-axis tracking, bifacial monocrystalline, temperature coefficient -0.34%/°C above 25°C.
2. Solaria West (45 MW): Single-axis tracking, bifacial, inverter loading ratio 1.25.
3. Valley Light (35 MW): Fixed-tilt 22° south-facing, standard utility inverter.
4. Mesa Horizon (40 MW): Single-axis tracking, high irradiance desert location.
5. High Plains (30 MW): Fixed-tilt 18°, high altitude, cooler ambient conditions.
Curtailment Response Time: Fast active power curtailment capability via inverter setpoint commands in < 2.5 seconds. Complies with IEEE 1547-2018 fast-ramping requirements.`,
    relevanceTags: ['solar', 'Desert Sun', 'Solaria', 'curtailment', 'inverter'],
  },
  {
    id: 'RAG-ASSET-04',
    title: 'Wind Generation Fleet: Cut-In, Cut-Out, and Aerodynamic Gust Control',
    category: 'ASSET_SPEC',
    summary: 'Operating parameters for 3 wind farms (200 MW total): Ridge Crest, Columbia Gorge, and Coastal Breeze.',
    content: `Wind Portfolio Aggregate: 200 MW rated capacity:
1. Ridge Crest (60 MW): 20x 3.0 MW turbines, cut-in 3.5 m/s, rated 11.5 m/s, cut-out 25.0 m/s.
2. Columbia Gorge (75 MW): 25x 3.0 MW turbines with storm gust pitch regulation up to 26.0 m/s.
3. Coastal Breeze (65 MW): 22x 2.95 MW turbines with maritime salt protection.
Safety Rules:
- Proactive pitch control must commence when sustained 10-minute average wind exceeds 22.0 m/s.
- Total mechanical cutout occurs at 25.0 m/s. Sudden cutout causes rapid power loss; batteries should pre-ramp if gust alerts trigger.`,
    relevanceTags: ['wind', 'turbines', 'gust', 'cut-out', 'storm'],
  },
  {
    id: 'RAG-REG-01',
    title: 'IEEE 1547-2018: Interconnection & Interoperability of Distributed Energy Resources',
    category: 'REGULATORY_STANDARD',
    summary: 'Mandatory standard for frequency droop response, active power curtailment, and anti-islanding protection.',
    content: `Mandates for DER and Utility Energy Storage:
1. Frequency Response (Category III):
   - Over-Frequency: When frequency exceeds 50.10 Hz (nominal 50.0 Hz), resources must decrease active power output with a droop curve of 5% (or charge batteries).
   - Under-Frequency: When frequency drops below 49.90 Hz, resources must increase active power output (discharge batteries) within 500 milliseconds.
2. Anti-Islanding Protection: Substation breaker trips must cease energizing de-energized grid circuits within 2.0 seconds unless microgrid islanding mode has been formally coordinated.
3. Power Quality: Total harmonic distortion (THD) < 5.0% at point of common coupling (PCC).`,
    relevanceTags: ['IEEE-1547', 'frequency', 'droop', 'regulatory', 'safety'],
  },
  {
    id: 'RAG-REG-02',
    title: 'FERC Order 888 & NERC BAL-001: Transmission Congestion and Balance Requirements',
    category: 'REGULATORY_STANDARD',
    summary: 'Open access transmission tariffs, firm transmission rights, and real-time tie-line flow limits.',
    content: `Transmission Enforcement Protocol:
- Intertie lines have physical thermal ratings (MVA) and system operating limits (SOL).
- Line North (150 MW limit): Violating 98% of thermal limit triggers immediate congestion alarms. Exceeding 100% (150 MW) for more than 15 minutes incurs severe NERC non-compliance penalties ($25,000/hr) and risks transmission protective relay trips.
- In congested scenarios, priority order: (1) Local battery charging, (2) Demand response load addition, (3) Generation curtailment.`,
    relevanceTags: ['FERC', 'NERC', 'transmission', 'congestion', 'interties'],
  },
  {
    id: 'RAG-HIST-01',
    title: 'Historical Case: Heatwave Afternoon Peak Price Spike (July 2025 Replay)',
    category: 'HISTORICAL_CASE',
    summary: 'Analysis of decision ORH-20250718: Aggressive BESS discharge during $395/MWh spike generated $28,400 net savings in 1 hour.',
    content: `Context: High ambient temperature (39°C), regional spot price jumped from $52 to $395/MWh.
Action Taken:
- BESS-Alpha discharged 45 MW; BESS-Beta discharged 35 MW.
- Total portfolio exported 62 MW to the wholesale grid.
- Apex Steel flexible furnace load was reduced by 12 MW via Demand Response.
Outcome:
- Net economic benefit: +$28,400 in 60 minutes.
- Battery SOC dropped from 78% to 32% (well above 15% reserve floor).
- Zero carbon penalty incurred.
Key Takeaway: Early dispatch ahead of peak price plateau yields maximum margin without risking reserve depletion.`,
    relevanceTags: ['historical', 'heatwave', 'price spike', 'arbitrage', 'BESS discharge'],
  },
  {
    id: 'RAG-HIST-02',
    title: 'Historical Case: Negative Pricing Wind Ramp Event (November 2025 Replay)',
    category: 'HISTORICAL_CASE',
    summary: 'Analysis of decision ORH-20251104: Coordinated BESS charging absorbed 72 MWh of -$22/MWh negative power.',
    content: `Context: Nocturnal wind storm pushed regional generation to 125% of load; ISO market price plunged to -$22/MWh.
Action Taken:
- Both batteries switched to maximum charging (-50 MW and -40 MW).
- Paid to consume 90 MW from the market while absorbing full wind farm production.
- Batteries charged from 25% to 88% SOC.
Outcome:
- Avoided $3,800 in generation curtailment penalties while receiving $1,980 payment for charging from the grid.
- Stored energy was discharged the following morning at $65/MWh peak.`,
    relevanceTags: ['negative price', 'wind storm', 'charging', 'historical', 'arbitrage'],
  },
  {
    id: 'RAG-ANOM-01',
    title: 'Anomaly Pattern: Rapid Cloud Front Ramp Signature',
    category: 'ANOMALY_SIGNATURE',
    summary: 'Predictive signature for abrupt solar collapse (> 50 MW loss in < 10 min) and recommended pre-positioning.',
    content: `Detection Criteria:
1. Pyranometer sensor delta: Downward slope exceeding -35 W/m² per minute.
2. Satellite cloud cover forecast delta > +40% in current 15-minute horizon.
3. Rapid drop in PV inverter DC link voltage.
Mitigation Protocol:
- Pre-position battery power converters in active hot-standby (zero ramp latency).
- Pre-notify flexible industrial consumers of possible DR dispatch within 15 minutes.
- Inhibit discretionary export contracts on Intertie South.`,
    relevanceTags: ['anomaly', 'cloud', 'solar ramp', 'pre-positioning'],
  },
  {
    id: 'RAG-ANOM-02',
    title: 'Anomaly Pattern: Under-Frequency Grid Droop Precursor',
    category: 'ANOMALY_SIGNATURE',
    summary: 'Early warning indicators of grid frequency instability (< 49.85 Hz) and synthetic inertia dispatch.',
    content: `Threshold Rules:
- df/dt (RoCoF) < -0.12 Hz/second indicates sudden regional generation loss.
- Immediate autonomous trigger: Fast Frequency Response (FFR) must inject active power within 250 milliseconds.
- Mandatory Action: Inhibit all battery charging immediately; switch BESS inverters to grid-forming droop mode.`,
    relevanceTags: ['anomaly', 'frequency droop', 'RoCoF', 'FFR', 'inertia'],
  },
];
