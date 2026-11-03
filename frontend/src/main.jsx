import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { createRoot } from 'react-dom/client'

import {

  Activity, BarChart3, Bot, ChevronDown, Cpu, Gauge, Leaf, Play,

  Power, RefreshCw, RotateCcw, Server, Settings, ShieldCheck, Square,

  Thermometer, Zap, History, LayoutDashboard, SlidersHorizontal, AlertTriangle, Search, ExternalLink, MonitorCog

} from 'lucide-react'

import {

  Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer,

  Legend, ReferenceLine, Tooltip, XAxis, YAxis

} from 'recharts'

import './styles.css'



const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api'



async function api(path, options = {}) {

  const res = await fetch(`${API}${path}`, {

    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },

    ...options,

  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)

  return data

}



function toLocalDate(value) {
  if (!value) return new Date(NaN)
  const raw = String(value)
  // Backend simulator timestamps are naive UTC; parse them as UTC, then display local time.
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`)
}

function fmt(value, digits = 0) {

  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'N/A'

  return Number(value).toFixed(digits)

}



function pct(oldValue, newValue, lowerIsBetter = true) {

  if (!oldValue || newValue === undefined || newValue === null) return null

  const change = ((Number(oldValue) - Number(newValue)) / Number(oldValue)) * 100

  return lowerIsBetter ? change : -change

}



function SimulationDashboard() {

  const [data, setData] = useState(null)
  const [environmentMonitor, setEnvironmentMonitor] = useState(null)
  const [environmentScanning, setEnvironmentScanning] = useState(false)

  const [error, setError] = useState('')

  const [busy, setBusy] = useState(false)

  const [metric, setMetric] = useState('power')

  const [range, setRange] = useState(30)

  const initialPage = ['dashboard','optimization','quality','alerts','hardware','settings','sustainability','fleet','workloads','analytics','workspace'].includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : 'dashboard'
  const [activeNav, setActiveNav] = useState(initialPage)
  const [activePage, setActivePage] = useState(initialPage)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)

  const [settingsOpen, setSettingsOpen] = useState(false)

  const [interval, setIntervalValue] = useState(1)

  const [benchmark, setBenchmark] = useState(null)
  const [benchmarkLoading, setBenchmarkLoading] = useState(false)
  const [quality, setQuality] = useState(null)
  const [qualityHistory, setQualityHistory] = useState([])

  const [qualityThreshold, setQualityThreshold] = useState(2)
  const [anomalyToast, setAnomalyToast] = useState(null)
  const [simulationNotice, setSimulationNotice] = useState('')
  const lastAlertKey = useRef(null)



  const refresh = useCallback(async () => {

    try {

      const next = await api('/dashboard')
      setData(next)
      // Keep the TinyFish monitor independent so a missing API key never breaks the main dashboard.
      try { setEnvironmentMonitor(await api('/environment/monitor')) } catch { /* optional panel */ }
      setError('')

    } catch (err) {

      setError(err.message)

    }

  }, [])



  useEffect(() => {
    const syncRoute = () => {
      const key = window.location.hash.slice(1)
      const next = ['dashboard','optimization','quality','alerts','hardware','settings','sustainability','fleet','workloads','analytics','workspace'].includes(key) ? key : 'dashboard'
      setActivePage(next)
      setActiveNav(next)
    }
    window.addEventListener('hashchange', syncRoute)
    return () => window.removeEventListener('hashchange', syncRoute)
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 1200)
    return () => clearInterval(id)
  }, [refresh])

  useEffect(() => {
    const anomaly = data?.anomaly
    if (!anomaly || anomaly.status !== 'DETECTED' || !anomaly.last_detected_at) return
    const alertKey = `${anomaly.last_detected_at}-${(anomaly.sample_ids || []).slice(-1)[0] || ''}`
    if (lastAlertKey.current === alertKey) return
    lastAlertKey.current = alertKey
    const detectedAt = toLocalDate(anomaly.last_detected_at)
    const timeText = Number.isNaN(detectedAt.getTime())
      ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : detectedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setAnomalyToast({ key: alertKey, text: `Anomaly detected at this time: ${timeText}` })
  }, [data?.anomaly?.status, data?.anomaly?.last_detected_at, (data?.anomaly?.sample_ids || []).slice(-1)[0]])

  useEffect(() => {
    if (!anomalyToast?.key) return
    const key = anomalyToast.key
    const timeout = setTimeout(() => setAnomalyToast(current => current?.key === key ? null : current), 6000)
    return () => clearTimeout(timeout)
  }, [anomalyToast?.key])



  const run = async fn => {

    setBusy(true)

    setError('')

    try {

      await fn()

      await refresh()

    } catch (err) {

      setError(err.message)

    } finally {

      setBusy(false)

    }

  }



  const start = () => run(() => api(`/simulation/start?tick_interval_s=${interval}`, { method: 'POST' }))

  const stop = () => run(() => api('/simulation/stop', { method: 'POST' }))

  const reset = () => run(() => api('/simulation/reset', { method: 'POST' }))

  const scanEnvironment = () => run(async () => {
    setEnvironmentScanning(true)
    try {
      const result = await api('/environment/scan', { method: 'POST' })
      setEnvironmentMonitor(result)
    } finally {
      setEnvironmentScanning(false)
    }
  })

  const triggerAnomalySpike = () => run(async () => {
    if (!data?.simulation?.running) {
      await api(`/simulation/start?tick_interval_s=${interval}`, { method: 'POST' })
    }
    const result = await api('/simulation/spike', {
      method: 'POST',
      body: JSON.stringify({ peak_rate: 1450, spike_duration_ticks: 6, peak_hold_ticks: 3, trigger_type: 'anomaly' }),
    })
    setSimulationNotice('')
  })

  const triggerManualSpike = () => run(async () => {
    if (!data?.simulation?.running) {
      await api(`/simulation/start?tick_interval_s=${interval}`, { method: 'POST' })
    }
    const result = await api('/simulation/spike', {
      method: 'POST',
      body: JSON.stringify({ peak_rate: 1325, spike_duration_ticks: 8, peak_hold_ticks: 4, trigger_type: 'manual' }),
    })
    setSimulationNotice(result.message || 'Manual workload spike triggered.')
  })


  const runBenchmark = async () => {
    setBenchmarkLoading(true)
    setError('')
    try { setBenchmark(await api('/benchmark')) }
    catch (err) { setError(err.message) }
    finally { setBenchmarkLoading(false) }
  }

  const evaluateQuality = () => run(async () => {
    const result = await api('/quality/evaluate', { method: 'POST', body: JSON.stringify({ reference_precision: 'FP16', candidate_precision: 'INT8', allowed_degradation_pct: Number(qualityThreshold) }) })
    setQuality(result)
    setQualityHistory(items => [{ id: `${Date.now()}`, result: result.result || 'UNKNOWN', degradation: result.quality_degradation_percentage_points, threshold: result.allowed_degradation_percentage_points, reason: result.reason, evaluatedAt: new Date().toISOString() }, ...items].slice(0, 10))
  })

  const toggleAutopilot = () => run(() =>

    data?.autonomous_mode?.enabled

      ? api('/autopilot/stop', { method: 'POST' })

      : api('/autopilot/start?interval_s=2', { method: 'POST' })

  )



  const history = data?.history || []

  const visibleHistory = useMemo(() => {

    const seconds = range * 60

    return history.slice(-Math.max(2, Math.min(history.length, seconds)))

  }, [history, range])



  const chartData = useMemo(() => {

    const applied = (data?.recent_events || [])

      .filter(e => e.type === 'configuration_applied' || e.event === 'configuration_applied')

      .slice(-1)[0]

    const appliedAt = applied ? toLocalDate(applied.timestamp).getTime() : null
    const anomalyIds = new Set(data?.anomaly?.sample_ids || [])

    return visibleHistory.map(s => {

      const ts = toLocalDate(s.timestamp).getTime()

      const row = {

        timestamp: s.timestamp,

        time: toLocalDate(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),

        power: Number(s.total_power),

        temperature: Number(s.temperature),

        utilization: Number(s.gpu_utilization),

        requestRate: Number(s.request_rate),

        throughput: Number(s.throughput),
        isAnomaly: anomalyIds.has(s.sample_id),

      }
      row.anomalyMetric = row.isAnomaly ? row[metric === 'power' ? 'power' : 'temperature'] : null
      row.anomalyPower = row.isAnomaly ? row.power : null
      row.anomalyTemperature = row.isAnomaly ? row.temperature : null

      row.before = appliedAt && ts >= appliedAt ? null : row[metric]

      row.after = appliedAt && ts >= appliedAt ? row[metric] : null
      row.beforePower = appliedAt && ts >= appliedAt ? null : row.power
      row.afterPower = appliedAt && ts >= appliedAt ? row.power : null
      row.beforeTemperature = appliedAt && ts >= appliedAt ? null : row.temperature
      row.afterTemperature = appliedAt && ts >= appliedAt ? row.temperature : null

      return row

    })

  }, [visibleHistory, data, metric])



  const eventMarkers = useMemo(() => {

    const ids = new Set()

    return (data?.recent_events || []).filter(e => {

      const key = `${e.timestamp}-${e.type}`

      if (ids.has(key)) return false

      ids.add(key)

      const ts = toLocalDate(e.timestamp).getTime()

      return chartData.length && ts >= toLocalDate(chartData[0].timestamp).getTime()

    })

  }, [data, chartData])



  const telemetry = data?.telemetry

  const opt = data?.optimization

  const current = opt?.current_configuration

  const recommended = opt?.recommended_configuration

  const impact = opt?.expected_impact?.changes || {}

  const slaPass = data?.sla?.status === 'PASS'
  const slaStatusAvailable = ['PASS', 'FAIL'].includes(data?.sla?.status)
  const p95Latency = Number(telemetry?.latency_p95_ms)
  const p95Limit = Number(data?.sla?.configuration?.max_latency_ms)
  const p95Available = Number.isFinite(p95Latency) && p95Latency >= 0 &&
    Number.isFinite(p95Limit) && p95Limit > 0
  const p95Headroom = p95Available ? p95Limit - p95Latency : null
  const p95UsedPct = p95Available ? (p95Latency / p95Limit) * 100 : null
  // Do not show an overall green SLA state from latency alone: throughput and
  // temperature are also part of the backend's SLA result.
  const p95State = !p95Available || !slaStatusAvailable ? 'unknown' :
    p95Latency > p95Limit ? 'violated' :
    p95Latency >= p95Limit * 0.9 ? 'risk' :
    !slaPass ? 'check' : 'safe'

  const running = data?.simulation?.running

  const auto = data?.autonomous_mode?.enabled
  const lastCycle = data?.autonomous_mode?.last_cycle
  const recommendationApplied = lastCycle?.action === 'APPLIED' &&
    JSON.stringify(lastCycle?.applied_configuration) === JSON.stringify(lastCycle?.recommended_configuration)



  const nav = [
    ['dashboard', 'Dashboard', LayoutDashboard],
    ['optimization', 'Optimization Center', Cpu],
    ['fleet', 'GPU Fleet', Server],
    ['quality', 'Quality Gate', ShieldCheck],
    ['alerts', 'Monitoring & Alerts', Activity],
    ['analytics', 'Analytics & History', History],
    ['settings', 'Settings', SlidersHorizontal],
  ]


  const pageTitles = {
    dashboard: ['Dashboard', 'Live infrastructure health and autonomous optimization'],
    optimization: ['Optimization Center', 'Compare configurations and review optimization impact'],
    quality: ['Quality Gate', 'Validate precision changes against an allowed quality-degradation threshold'],
    alerts: ['SLA & Alerts', 'Telemetry anomaly status and real controller event history'],
    hardware: ['Hardware & Software Monitor', 'Installed inventory and public release checks'],
    settings: ['Settings', 'Simulator cadence, controller status, and SLA configuration'],
    sustainability: ['Sustainability', 'Estimated energy efficiency and thermal impact'],
    fleet: ['GPU Fleet', 'Live infrastructure capacity, GPU health, utilization and workload allocation'],
    workloads: ['AI Workloads', 'Current serving demand, latency, and workload protection'],
    analytics: ['Analytics & History', 'Telemetry trends and recorded controller decisions'],
  }

  const go = (key) => {
    setActiveNav(key)
    if (key === 'fleet') {
      setActivePage('fleet')
      window.location.hash = 'fleet'
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      setActivePage(key)
      window.location.hash = key
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }



  return (

    <div className="app-shell">

      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : 'expanded'}`}>

        <div className="brand">

          <div className="brand-mark"><Leaf size={27} strokeWidth={2.3}/></div>

          <div className="brand-copy"><div className="brand-name">GPUPilot</div><div className="brand-sub">Sustainable AI Infrastructure</div></div>
          

        </div>



        <nav className="side-nav">

          {nav.map(([key, label, Icon]) => (

            <button key={key} title={label} aria-label={label} className={`nav-item ${activeNav === key ? 'active' : ''}`} onClick={() => go(key)}>

              <Icon size={19}/><span>{label}</span>

            </button>

          ))}


        </nav>



        <div className="health-card">
          <div className="sim-controls-label">SIMULATION CONTROLS</div>

          <div className="health-title"><span className={`health-dot ${running ? '' : 'offline'}`}/><strong>{running ? 'System Healthy' : 'Simulation Idle'}</strong></div>

          <p>{running ? 'All services are running' : 'Start the simulator to receive live telemetry'}</p>

          <button className="autonomous-row" onClick={toggleAutopilot} disabled={busy}>

            <Cpu size={17}/><span>Autonomous Mode: <b>{auto ? 'ON' : 'OFF'}</b></span>

            <span className={`toggle ${auto ? 'on' : ''}`}><i/></span>

          </button>

          <button className="side-action primary" title="Start simulation" onClick={start} disabled={busy}><Play size={17} fill="currentColor"/><span className="side-action-label">Start Simulation</span></button>
          <button className="side-action stop" title="Stop simulation" onClick={stop} disabled={busy}><Square size={15}/><span className="side-action-label">Stop Simulation</span></button>

          <button className="side-action warning side-spike-trigger" onClick={triggerAnomalySpike} disabled={busy}><Zap size={17} fill="currentColor"/><span className="side-action-label">Trigger Anomaly Spike</span></button>

          <button className="side-action manual-spike-trigger" onClick={triggerManualSpike} disabled={busy}><Zap size={17}/><span className="side-action-label">Manual Spike</span></button>

          <button className="side-action reset" onClick={reset} disabled={busy}><RotateCcw size={17}/><span className="side-action-label">Reset</span></button>

          <div className="last-run">Last simulation<br/><b>{running ? 'Live' : 'Idle'}</b></div>

        </div>

      </aside>



      <main className={`main-content ${activePage} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`} id="dashboard-top">

        <header className="page-header">

          <div>

            <h1>{pageTitles[activePage]?.[0] || (activePage === 'workspace' ? 'Secondary Workspace' : 'Dashboard')}</h1>

            <p>{pageTitles[activePage]?.[1] || (activePage === 'workspace' ? 'Workloads, decision history, and configuration settings' : 'Live infrastructure health and autonomous optimization')}</p>

          </div>

          <div className="header-status">

            <span className={`system-status ${running ? '' : 'muted'}`}><i/>{running ? 'System Healthy' : 'Simulation Idle'}</span>

            <span className="divider"/>

            <span>{new Date().toLocaleDateString('en-IN', { month:'short', day:'numeric', year:'numeric' })}</span>

            <span>{new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}</span>

          </div>

        </header>

        {activePage === 'optimization' && (
          <section className="benchmark-page">
            <div className="benchmark-hero">
              <div><span className="eyebrow">OPTIMIZATION LAB</span><h2>Scenario Benchmark</h2><p>Compare the current configuration with GPUPilot's best SLA-feasible configuration across four workload conditions.</p></div>
              <button onClick={runBenchmark} disabled={benchmarkLoading}>{benchmarkLoading ? 'Running benchmark…' : 'Run Scenario Benchmark'}</button>
            </div>
            <div className="benchmark-note"><strong>Simulation benchmark</strong><span>Uses steady-state model estimates. It does not change the live simulation or represent measured physical GPU results.</span></div>
            {benchmark?.scenarios?.length ? <div className="benchmark-grid">
              {benchmark.scenarios.map(s => <article className="benchmark-card" key={s.name}>
                <div className="benchmark-card-head"><div><span>{s.name.toUpperCase()} SCENARIO</span><h3>{fmt(s.request_rate)} req/min</h3><p>{s.description}</p></div><b>{s.feasible_candidates} feasible</b></div>
                <div className="benchmark-metrics">
                  <div><small>Power</small><strong>{fmt(s.baseline.power_w,1)} <i>→</i> {fmt(s.optimized.power_w,1)} W</strong><em>{fmt(s.power_change_pct,1)}% change</em></div>
                  <div><small>P95 latency</small><strong>{fmt(s.baseline.p95_latency_ms,1)} <i>→</i> {fmt(s.optimized.p95_latency_ms,1)} ms</strong><em>{s.optimized.sla_status} SLA</em></div>
                  <div><small>Throughput</small><strong>{fmt(s.baseline.throughput_req_min)} <i>→</i> {fmt(s.optimized.throughput_req_min)} req/min</strong><em>Optimized estimate</em></div>
                  <div><small>Energy / 1,000 requests</small><strong>{fmt(s.baseline.energy_wh_per_1000_requests,3)} <i>→</i> {fmt(s.optimized.energy_wh_per_1000_requests,3)} Wh</strong><em>{fmt(s.energy_change_pct,1)}% change</em></div>
                </div>
                <div className="benchmark-card-foot"><span>{s.candidates_considered} candidates · {s.rejected_candidates} filtered</span><span>Selected: {s.configuration.precision} · batch {s.configuration.batch_size} · {s.configuration.gpu_allocation * s.configuration.replicas} GPU(s)</span></div>
              </article>)}
            </div> : <div className="benchmark-empty">Run the benchmark to compare normal, spike, peak and recovery workloads.</div>}
            {benchmark?.disclaimer && <p className="benchmark-disclaimer">{benchmark.disclaimer}</p>}
          </section>
        )}

        {activePage === 'analytics' && (
          <section className="analytics-page">
            <div className="analytics-hero">
              <div><span className="eyebrow">PERFORMANCE INSIGHTS</span><h2>Telemetry Analytics &amp; Decision History</h2><p>Explore GPU performance trends, resource behaviour and optimization decisions recorded by GPUPilot.</p></div>
              <label className="analytics-range">Time range<select value={range} onChange={e => setRange(Number(e.target.value))}><option value="5">Last 5 minutes</option><option value="15">Last 15 minutes</option><option value="30">Last 30 minutes</option><option value="60">Last 1 hour</option></select></label>
            </div>
            <div className="analytics-summary-grid">
              <article className="analytics-stat"><span>Telemetry Samples</span><strong>{visibleHistory.length}</strong><small>Samples in selected range</small></article>
              <article className="analytics-stat"><span>Average GPU Power</span><strong>{visibleHistory.length ? fmt(visibleHistory.reduce((sum,row)=>sum+(Number(row.total_power)||0),0)/visibleHistory.length,1) : '—'} <small>W</small></strong><small>Across recorded samples</small></article>
              <article className="analytics-stat"><span>Average Temperature</span><strong>{visibleHistory.length ? fmt(visibleHistory.reduce((sum,row)=>sum+(Number(row.temperature)||0),0)/visibleHistory.length,1) : '—'} <small>°C</small></strong><small>Across recorded samples</small></article>
              <article className="analytics-stat"><span>Controller Events</span><strong>{(data?.recent_events || []).length}</strong><small>Events currently retained by backend</small></article>
            </div>
            <section className="analytics-card">
              <div className="analytics-card-head"><div><h3><Activity size={17}/> GPU Power Trend</h3><p>Total cluster power consumption over time</p></div><span>{running ? 'LIVE DATA' : 'RECORDED DATA'}</span></div>
              <div className="analytics-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{top:8,right:14,left:0,bottom:0}}><defs><linearGradient id="analyticsPowerFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2684d8" stopOpacity={.22}/><stop offset="100%" stopColor="#2684d8" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 4"/><XAxis dataKey="time" minTickGap={38}/><YAxis/><Tooltip formatter={v=>[`${fmt(v,1)} W`,'GPU Power']}/><Area type="monotone" dataKey="power" stroke="#2684d8" strokeWidth={2} fill="url(#analyticsPowerFill)" isAnimationActive={false}/></AreaChart></ResponsiveContainer></div>
            </section>
            <div className="analytics-chart-grid">
              <section className="analytics-card"><div className="analytics-card-head"><div><h3><Thermometer size={17}/> Temperature Trend</h3><p>Average GPU thermal load</p></div></div><div className="analytics-chart small"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{top:8,right:12,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 4"/><XAxis dataKey="time" minTickGap={35}/><YAxis/><Tooltip formatter={v=>[`${fmt(v,1)} °C`,'Temperature']}/><Line type="monotone" dataKey="temperature" stroke="#e28a32" strokeWidth={2} dot={false} isAnimationActive={false}/></LineChart></ResponsiveContainer></div></section>
              <section className="analytics-card"><div className="analytics-card-head"><div><h3><Zap size={17}/> Request Rate Trend</h3><p>Incoming request volume over time</p></div></div><div className="analytics-chart small"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{top:8,right:12,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 4"/><XAxis dataKey="time" minTickGap={35}/><YAxis/><Tooltip formatter={v=>[`${fmt(v)} req/min`,'Request rate']}/><Line type="monotone" dataKey="requestRate" stroke="#159b75" strokeWidth={2} dot={false} isAnimationActive={false}/></LineChart></ResponsiveContainer></div></section>
            </div>
            <section className="analytics-card analytics-history-card">
              <div className="analytics-card-head"><div><h3><History size={17}/> Optimization &amp; Controller History</h3><p>Recorded actions, configuration changes and simulator events</p></div><span>{(data?.recent_events || []).length} EVENTS</span></div>
              <div className="analytics-history-list">
                {(data?.recent_events || []).slice().reverse().map((event,i)=><article className="analytics-history-row" key={`${event.timestamp}-${i}`}><span className={`analytics-history-dot ${event.type || ''}`}/><div><strong>{event.title || String(event.event || 'System event').replaceAll('_',' ')}</strong><p>{event.message || 'No additional details recorded.'}</p></div><time>{event.timestamp ? toLocalDate(event.timestamp).toLocaleString() : '—'}</time></article>)}
                {!data?.recent_events?.length && <div className="analytics-empty">No controller history is available yet. Start the simulator to record telemetry and optimization events.</div>}
              </div>
            </section>
          </section>
        )}

        {activePage === 'alerts' && (
          <section className="monitoring-page">
            <div className="monitoring-hero">
              <div><span className="eyebrow">SYSTEM OBSERVABILITY</span><h2>SLA &amp; Alert Center</h2><p>Track service-level compliance, telemetry anomalies and recent controller events in one place.</p></div>
              <span className={`monitoring-overall ${slaPass ? 'healthy' : slaStatusAvailable ? 'attention' : 'unknown'}`}><i/>{!slaStatusAvailable ? 'Awaiting SLA data' : slaPass ? 'SLA Compliant' : 'SLA Breached'}</span>
            </div>
            <div className="monitoring-summary-grid">
              <article className={`monitoring-stat ${p95State}`}><span>P95 Latency</span><strong>{p95Available ? fmt(p95Latency,1) : '—'} <small>ms</small></strong><p>Configured limit: {Number.isFinite(p95Limit) ? fmt(p95Limit,1) + ' ms' : 'Not available'}</p></article>
              <article className="monitoring-stat"><span>Throughput</span><strong>{fmt(telemetry?.throughput ?? telemetry?.request_rate)} <small>req/min</small></strong><p>Live serving throughput</p></article>
              <article className="monitoring-stat"><span>GPU Temperature</span><strong>{fmt(telemetry?.temperature,1)} <small>°C</small></strong><p>Current average temperature</p></article>
              <article className="monitoring-stat"><span>Telemetry Anomaly</span><strong className="monitoring-anomaly-value">{data?.anomaly?.status || 'WAITING'}</strong><p>{data?.anomaly?.severity ? `Severity: ${data.anomaly.severity}` : 'Anomaly detector status'}</p></article>
            </div>
            <div className="monitoring-content-grid">
              <section className="monitoring-card">
                <div className="monitoring-card-head"><div><h3><ShieldCheck size={17}/> SLA Compliance</h3><p>Backend-reported service-level evaluation</p></div><span className={`monitoring-result-pill ${slaPass ? 'pass' : slaStatusAvailable ? 'fail' : 'pending'}`}>{data?.sla?.status || 'PENDING'}</span></div>
                <div className="monitoring-sla-row"><span>P95 latency</span><strong>{p95Available ? `${fmt(p95Latency,1)} / ${fmt(p95Limit,1)} ms` : 'No data'}</strong><span className={p95State}>{p95State.toUpperCase()}</span></div>
                <div className="monitoring-sla-row"><span>Minimum throughput</span><strong>{fmt(data?.sla?.configuration?.min_throughput_req_min)} req/min</strong><span>{telemetry?.throughput != null || telemetry?.request_rate != null ? 'LIVE' : 'NO DATA'}</span></div>
                <div className="monitoring-sla-row"><span>Temperature</span><strong>{fmt(telemetry?.temperature,1)} °C</strong><span>{telemetry?.temperature != null ? 'LIVE' : 'NO DATA'}</span></div>
                <p className="monitoring-footnote">Overall PASS/FAIL is supplied by the backend SLA evaluator. Individual metrics are shown as telemetry context.</p>
              </section>
              <section className="monitoring-card">
                <div className="monitoring-card-head"><div><h3><Activity size={17}/> Telemetry Anomaly</h3><p>Live anomaly detection from the simulator</p></div><span className={`monitoring-result-pill ${data?.anomaly?.status === 'DETECTED' ? 'fail' : data?.anomaly?.status === 'RECOVERING' ? 'pending' : 'pass'}`}>{data?.anomaly?.status || 'WAITING'}</span></div>
                <p className="monitoring-anomaly-reason">{data?.anomaly?.reason || 'Waiting for telemetry samples to establish a baseline.'}</p>
                <div className="monitoring-anomaly-meta"><span>Severity</span><strong>{data?.anomaly?.severity || '—'}</strong></div>
                <div className="monitoring-anomaly-meta"><span>Affected metrics</span><strong>{(data?.anomaly?.metrics || []).join(', ') || 'None reported'}</strong></div>
                <div className="monitoring-anomaly-meta"><span>Last detected</span><strong>{data?.anomaly?.last_detected_at ? toLocalDate(data.anomaly.last_detected_at).toLocaleString() : '—'}</strong></div>
              </section>
            </div>
            <section className="monitoring-card monitoring-events-card">
              <div className="monitoring-card-head"><div><h3><History size={17}/> Recent Alerts &amp; Events</h3><p>Latest events recorded by the simulator and controller</p></div><span className="monitoring-event-count">{(data?.recent_events || []).length} recorded</span></div>
              <div className="monitoring-event-list">
                {(data?.recent_events || []).slice().reverse().slice(0,12).map((event,i) => <article className="monitoring-event" key={`${event.timestamp}-${i}`}><span className={`monitoring-event-dot ${event.type || ''}`}/><div className="monitoring-event-copy"><strong>{event.title || String(event.event || 'System event').replaceAll('_',' ')}</strong><p>{event.message || 'No additional event details supplied.'}</p></div><time>{event.timestamp ? toLocalDate(event.timestamp).toLocaleString() : '—'}</time></article>)}
                {!data?.recent_events?.length && <div className="monitoring-empty">No alerts or controller events recorded yet. Start the simulation to begin monitoring.</div>}
              </div>
            </section>
          </section>
        )}

        {activePage === 'fleet' && (
          <section className="fleet-page">
            <div className="fleet-page-toolbar">
              <div><span className="eyebrow">INFRASTRUCTURE OVERVIEW</span><h2>GPU Resource Pool</h2><p>Live health, utilization and allocation across the simulated GPU cluster.</p></div>
              <span className={`fleet-live-state ${running ? 'online' : 'idle'}`}><i/>{running ? 'Live telemetry' : 'Simulation idle'}</span>
            </div>
            <div className="fleet-kpi-grid">
              <div className="fleet-kpi"><span>Total GPU Capacity</span><strong>{data?.cluster?.gpu_count ?? 5}</strong><small>Devices in resource pool</small></div>
              <div className="fleet-kpi"><span>Active GPUs</span><strong>{(data?.cluster?.gpus || []).filter(g => ['Active','Overloaded'].includes(g.status)).length}</strong><small>Currently serving workloads</small></div>
              <div className="fleet-kpi"><span>Idle GPUs</span><strong>{(data?.cluster?.gpus || []).filter(g => g.status === 'Idle').length}</strong><small>Available for allocation</small></div>
              <div className="fleet-kpi"><span>Cluster Power</span><strong>{fmt((data?.cluster?.gpus || []).reduce((sum,g) => sum + (Number(g.power)||0),0),1)} <small>W</small></strong><small>Combined GPU power draw</small></div>
            </div>
            <div className="fleet-section-heading"><div><h3>GPU Devices</h3><p>Per-device telemetry and resource consumption</p></div><span>{(data?.cluster?.gpus || []).length} / {data?.cluster?.gpu_count ?? 5} reporting</span></div>
            <div className="fleet-device-grid">
              {(data?.cluster?.gpus || []).map(g => {
                const status = g.status || (g.active ? 'Active' : 'Idle')
                const utilization = Math.max(0, Math.min(100, Number(g.utilization) || 0))
                const memoryPct = Math.max(0, Math.min(100, 100 * (Number(g.memory)||0) / (Number(g.memory_capacity)||24)))
                return <article className={`fleet-device-card status-${String(status).toLowerCase()}`} key={g.id}>
                  <div className="fleet-device-head"><div className="fleet-device-icon"><Cpu size={20}/></div><div><strong>{g.id}</strong><span>{g.model || 'GPU accelerator'}</span></div><Pill pass={status === 'Active'}>{status}</Pill></div>
                  <div className="fleet-utilization"><div><span>GPU Utilization</span><strong>{fmt(utilization)}%</strong></div><div className="fleet-progress"><i style={{width:`${utilization}%`}}/></div></div>
                  <div className="fleet-device-metrics">
                    <div><span>Power Draw</span><strong>{fmt(g.power,1)} W</strong></div>
                    <div><span>Temperature</span><strong>{fmt(g.temperature,1)} °C</strong></div>
                    <div><span>Memory Usage</span><strong>{fmt(g.memory,1)} / {fmt(g.memory_capacity,0)} GB</strong></div>
                  </div>
                  <div className="fleet-memory"><div className="fleet-progress"><i style={{width:`${memoryPct}%`}}/></div><span>{fmt(memoryPct)}% memory used</span></div>
                  <div className="fleet-assignment"><span>Assigned Workload</span><strong>{g.workload || 'No workload assigned'}</strong></div>
                </article>
              })}
              {!data?.cluster?.gpus?.length && <div className="empty">Waiting for GPU fleet telemetry. Start the simulator to populate device metrics.</div>}
            </div>
            <div className="fleet-section-heading"><div><h3>Workload Allocation</h3><p>Current demand mapped to the serving cluster</p></div></div>
            <div className="fleet-workload-list">
              {(data?.workloads || []).map(w => <div className="fleet-workload-row" key={w.id}><div className="fleet-workload-name"><strong>{w.name}</strong><span>{w.model}</span></div><div><strong>{fmt(w.requests_per_min)}</strong><span>Requests / min</span></div><div><strong>{fmt(w.latency_ms,0)} ms</strong><span>Latency</span></div><Pill pass={String(w.status || '').includes('Protected')}>{w.status || 'Running'}</Pill></div>)}
              {!data?.workloads?.length && <div className="empty">No active workloads are currently reported.</div>}
            </div>
          </section>
        )}

        {error && <div className="error-banner"><AlertTriangle size={17}/><span>Backend connection: {error}</span><button onClick={refresh}>Retry</button></div>}
        {anomalyToast && <div className="anomaly-toast" role="alert" aria-live="assertive"><AlertTriangle size={16}/><span>{anomalyToast.text}</span><button onClick={() => setAnomalyToast(null)} aria-label="Dismiss alert">×</button></div>}
        {simulationNotice && <div className="simulation-action-notice" role="status"><Zap size={16}/><span>{simulationNotice}</span><button onClick={() => setSimulationNotice('')} aria-label="Dismiss simulation notice">×</button></div>}

        <section className={`anomaly-panel ${data?.anomaly?.status === 'DETECTED' ? 'detected' : data?.anomaly?.status === 'RECOVERING' ? 'recovering' : 'normal'}`} id="sla-anomaly">
          <div className="anomaly-icon"><AlertTriangle size={21}/></div>
          <div className="anomaly-copy">
            <div className="anomaly-title-row"><h2>Telemetry Anomaly Detection</h2><span className={`anomaly-status ${String(data?.anomaly?.status || 'NORMAL').toLowerCase()}`}>{data?.anomaly?.status || 'WAITING'}</span></div>
            <p>{data?.anomaly?.reason || 'Waiting for enough normal telemetry to establish a baseline.'}</p>
            {data?.anomaly?.status !== 'NORMAL' && <small>Detected metrics: {(data?.anomaly?.metrics || []).join(', ') || 'telemetry deviation'} · Severity: {data?.anomaly?.severity || 'warning'}</small>}
          </div>
        </section>

        <section className="panel environment-monitor" id="environment-monitor">
          <div className="panel-header environment-header">
            <div><h2><MonitorCog size={18}/> Hardware &amp; Software Change Monitor</h2><p>TinyFish live release search compared with simulated installed versions</p></div>
            <button className="environment-scan" onClick={scanEnvironment} disabled={busy || environmentScanning}><Search size={15}/>{environmentScanning ? 'Scanning…' : 'Scan for Updates'}</button>
          </div>
          <div className="environment-meta">
            <span className={`environment-connection ${environmentMonitor?.configured ? 'connected' : 'not-connected'}`}><i/>{environmentMonitor?.configured ? 'TinyFish API key configured' : 'TinyFish API key not configured'}</span>
            <span>Inventory: simulated demo values</span>
            {environmentMonitor?.last_scan_at && <span>Last scan: {toLocalDate(environmentMonitor.last_scan_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}</span>}
          </div>
          <div className="environment-inventory">
            {(environmentMonitor?.inventory || []).map(item => <div className="environment-version" key={item.component}><span>{item.component}</span><strong>{item.installed_version}</strong></div>)}
          </div>
          <p className="environment-message">{environmentMonitor?.message || 'Configure TINYFISH_API_KEY in the backend environment, then scan to retrieve live release information.'}</p>
          {environmentMonitor?.findings?.length > 0 && <div className="environment-findings">
            {environmentMonitor.findings.map((finding, index) => <div className={`environment-finding ${finding.status}`} key={`${finding.component}-${index}`}>
              <div className="environment-finding-head"><strong>{finding.component}</strong><span>{finding.status.replaceAll('_', ' ')}</span></div>
              <p>{finding.summary}</p>
              {finding.source_url && <a href={finding.source_url} target="_blank" rel="noreferrer">{finding.source_title || 'Open source'} <ExternalLink size={12}/></a>}
            </div>)}
          </div>}
          <small className="environment-disclaimer">This feature checks public release information only. It does not read or change a physical GPU driver, and update candidates require manual compatibility verification.</small>
        </section>

        <section className="kpi-grid reference-kpis" aria-label="Infrastructure summary">
          <Kpi icon={Power} label="Total GPU Power" value={fmt(telemetry?.total_power, 1)} unit=" W" tone="power" history={chartData} dataKey="power"/>
          <Kpi icon={Thermometer} label="Average Temperature" value={fmt(telemetry?.temperature)} unit=" °C" tone="temperature" history={chartData} dataKey="temperature"/>
          <Kpi icon={Activity} label="Request Rate" value={fmt(telemetry?.request_rate)} unit=" req/min" tone="request" history={chartData} dataKey="requestRate"/>
          <Kpi icon={Activity} label="P95 Latency" value={fmt(telemetry?.latency_p95_ms, 1)} unit=" ms" tone="latency" simple/>
        </section>

        <section className={`p95-sla-strip ${p95State}`} aria-label="P95 SLA headroom">
          <div className="p95-strip-status"><ShieldCheck size={16}/><strong>{p95State === 'safe' ? 'SLA SAFE' : p95State === 'risk' ? 'SLA AT RISK' : p95State === 'check' ? 'SLA CHECK' : p95State === 'violated' ? 'SLA VIOLATED' : 'SLA UNAVAILABLE'}</strong></div>
          <div className="p95-strip-metric p95-current"><span>P95 latency</span><strong>{p95Available ? `${fmt(p95Latency, 1)} ms` : '—'}</strong><small>/ {p95Available ? `${fmt(p95Limit, 1)} ms limit` : 'limit unavailable'}</small></div>
          <div className="p95-strip-metric"><span>Headroom</span><strong>{p95Available ? `${p95Headroom >= 0 ? '' : '−'}${fmt(Math.abs(p95Headroom), 1)} ms` : '—'}</strong></div>
          <div className="p95-strip-meter"><div className="p95-sla-track" role="progressbar" aria-label="P95 latency as a percentage of SLA limit" aria-valuemin="0" aria-valuemax="100" aria-valuenow={p95Available ? Math.max(0, Math.min(100, p95UsedPct)) : 0}><i style={{width: p95Available ? `${Math.max(0, Math.min(100, p95UsedPct))}%` : '0%'}}/></div><small>{p95Available ? `${fmt(p95UsedPct, 1)}% of limit used` : 'Waiting for P95 telemetry and SLA limit'}</small></div>
        </section>

        <section className="reference-optimization" id="ai-controller" aria-label="AI optimization recommendation">
          <div className="reference-config-card current-config">
            <div className="reference-card-heading"><h2>Current Configuration (Before)</h2></div>
            <ConfigBox title="" config={current}/>
          </div>
          <div className="reference-config-card recommended-config">
            <div className="reference-card-heading"><h2>AI Recommended Configuration</h2><span className="recommended-pill">Recommended</span></div>
            <ConfigBox title="" config={recommended} optimized/>
            <div className="reference-apply-state">{recommendationApplied ? 'Recommendation applied by AI controller' : 'Recommendation awaiting application'}</div>
          </div>
          <div className="reference-impact-card">
            <div className="reference-card-heading"><h2>Expected Impact</h2></div>
            <div className="reference-impact-list">
              <ImpactStat label="GPU Power" value={impact?.power_reduction_pct} suffix="%" direction="down"/>
              <ImpactStat label="Temperature" value={impact?.temperature_reduction_c} suffix="°C" direction="down"/>
              <ImpactStat label="Throughput" value={impact?.throughput_change_req_min} suffix=" req/min" direction="up" neutral/>
              <ImpactStat label="SLA Status" value={slaPass ? 'Pass' : 'Check'} sla/>
            </div>
          </div>
          <div className="reference-why-card">
            <div className="reference-card-heading"><h2>Why This Optimization?</h2></div>
            <ol className="reference-reasons">{(opt?.reasons || ['Awaiting optimizer evaluation.']).slice(0,4).map((reason,i) => <li key={i}><span>{i+1}</span><div><strong>{['Lower resource intensity','Improved GPU utilization','Higher serving capacity','SLA-aware changes'][i] || 'Optimizer rationale'}</strong><p>{reason}</p></div></li>)}</ol>

          </div>
        </section>

        <section className="dashboard-charts" aria-label="Before and after optimization telemetry">
          <section className="panel dashboard-chart">
            <div className="dashboard-chart-header"><div><h2>Power</h2><div className="dashboard-chart-subline"><p>Live total GPU power (W)</p><div className="before-after-legend"><span><i className="before-line"/>Before</span><span><i className="after-line"/>After</span></div></div></div><span className="chart-state">{running ? 'LIVE TELEMETRY' : 'LAST RECORDED'}</span></div>
            <div className="dashboard-chart-plot">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{top:5,right:8,left:-18,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 4"/>
                  <XAxis dataKey="time" minTickGap={40}/>
                  <YAxis domain={['auto','auto']}/>
                  <Tooltip formatter={(v)=>[v == null ? 'N/A' : `${fmt(v,1)} W`]}/>
                  <Line type="monotone" dataKey="beforePower" name="Before" stroke="#c94b4b" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false}/>
                  <Line type="monotone" dataKey="afterPower" name="After" stroke="#167bce" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false}/>
                  <Line type="monotone" dataKey="anomalyPower" name="Detected anomaly" stroke="#e03439" strokeWidth={0} dot={{ r: 5, fill: '#e03439', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 7 }} connectNulls={false} isAnimationActive={false}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="panel dashboard-chart">
            <div className="dashboard-chart-header"><div><h2>Temperature</h2><div className="dashboard-chart-subline"><p>GPU thermal load (°C)</p><div className="before-after-legend"><span><i className="before-line"/>Before</span><span><i className="after-line"/>After</span></div></div></div><span className="chart-state">{slaPass ? 'SLA IN RANGE' : 'CHECK SLA'}</span></div>
            <div className="dashboard-chart-plot">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{top:5,right:8,left:-18,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 4"/>
                  <XAxis dataKey="time" minTickGap={40}/>
                  <YAxis domain={['auto','auto']}/>
                  <Tooltip formatter={(v)=>[v == null ? 'N/A' : `${fmt(v,1)} °C`]}/>
                  <Line type="monotone" dataKey="beforeTemperature" name="Before" stroke="#c94b4b" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false}/>
                  <Line type="monotone" dataKey="afterTemperature" name="After" stroke="#167bce" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false}/>
                  <Line type="monotone" dataKey="anomalyTemperature" name="Detected anomaly" stroke="#e03439" strokeWidth={0} dot={{ r: 5, fill: '#e03439', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 7 }} connectNulls={false} isAnimationActive={false}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </section>

        <section className="panel metrics-panel" id="live-monitoring">

          <div className="panel-header">

            <div><h2>GPU Metrics Over Time</h2><p>Live simulator telemetry · 5 simulated GPUs</p></div>

            <select value={range} onChange={e => setRange(Number(e.target.value))}>

              <option value="5">Last 5 minutes</option><option value="15">Last 15 minutes</option>

              <option value="30">Last 30 minutes</option><option value="60">Last 1 hour</option>

            </select>

          </div>

          <div className="chart-toolbar">

            <div className="metric-tabs">

              <button className={metric==='power'?'selected':''} onClick={()=>setMetric('power')}>Power (W)</button>

              <button className={metric==='temperature'?'selected':''} onClick={()=>setMetric('temperature')}>Temperature (°C)</button>

            </div>

            <div className="chart-legend">

              <span><i className="legend before"/>Before Optimization</span>

              <span><i className="legend after"/>After Optimization</span>

              <span><i className="legend target"/>Target</span>

            </div>

          </div>

          <div className="main-chart">

            <ResponsiveContainer width="100%" height="100%">

              <LineChart data={chartData} margin={{top: 10, right: 16, left: 5, bottom: 4}}>

                <CartesianGrid strokeDasharray="3 5"/>

                <XAxis dataKey="time" minTickGap={42}/>

                <YAxis domain={['auto','auto']} tickFormatter={v=>metric==='power'?`${v}`:`${v}°`}/>

                <Tooltip formatter={(v, name)=>[`${fmt(v,1)} ${metric==='power'?'W':'°C'}`, name]}/>

                <Legend verticalAlign="top" height={28} />

                {metric === 'power' && Number.isFinite(Number(opt?.recommended_estimate?.total_power)) && Number(opt?.recommended_estimate?.total_power) > 0 && (
                  <ReferenceLine y={Number(opt.recommended_estimate.total_power)} stroke="#64748b" strokeDasharray="6 5" strokeWidth={2} label={{ value: 'Target', position: 'insideTopRight', fill: '#64748b', fontSize: 11 }} />
                )}

                {metric === 'temperature' && Number.isFinite(Number(data?.sla?.configuration?.max_temperature_c)) && Number(data?.sla?.configuration?.max_temperature_c) > 0 && (
                  <ReferenceLine y={Number(data.sla.configuration.max_temperature_c)} stroke="#64748b" strokeDasharray="6 5" strokeWidth={2} label={{ value: 'Target / SLA limit', position: 'insideTopRight', fill: '#64748b', fontSize: 11 }} />
                )}

                <Line type="linear" name="Before Optimization" dataKey="before" dot={false} stroke="#ef4444" strokeWidth={2.5} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false}/>

                <Line type="linear" name="Detected anomaly" dataKey="anomalyMetric" stroke="#e03439" strokeWidth={0} dot={{ r: 5, fill: '#e03439', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 7 }} connectNulls={false} isAnimationActive={false}/>

                <Line type="linear" name="After Optimization" dataKey="after" dot={false} stroke="#1683ff" strokeWidth={2.5} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false}/>
              {eventMarkers.slice(-4).map((e, i) => {
                const eventTime = toLocalDate(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                return (
                  <ReferenceLine
                    key={`${e.timestamp}-${i}`}
                    x={eventTime}
                    stroke={e.type === 'configuration_applied' ? '#0a9561' : '#e22e35'}
                    strokeDasharray="5 4"
                    label={{ value: e.title, position: 'insideTop', fontSize: 9 }}
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>
          </div>

          <div className="chart-note">

            <span>Dashed target line shows the optimizer's power estimate or the configured temperature SLA limit.</span>

            <span>{data?.simulation?.workload_state?.toUpperCase() || 'N/A'} · {data?.cluster?.active_count ?? '—'} active simulated GPUs</span>

          </div>

        </section>



        {activePage === 'quality' && <section className="quality-page">
          <div className="quality-page-heading">
            <div><span className="quality-eyebrow">MODEL VALIDATION</span><h2>Precision Quality Gate</h2><p>Evaluate whether INT8 maintains acceptable model quality against the FP16 baseline.</p></div>
            <span className={`quality-pill ${quality?.result === 'PASS' ? 'pass' : quality?.result === 'FAIL' ? 'fail' : ''}`}>{quality?.result || 'NOT RUN'}</span>
          </div>
          {error && <div className="error-banner"><AlertTriangle size={17}/><span>Quality evaluation: {error}</span><button onClick={evaluateQuality}>Retry</button></div>}
          <div className="quality-summary-grid">
            <div className="quality-summary-card"><span>Gate status</span><strong className={quality?.result === 'PASS' ? 'quality-good' : quality?.result === 'FAIL' ? 'quality-bad' : ''}>{quality?.result || 'Pending'}</strong><small>{quality ? 'Latest evaluation' : 'Run an evaluation to generate a decision'}</small></div>
            <div className="quality-summary-card"><span>Quality degradation</span><strong>{quality ? `${fmt(quality.quality_degradation_percentage_points, 2)} pp` : '—'}</strong><small>FP16 baseline vs INT8 candidate</small></div>
            <div className="quality-summary-card"><span>Allowed degradation</span><strong>{quality ? `${fmt(quality.allowed_degradation_percentage_points, 2)} pp` : `${fmt(qualityThreshold, 1)} pp`}</strong><small>Configured acceptance threshold</small></div>
          </div>
          <div className="panel quality-evaluation-panel">
            <div className="panel-header"><div><h3>Run Quality Evaluation</h3><p>Uses the existing backend quality evaluation endpoint.</p></div></div>
            <div className="quality-controls">
              <label>Allowed degradation (percentage points)
                <input type="number" min="0" max="100" step="0.1" value={qualityThreshold} onChange={e => setQualityThreshold(e.target.value)} />
              </label>
              <button onClick={evaluateQuality} disabled={busy || qualityThreshold === '' || Number(qualityThreshold) < 0 || Number(qualityThreshold) > 100}>{busy ? 'Evaluating…' : 'Evaluate FP16 → INT8'}</button>
            </div>
          </div>
          <div className="panel quality-checks-panel">
            <div className="panel-header"><div><h3>Validation Checks</h3><p>Checks are populated from the latest backend evaluation.</p></div></div>
            <div className="quality-check-list">
              {[
                {label:'FP16 baseline available',ok:!!quality && Number.isFinite(Number(quality.baseline_quality_score)),detail:quality ? `Baseline score: ${fmt(quality.baseline_quality_score, 2)}` : 'Awaiting evaluation'},
                {label:'INT8 candidate available',ok:!!quality && Number.isFinite(Number(quality.candidate_quality_score)),detail:quality ? `Candidate score: ${fmt(quality.candidate_quality_score, 2)}` : 'Awaiting evaluation'},
                {label:'Quality degradation within threshold',ok:quality?.result === 'PASS',detail:quality ? `${fmt(quality.quality_degradation_percentage_points, 2)} pp observed · ${fmt(quality.allowed_degradation_percentage_points, 2)} pp allowed` : 'Awaiting evaluation'}
              ].map((check,i)=><div className="quality-check-row" key={check.label}><span className={`quality-check-icon ${!quality ? 'pending' : check.ok ? 'pass' : 'fail'}`}>{!quality ? '–' : check.ok ? '✓' : '!'}</span><div><strong>{check.label}</strong><small>{check.detail}</small></div><b className={!quality ? 'pending' : check.ok ? 'pass' : 'fail'}>{!quality ? 'PENDING' : check.ok ? 'PASS' : 'FAIL'}</b></div>)}
            </div>
            {quality?.reason && <div className={`quality-decision-note ${quality.result === 'PASS' ? 'pass' : 'fail'}`}><strong>{quality.result === 'PASS' ? 'Gate passed' : 'Gate failed'}</strong><p>{quality.reason}</p>{quality.disclaimer && <small>{quality.disclaimer}</small>}</div>}
          </div>
          <div className="panel quality-history-panel">
            <div className="panel-header"><div><h3>Validation History</h3><p>Recent quality gate evaluations in this session.</p></div><span>{qualityHistory.length} runs</span></div>
            {qualityHistory.length ? <div className="quality-history-list">{qualityHistory.map(item=><div className="quality-history-row" key={item.id}><div><strong>{item.result}</strong><small>{new Date(item.evaluatedAt).toLocaleString()}</small></div><span>{fmt(item.degradation,2)} pp degradation</span><span>{fmt(item.threshold,2)} pp threshold</span><b className={item.result === 'PASS' ? 'pass' : 'fail'}>{item.result}</b></div>)}</div> : <div className="quality-history-empty">No validation runs yet. Run an evaluation to create the first history entry.</div>}
          </div>
        </section>}


        <section className="sustainability panel">

          <div className="panel-header simple"><div><h2><Leaf size={20}/> Sustainability Impact</h2><p>Estimated for current workload</p></div></div>

          <div className="sustain-grid">

            <SustainCard icon={Leaf} title="Energy Saved" value={impact?.power_saved_w != null ? fmt(Number(impact.power_saved_w)/1000,2) : 'N/A'} unit="kWh/hr" tone="green" sub="Estimated energy reduction"/>

            <SustainCard icon={Thermometer} title="Thermal Reduction" value={impact?.temperature_reduction_c != null ? `- ${fmt(Math.max(0, impact.temperature_reduction_c),1)}` : 'N/A'} unit="°C" tone="red" sub="Lower cooling load"/>

            <SustainCard icon={BarChart3} title="Energy Efficiency" value={data?.sustainability?.energy_efficiency_req_per_w != null ? fmt(data.sustainability.energy_efficiency_req_per_w,2) : 'N/A'} unit="req/W" tone="purple" sub="AI output per unit energy"/>

          </div>

        </section>



        <section className="bottom-grid">

          <section className="panel fleet-panel" id="gpu-fleet">

            <div className="panel-header"><div><h2>GPU Fleet</h2><p>Exactly 5 simulated GPUs · dynamic allocation</p></div><span className="fleet-count">{data?.cluster?.active_count ?? '—'} Active / 5</span></div>

            <div className="fleet-summary">
              <div><span>Total GPUs</span><strong>{data?.cluster?.gpu_count ?? 5}</strong></div>
              <div><span>Active</span><strong>{(data?.cluster?.gpus || []).filter(g => g.status !== 'Idle').length}</strong></div>
              <div><span>Idle</span><strong>{(data?.cluster?.gpus || []).filter(g => g.status === 'Idle').length}</strong></div>
              <div><span>Overloaded</span><strong>{(data?.cluster?.gpus || []).filter(g => g.status === 'Overloaded').length}</strong></div>
            </div>
            <div className="gpu-cards">
              {(data?.cluster?.gpus || []).map(g => <GpuRow key={g.id} gpu={g}/>)}
              {!data?.cluster?.gpus?.length && <div className="empty">Waiting for GPU fleet telemetry…</div>}
            </div>

          </section>



          <section className="panel workload-panel" id="workloads">

            <div className="panel-header"><div><h2>Active Workloads</h2><p>Current serving demand</p></div></div>

            {(data?.workloads || []).map(w => <div className="workload-row" key={w.id}><div><strong>{w.name}</strong><span>{w.model}</span></div><div><b>{fmt(w.requests_per_min)}</b><span>req/min</span></div><div><b>{fmt(w.latency_ms,0)} ms</b><span>latency</span></div><Pill pass={w.status.includes('Protected')}>{w.status}</Pill></div>)}

          </section>

        </section>



        <section className="panel decision-panel" id="decision-history">

          <div className="panel-header"><div><h2><History size={19}/> Decision History</h2><p>Actual simulator and controller events</p></div><span className={`live-badge ${auto?'':'idle'}`}><i/>{auto ? 'Live' : 'Idle'}</span></div>

          <div className="event-list">

            {(data?.recent_events || []).slice().reverse().slice(0,8).map((e,i) => (

              <div className="decision" key={`${e.timestamp}-${i}`}>

                <span className="decision-time">{toLocalDate(e.timestamp).toLocaleTimeString()}</span>

                <span className={`decision-dot ${e.type || ''}`}/>

                <div><strong>{e.title || String(e.event || '').replaceAll('_',' ')}</strong><p>{e.message}</p></div>

              </div>

            ))}

            {!data?.recent_events?.length && <div className="empty">No controller events yet. Start the simulation; GPUPilot will generate workload spikes automatically.</div>}

          </div>

        </section>



        <section className="control-panel panel">

          <div><span className="eyebrow">SIMULATOR CONTROLS</span><h2>Monitor → Predict → Optimize → Apply → Verify</h2><p>All controls below call the FastAPI backend; no UI-only simulation is used.</p></div>

          <div className="control-actions">

            <button onClick={start} disabled={busy}><Play size={16}/>Start</button>

            <button onClick={stop} disabled={busy}><Square size={16}/>Stop</button>

            <div className="auto-spike-chip"><Zap size={16}/>Automatic spikes enabled</div>

            <button className="warning" onClick={triggerAnomalySpike} disabled={busy}><AlertTriangle size={15}/>Trigger Anomaly Spike</button>

            <button className="autopilot" onClick={toggleAutopilot} disabled={busy}><Cpu size={16}/>{auto ? 'Autopilot ON' : 'Enable Autopilot'}</button>

            <button onClick={reset} disabled={busy}><RotateCcw size={16}/>Reset</button>

          </div>

        </section>



        {activePage === 'settings' && (
          <section className="settings-page">
            <div className="settings-intro"><div><span className="eyebrow">CONFIGURATION</span><h2>Simulation Settings</h2><p>Manage simulator behaviour and autonomous optimization preferences. SLA values are shown from the backend configuration.</p></div><span className="settings-status"><i/>{running ? 'Simulator running' : 'Simulator stopped'}</span></div>
            <div className="settings-layout">
              <section className="settings-card">
                <div className="settings-card-heading"><span className="settings-icon"><SlidersHorizontal size={18}/></span><div><h3>Simulation Configuration</h3><p>Control the telemetry sampling interval used when starting the simulator.</p></div></div>
                <label className="settings-field">Simulation tick interval
                  <select value={interval} onChange={e=>setIntervalValue(Number(e.target.value))}>
                    <option value="0.5">0.5 seconds — Fast</option><option value="1">1 second — Balanced</option><option value="2">2 seconds — Relaxed</option><option value="5">5 seconds — Low frequency</option>
                  </select>
                  <small>Applies the next time you start or restart the simulation.</small>
                </label>
                <div className="settings-current-row"><span>Current simulator status</span><strong>{running ? 'Running' : 'Stopped'}</strong></div>
                <div className="settings-action-row"><button className="settings-primary" onClick={start} disabled={busy || running}><Play size={15}/>Start Simulation</button><button className="settings-secondary" onClick={stop} disabled={busy || !running}><Square size={14}/>Stop Simulation</button></div>
              </section>
              <section className="settings-card">
                <div className="settings-card-heading"><span className="settings-icon"><Cpu size={18}/></span><div><h3>Autonomous Controller</h3><p>Allow GPUPilot to evaluate telemetry and apply optimization decisions automatically.</p></div></div>
                <div className="settings-controller-state"><div><strong>{auto ? 'Autonomous Mode Enabled' : 'Autonomous Mode Disabled'}</strong><span>{auto ? 'Controller is active and monitoring the running environment.' : 'Manual optimization mode. Enable AutoPilot to automate decisions.'}</span></div><span className={`settings-state-pill ${auto ? 'on' : 'off'}`}>{auto ? 'ON' : 'OFF'}</span></div>
                <button className={`settings-toggle-button ${auto ? 'enabled' : ''}`} onClick={toggleAutopilot} disabled={busy}><Cpu size={15}/>{auto ? 'Disable Autonomous Mode' : 'Enable Autonomous Mode'}</button>
              </section>
              <section className="settings-card settings-sla-card">
                <div className="settings-card-heading"><span className="settings-icon"><ShieldCheck size={18}/></span><div><h3>Service Level Configuration</h3><p>Current SLA thresholds supplied by the backend.</p></div></div>
                <div className="settings-config-row"><span>Maximum P95 latency</span><strong>{data?.sla?.configuration?.max_latency_ms ?? '—'} <small>ms</small></strong></div>
                <div className="settings-config-row"><span>Minimum throughput</span><strong>{data?.sla?.configuration?.min_throughput_req_min ?? '—'} <small>req/min</small></strong></div>
                <div className="settings-readonly-note"><ShieldCheck size={14}/> SLA thresholds are read-only in this interface.</div>
              </section>
            </div>
          </section>
        )}




      </main>

    </div>

  )

}




function App() {
  return <SimulationDashboard />;
}

function Kpi({icon:Icon,label,value,unit,tone,history,dataKey,simple=false}) {

  const first = history?.[0]?.[dataKey]

  const last = history?.[history.length-1]?.[dataKey]

  const delta = first && last ? ((last-first)/first)*100 : null

  return <div className={`kpi ${tone}`}>

    <div className="kpi-icon"><Icon size={22}/></div>

    <div className="kpi-body"><span>{label}</span><strong>{value}<small>{unit}</small></strong>

        {!simple && <div className="kpi-delta"><b>{delta === null ? '—' : `${delta >= 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(0)}%`}</b><span>vs. recent history</span></div>}

    </div>

    {!simple && <div className="spark"><ResponsiveContainer width="100%" height="100%"><AreaChart data={history}><Area dataKey={dataKey} type="linear" strokeWidth={2} fillOpacity={0.12} /></AreaChart></ResponsiveContainer></div>}

  </div>

}



function ConfigBox({title,config,optimized}) {

  return <div className={`config-box ${optimized?'optimized':''}`}>

    <div className="config-title"><strong>{title}</strong>{optimized && <span className="applied-tag">AI recommendation</span>}</div>

    {config ? <div className="config-values">

      <Row label="Precision" value={config.precision}/><Row label="Batch Size" value={config.batch_size}/>

      <Row label="GPU Allocation" value={config.gpu_allocation}/><Row label="Replicas" value={config.replicas}/>

      <Row label="Concurrency" value={config.concurrency}/>

    </div> : <div className="muted">Awaiting optimizer result.</div>}

  </div>

}

function Row({label,value}) { return <div><span>{label}</span><b>{value ?? 'N/A'}</b></div> }



function ImpactStat({label,value,suffix='',direction,sla,neutral}) {

  if (sla) return <div className="impact-stat"><span>{label}</span><strong className={value==='Maintained'?'positive':'negative'}>{value==='Maintained'?'✓ ':''}{value}</strong></div>

  const num = Number(value)

  return <div className="impact-stat"><span>{label}</span><strong className={num>=0 ? 'positive' : neutral ? 'neutral' : 'negative'}>{value == null ? 'N/A' : `${direction==='down'?'↓':'↑'} ${Math.abs(num).toFixed(1)}${suffix}`}</strong></div>

}

function SustainCard({icon:Icon,title,value,unit,sub,tone}) {

  return <div className={`sustain-card ${tone}`}><div className="sustain-icon"><Icon size={25}/></div><div><span>{title}</span><strong>{value} <small>{unit}</small></strong><p>{sub}</p></div></div>

}

function GpuRow({gpu}) {
  const status = gpu.status || (gpu.active ? 'Active' : 'Idle')
  return <div className={`gpu-row gpu-${String(status).toLowerCase()}`}>
    <div className="gpu-id"><span className={`gpu-status ${gpu.active ? 'active' : ''}`}/><div><strong>{gpu.id}</strong><span>{gpu.model} · {gpu.workload || 'No workload assigned'}</span></div><Pill pass={status === 'Active'}>{status}</Pill></div>
    <div><b>{fmt(gpu.utilization)}%</b><span>Utilization</span><div className="gpu-meter"><i style={{width:`${Math.max(0,Math.min(100,Number(gpu.utilization)||0))}%`}}/></div></div>
    <div><b>{fmt(gpu.power,1)} W</b><span>Power</span></div>
    <div><b>{fmt(gpu.temperature,1)}°C</b><span>Temperature</span></div>
    <div><b>{fmt(gpu.memory,1)} / {fmt(gpu.memory_capacity,0)} GB</b><span>Memory</span><div className="gpu-meter"><i style={{width:`${Math.max(0,Math.min(100,100*(Number(gpu.memory)||0)/(Number(gpu.memory_capacity)||24)))}%`}}/></div></div>
  </div>
}

function Pill({children,pass=false}) { return <span className={`pill ${pass?'pass':''}`}>{children}</span> }



createRoot(document.getElementById('root')).render(<App />)
