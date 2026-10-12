# GPUPilot — Autonomous AI Workload Sustainability Controller

> **SIMULATED GPU TELEMETRY.** The default hackathon build uses a mathematical GPU/workload simulator. It does not read a physical NVIDIA GPU and environmental values are estimates based on configurable PUE/WUE assumptions.

GPUPilot is a simulator-first closed-loop controller for AI serving. It observes workload and GPU telemetry, predicts the next operating point, evaluates serving configurations, rejects SLA violations, applies a lower-impact configuration, measures the result, and can repeat continuously.

## Core loop

```text
AI Workload
    ↓
Telemetry
    ↓
Prediction
    ↓
Optimization
    ↓
SLA Verification
    ↓
Auto Apply
    ↓
Measure Impact
    ↓
Continuous Feedback ↺
```

## What already works

- Dynamic correlated workload/GPU simulation
- Normal, spike, peak, recovery and custom workloads
- GPU utilization, power, temperature, memory, request rate, latency and throughput
- Configurable SLA: latency, throughput and temperature
- What-if configuration evaluation
- SLA-constrained multi-objective optimization
- One-shot closed-loop autopilot with post-change verification and rollback
- Lightweight Random Forest prediction with deterministic fallback
- Estimated energy, cooling and water impact using PUE/WUE assumptions
- Continuous autopilot with cooldown and minimum-improvement guardrails
- Background optimization worker; dashboard polling reads cached recommendations instead of launching candidate searches
- Precision quality-gate API (`POST /api/quality/evaluate`) with explicit simulated-only scores and configurable degradation threshold
- Randomized live workload-event intervals and reproducible simulator runs when an explicit seed is supplied
- Before/after comparison and optimization events
- React dashboard with live telemetry and charts
- Docker Compose
- Tests for simulator, optimizer, predictor and sustainability calculations

## Run locally

### Backend

```bash
cd GPUPilot-v6-1
python -m venv .venv
# Windows PowerShell
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

Swagger: http://127.0.0.1:8000/docs

### Frontend

In another terminal:

```bash
cd GPUPilot-v6-1/frontend
npm install
npm run dev
```

Dashboard: http://127.0.0.1:5173

The frontend uses `VITE_API_URL` when provided; otherwise it defaults to `http://127.0.0.1:8000/api`.

## One-command Docker demo

```bash
docker compose up --build
```

- Backend: http://127.0.0.1:8000/docs
- Dashboard: http://127.0.0.1:5173

## Main APIs

Existing simulator APIs are preserved:

- `GET /api/health`
- `GET/POST /api/telemetry`
- `GET /api/history`
- `GET /api/history/export`
- `GET/POST /api/configuration`
- `POST /api/configuration/evaluate`
- `GET/POST /api/sla`
- `POST /api/simulation/start`
- `POST /api/simulation/stop`
- `POST /api/simulation/reset`
- `POST /api/simulation/spike`
- `POST /api/simulation/step`
- `GET /api/demo/comparison`

New GPUPilot APIs:

- `GET /api/prediction` — next operating-point prediction
- `GET /api/optimize` and `GET /api/optimization` — recommend without applying
- `GET /api/impact` — energy/thermal/cooling/water estimate and comparison
- `POST /api/autopilot` and `POST /api/autopilot/run` — optimize, apply, observe and verify
- `POST /api/autopilot/start` — start continuous controller
- `POST /api/autopilot/stop` — stop continuous controller
- `GET /api/autopilot/status` — controller state and latest cycle
- `GET /api/autopilot/events` — recent control-loop events
- `GET /api/dashboard` — consolidated live dashboard payload used by the new UI
- `POST /api/quality/evaluate` — simulated FP16/INT8 quality gate
- `GET /api/quality/status` — default simulated precision-quality result
- `GET /api/demo/scenario` — deterministic spike scenario for demos

## Recommended judge demo

1. Open the dashboard.
2. Click **Start**.
3. Click **Trigger Spike**.
4. Watch request rate, utilization, power, temperature and latency rise.
5. Click **Run Autopilot**.
6. GPUPilot predicts the workload, evaluates candidates, filters SLA failures, applies a feasible configuration and verifies the post-change estimate.
7. Show the Before/After and sustainability cards.
8. For the autonomous version, click **Continuous** and trigger another spike.

## Optimization logic

Candidate configurations vary:

- GPU allocation
- batch size
- precision (FP16/INT8)
- replicas
- concurrency

Only SLA-feasible configurations are scored. The prototype score combines normalized total power, temperature, estimated water impact and total memory. Lower is better. The optimizer never deliberately selects a configuration that fails the configured latency, throughput or temperature SLA.

