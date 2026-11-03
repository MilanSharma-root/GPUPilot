"""Repeatable scenario benchmarks for the simulator (no live state mutation)."""
from typing import Dict, List

SCENARIOS = [
    {"name": "Normal", "request_rate": 320.0, "description": "Steady everyday inference traffic"},
    {"name": "Spike", "request_rate": 950.0, "description": "Sudden increase in incoming requests"},
    {"name": "Peak", "request_rate": 1450.0, "description": "Sustained high-demand operating point"},
    {"name": "Recovery", "request_rate": 520.0, "description": "Demand falls after a peak period"},
]


def _energy_per_1000_requests(power_w: float, throughput_per_min: float) -> float:
    if throughput_per_min <= 0:
        return 0.0
    return round(float(power_w) * 1000.0 / (float(throughput_per_min) * 60.0), 4)


def run_scenario_benchmarks(simulator, optimizer) -> Dict:
    """Compare the current configuration with the best feasible candidate per scenario.

    Uses steady-state model estimates without changing live simulation state.
    """
    baseline = simulator.configuration
    candidates = optimizer.generate_candidates()
    results: List[Dict] = []
    for scenario in SCENARIOS:
        rate = scenario["request_rate"]
        base = simulator.estimate_steady_state(baseline, rate)
        feasible, rejected = [], 0
        for candidate in candidates:
            if candidate.gpu_allocation * candidate.replicas < optimizer.required_gpu_count(rate):
                rejected += 1
                continue
            estimate = simulator.estimate_steady_state(candidate, rate)
            if estimate.feasible:
                feasible.append((optimizer.sustainability_score(estimate), candidate, estimate))
            else:
                rejected += 1
        if feasible:
            feasible.sort(key=lambda item: (item[0], item[2].total_power, item[2].temperature))
            _, selected, optimized = feasible[0]
        else:
            selected, optimized = baseline, base
        bp, op = float(base.total_power), float(optimized.total_power)
        bt, ot = float(base.throughput), float(optimized.throughput)
        be, oe = _energy_per_1000_requests(bp, bt), _energy_per_1000_requests(op, ot)
        results.append({
            **scenario,
            "baseline": {"power_w": round(bp, 2), "p95_latency_ms": round(float(base.latency), 2),
                "throughput_req_min": round(bt, 2), "temperature_c": round(float(base.temperature), 2),
                "energy_wh_per_1000_requests": be, "sla_status": base.sla.sla_status},
            "optimized": {"power_w": round(op, 2), "p95_latency_ms": round(float(optimized.latency), 2),
                "throughput_req_min": round(ot, 2), "temperature_c": round(float(optimized.temperature), 2),
                "energy_wh_per_1000_requests": oe, "sla_status": optimized.sla.sla_status},
            "configuration": selected.model_dump(), "candidates_considered": len(candidates),
            "feasible_candidates": len(feasible), "rejected_candidates": rejected,
            "power_change_pct": round((bp-op)/bp*100.0, 2) if bp else 0.0,
            "energy_change_pct": round((be-oe)/be*100.0, 2) if be else 0.0,
        })
    return {"mode": "SIMULATED_STEADY_STATE",
        "disclaimer": "Model-based estimates, not measured physical GPU benchmark results.",
        "baseline_configuration": baseline.model_dump(), "scenarios": results}