## Prediction

The prediction engine uses recent simulator history. With enough data and scikit-learn available it trains lightweight Random Forest regressors for next request rate, power, temperature and latency. If there is not enough data or the model cannot train, it falls back to a deterministic recent-trend estimator. The API reports the prediction mode.

## Sustainability assumptions

The dashboard labels environmental values as estimates. Default assumptions:

- PUE = 1.20
- WUE = 0.50 L/kWh of total facility energy

These are configurable in `engine/sustainability.py`. They are not measurements of a real data center. Power is instantaneous; energy is power accumulated over time.

## Safety / stability

Continuous autopilot includes:

- minimum improvement threshold
- cooldown period to prevent configuration thrashing
- no-op when the current configuration is already appropriate
- post-change SLA verification
- rollback when the post-change operating point fails the SLA
- bounded configuration values inherited from the existing Pydantic models

## NVIDIA integration path

The controller is intentionally provider-agnostic. The current provider is the simulator. `engine/telemetry.py` defines a provider contract so an NVML/DCGM provider can be added later without rewriting the optimization/controller layer. No physical NVIDIA GPU is required for the hackathon MVP.

vLLM, Triton, Prometheus and Grafana are optional future integrations. The React dashboard is the judge-facing UI.

## Tests

```bash
pytest -q
```

## Limitations

- The simulator is not a hardware-accurate GPU model.
- Precision quality-gate scores are illustrative simulated values, not measured model accuracy. A real deployment must connect a task-specific evaluator and representative validation dataset.
- Water impact is estimated from assumptions, not metered water consumption.
- The controller is intended as a hackathon prototype, not a production cluster scheduler.


## Hackathon Dashboard Upgrade

The dashboard now follows the provided GPUPilot reference layout and is backed by the simulator APIs. It includes a five-GPU simulated cluster, live GPU metrics, active workloads, energy/environmental cards, a GPUPilot recommendation panel, performance-vs-sustainability charts, controller activity, and working simulation/autopilot controls.

### Five simulated GPUs
- GPU 01 — RTX 4090
- GPU 02 — A100
- GPU 03 — A100
- GPU 04 — L40S
- GPU 05 — H100

The GPU devices above are simulated. The dynamic scheduler selects the active set using workload demand, capacity, utilization, temperature, power and SLA context. Extra GPUs return to idle as workload recovers.

### Automatic spike lifecycle
`NORMAL → SPIKE → PEAK → RECOVERY → NORMAL`

Live spikes have a finite ramp and peak hold, then automatically recover; they no longer remain at peak indefinitely.


## Dashboard UI integration

The judge-facing dashboard has been rebuilt to match the supplied light-theme GPUPilot reference:
- Left navigation with Dashboard, Live Monitoring, Workloads, AI Controller, Decision History, GPU Fleet and Settings.
- Live KPI cards for GPU power, temperature, utilization and request rate.
- Current → Optimized configuration from the real optimizer.
- Dynamic optimization reasons and expected impact.
- Power/temperature chart with 5/15/30/60 minute history selection and real simulation/controller event markers.
- Sustainability estimates derived from the optimizer's before/after steady-state estimates.
- Five simulated GPUs with live active/idle state.
- Functional Start Simulation, Traffic Spike, Autonomous Mode and Reset controls.
- Backend-offline/error state instead of fake telemetry.

The frontend polls `GET /api/dashboard`; the backend remains the source of truth. The existing simulator, optimizer, SLA and autopilot APIs are preserved.

### Prototype honesty

All GPU telemetry in this build remains simulated. Environmental values are estimates using the configured PUE/WUE assumptions. NVML, DCGM, Kubernetes, vLLM and Triton are not presented as integrated hardware/runtime dependencies.


## Background optimizer and quality-gate notes

The API primes an initial recommendation during startup, then refreshes optimizer results in a single background task at a five-second interval. Dashboard polling uses the latest cached result; it does not launch a new candidate search on every poll. The controller also moves optimizer evaluation to a worker thread so its asyncio loop can continue servicing API traffic. This reduces synchronous work on request handling but does not imply zero resource contention.

`POST /api/quality/evaluate` accepts `reference_precision`, `candidate_precision`, and `allowed_degradation_pct`. The current evaluator intentionally returns **simulated** illustrative scores to demonstrate threshold PASS/FAIL behavior. It does not load a model, run inference, or claim measured accuracy. Replace `quality.evaluate_simulated_quality` with a task-specific evaluator before using this gate for real model deployments.

### Telemetry graph: repeating spike/recovery fix

The repeating waveform was primarily caused by the autonomous event scheduler: its
10–40 tick quiet period was comparable to the ramp, peak hold, and recovery duration.
A new burst could therefore start shortly after the previous burst, creating a
near-periodic sawtooth even when individual peaks were randomized. A second issue
was that recovery targeted the drifting normal-demand level but decided when to
finish recovery against the fixed `NORMAL_RATE`; when those values diverged, the
state machine could switch states before demand had converged to its actual target.

The simulator now schedules a randomized 35–100 tick normal interval between bursts,
samples ramp curvature once per event, and ends recovery relative to the current
normal-demand target. The main dashboard graph uses linear interpolation so the line
connects actual samples without spline overshoot. This remains simulated telemetry;
it is not a measurement from physical GPUs. Regression tests cover recovery continuity,
non-short event spacing, and schedule variation.

## Responsive configuration switching (judge-demo update)

- Continuous autopilot evaluates every 2 seconds by default instead of every 5 seconds.
- The post-change cooldown is 3 seconds (with a 1.5% minimum estimated power improvement), keeping switching responsive while retaining anti-thrashing protection.
- Recovery no longer blocks scale-down for the entire `recovery` state. It holds extra capacity only while measured request rate remains elevated (>= 950 req/min) or SLA is failing.
- The dashboard's Enable Autopilot action uses the same 2-second control interval. Optimization recommendations are refreshed in the background every 2 seconds.

These changes affect the simulated control loop only. They do not claim physical GPU reconfiguration latency, and request serving remains separate from optimizer evaluation.


## Telemetry responsiveness and configuration exploration update

- Normal-demand drift now changes more frequently and across a wider bounded range, so the history is not dominated by a single repeating spike waveform. Spike events remain stateful and autonomous rather than being synthesized by the frontend.
- Request-rate tracking and utilization tracking were made more responsive. Temperature retains thermal inertia so it does not unrealistically jump at the same speed as request demand.
- The main history chart uses linear sample-to-sample rendering, KPI sparklines use linear rendering, and chart/event timestamps include seconds to show live changes more clearly.
- The optimizer evaluates a broader cross-product of precision (FP32/FP16/INT8), batch size (8/16/32/64), GPU allocation (1–5), replicas (1–3), and concurrency (16/24/32/64), while excluding combinations exceeding the five-GPU simulated cluster.
- GPU capacity feasibility uses `gpu_allocation * replicas`, not allocation per replica alone. Candidate evaluation does not imply automatic application: the controller still checks feasibility, improvement, cooldown, and post-change SLA before applying a configuration.
- The continuous controller now starts at a 2-second interval when the simulation starts or resets. Actual changes remain workload-driven; it does not cycle configurations just for visual effect.
- All telemetry in this hackathon build is simulated. It is not live hardware telemetry.


### Graph legend fix (2026-10-10)
- Before/After Optimization are now named chart series with explicit red/blue strokes, so legend entries correspond to plotted lines.
- Target/SLA threshold uses an explicit dashed grey reference line and visible label when a valid target value exists.
- Disabled animation for these telemetry series to keep displayed samples aligned with incoming history.

## TinyFish hardware/software change monitor

The dashboard includes a **Hardware & Software Change Monitor**. Its inventory is explicitly simulated (NVIDIA GPU Driver `570.86.15`, CUDA Toolkit `12.8`, PyTorch `2.6.0`) because this hackathon build does not inspect a physical host. TinyFish Search retrieves current public release context and the monitor compares extractable version candidates. Ambiguous results are marked for manual review; the monitor never installs drivers or claims compatibility automatically.

To enable live TinyFish searches, create an API key at <https://agent.tinyfish.ai/api-keys> and set it in the same terminal before starting the backend:

**Windows PowerShell**

```powershell
$env:TINYFISH_API_KEY="your_tinyfish_api_key"
python -m uvicorn main:app --reload --port 8000
```

**macOS/Linux**

```bash
export TINYFISH_API_KEY="your_tinyfish_api_key"
python -m uvicorn main:app --reload --port 8000
```

Then open the dashboard and click **Scan for Updates**. The backend uses TinyFish Search (`https://api.search.tinyfish.ai/`) with the `X-API-Key` header. If no key is configured or a search fails, it reports that explicitly and does not invent update findings. A candidate update must be reviewed against official release notes and compatibility requirements before changing any real environment.
#   G P U P i l o t - f i n a l  
 #   G P U P i l o t  
 