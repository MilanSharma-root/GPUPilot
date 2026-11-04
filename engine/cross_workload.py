"""Simulator-only cross-workload GPU arbitration with fractional GPU sharing.

No physical GPU is controlled. Capacity, latency, throughput and power are modeled
estimates intended for reproducible prototype benchmarks.
"""
from __future__ import annotations
from typing import Any, Dict, Iterable

GPU_POOL = [
    {"id": "GPU 01", "model": "RTX 4090", "memory_gb": 24, "capacity_factor": 1.00, "power_w": 450},
    {"id": "GPU 02", "model": "A100", "memory_gb": 80, "capacity_factor": 1.30, "power_w": 400},
    {"id": "GPU 03", "model": "A100", "memory_gb": 80, "capacity_factor": 1.30, "power_w": 400},
    {"id": "GPU 04", "model": "L40S", "memory_gb": 48, "capacity_factor": 1.10, "power_w": 350},
    {"id": "GPU 05", "model": "H100", "memory_gb": 80, "capacity_factor": 1.65, "power_w": 700},
]
WORKLOAD_PROFILES = {
    "llm": {"capacity": 420, "memory_gb": 32, "latency_weight": 1.35},
    "embedding": {"capacity": 1500, "memory_gb": 8, "latency_weight": 1.10},
    "image": {"capacity": 180, "memory_gb": 20, "latency_weight": 0.95},
    "batch": {"capacity": 900, "memory_gb": 10, "latency_weight": 0.45},
}
DEFAULT_WORKLOADS = [
    {"id":"llm-api","name":"LLM Chat API","kind":"llm","model":"Llama 3 Instruct","demand_rpm":620,"priority":5,"max_latency_ms":220,"min_throughput_rpm":500},
    {"id":"embedding-api","name":"Embedding API","kind":"embedding","model":"text-embedding","demand_rpm":720,"priority":3,"max_latency_ms":160,"min_throughput_rpm":600},
    {"id":"image-gen","name":"Image Generation","kind":"image","model":"Diffusion XL","demand_rpm":120,"priority":2,"max_latency_ms":1800,"min_throughput_rpm":90},
    {"id":"offline-batch","name":"Batch Inference","kind":"batch","model":"Classifier Batch","demand_rpm":550,"priority":1,"max_latency_ms":5000,"min_throughput_rpm":300},
]

def _number(value: Any, default: float, minimum: float, maximum: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = default
    return max(minimum, min(maximum, number))

def plan_cross_workload(workloads: Iterable[Dict[str, Any]] | None = None,
                        gpu_pool: Iterable[Dict[str, Any]] | None = None) -> Dict[str, Any]:
    """Plan simulated fractional shares; compute share and memory are both bounded."""
    raw_workloads = list(workloads if workloads is not None else DEFAULT_WORKLOADS)
    gpu_state = []
    for source in (gpu_pool if gpu_pool is not None else GPU_POOL):
        gpu = dict(source)
        gpu["memory_gb"] = _number(gpu.get("memory_gb"), 0, 0, 10000)
        gpu["capacity_factor"] = _number(gpu.get("capacity_factor"), 1, .01, 100)
        gpu["power_w"] = _number(gpu.get("power_w"), 0, 0, 100000)
        gpu_state.append({**gpu, "_remaining_share": 1.0, "_remaining_memory": gpu["memory_gb"], "_allocations": []})
    if not raw_workloads:
        raise ValueError("At least one workload is required.")
    if not gpu_state:
        raise ValueError("At least one simulated GPU is required.")

    items, seen = [], set()
    for i, raw in enumerate(raw_workloads):
        wid = str(raw.get("id") or f"workload-{i+1}").strip()
        if not wid or wid in seen:
            raise ValueError(f"Duplicate or empty workload id: {wid}")
        seen.add(wid)
        kind = str(raw.get("kind", "llm")).lower()
        if kind not in WORKLOAD_PROFILES:
            raise ValueError(f"Unsupported workload kind '{kind}'. Choose from {', '.join(WORKLOAD_PROFILES)}.")
        profile = WORKLOAD_PROFILES[kind]
        items.append({**raw, "id": wid, "name": str(raw.get("name") or wid), "kind": kind,
            "model": str(raw.get("model") or kind),
            "demand_rpm": _number(raw.get("demand_rpm"), 100, 0, 100000),
            "priority": int(_number(raw.get("priority"), 3, 1, 5)),
            "max_latency_ms": _number(raw.get("max_latency_ms"), 500, 1, 60000),
            "min_throughput_rpm": _number(raw.get("min_throughput_rpm"), 0, 0, 100000),
            "memory_gb": _number(raw.get("memory_gb"), profile["memory_gb"], 1, 10000),
            "_profile": profile, "_capacity": 0.0, "_allocations": []})

    def urgency(w):
        ratio = w["demand_rpm"] / max(w["_profile"]["capacity"], 1)
        return w["priority"] * 100 + min(ratio, 5) * 20 * w["_profile"]["latency_weight"] + 500 / w["max_latency_ms"]

    items.sort(key=urgency, reverse=True)
    assignment_records = []
    for workload in items:
        target = max(workload["demand_rpm"], workload["min_throughput_rpm"])
        while workload["_capacity"] < target:
            candidates = [g for g in gpu_state if g["_remaining_share"] >= .10 and g["_remaining_memory"] >= workload["memory_gb"]]
            if not candidates:
                break
            profile = workload["_profile"]
            candidates.sort(key=lambda g: -(profile["capacity"] * g["capacity_factor"] / max(g["power_w"], 1)))
            gpu = candidates[0]
            need = target - workload["_capacity"]
            full_capacity = profile["capacity"] * gpu["capacity_factor"]
            share = min(gpu["_remaining_share"], max(.10, need / max(full_capacity, 1)))
            if share < .10:
                break
            gpu["_remaining_share"] -= share
            gpu["_remaining_memory"] -= workload["memory_gb"]
            capacity = full_capacity * share
            workload["_capacity"] += capacity
            record = {"gpu_id": gpu["id"], "gpu_model": gpu["model"], "workload_id": workload["id"],
                "workload_name": workload["name"], "share_pct": round(share * 100, 1),
                "memory_reserved_gb": workload["memory_gb"], "estimated_capacity_rpm": round(capacity, 1)}
            gpu["_allocations"].append(record)
            workload["_allocations"].append(record)
            assignment_records.append(record)

    results = []
    total_demand = total_served = total_power = 0.0
    for workload in items:
        demand, capacity = workload["demand_rpm"], workload["_capacity"]
        served = min(demand, capacity)
        latency = 35 + 260 * (demand / max(capacity, 1)) ** 2 if capacity else 9999.0
        sla = bool(workload["_allocations"]) and latency <= workload["max_latency_ms"] and served >= workload["min_throughput_rpm"]
        gpu_ids = list(dict.fromkeys(a["gpu_id"] for a in workload["_allocations"]))
        utilization = min(99.0, 18 + 78 * demand / max(capacity, 1)) if gpu_ids else 0.0
        power = sum(g["power_w"] * sum(a["share_pct"] / 100 for a in g["_allocations"] if a["workload_id"] == workload["id"]) * min(1.0, utilization / 100) for g in gpu_state)
        status = "QUEUED" if not gpu_ids else ("RUNNING" if sla else "SLO AT RISK")
        reason = ("No compatible GPU memory/share capacity remained after higher-urgency workloads." if not gpu_ids else
            "Fractional GPU share allocated using priority, demand, SLO pressure, memory fit, and estimated capacity per watt." if sla else
            "Allocated a fractional GPU share, but simulated latency or minimum throughput SLO is not met.")
        results.append({"id": workload["id"], "name": workload["name"], "kind": workload["kind"], "model": workload["model"],
            "priority": workload["priority"], "demand_rpm": round(demand, 1), "estimated_capacity_rpm": round(capacity, 1),
            "estimated_throughput_rpm": round(served, 1), "estimated_latency_ms": round(latency, 1),
            "max_latency_ms": round(workload["max_latency_ms"], 1), "min_throughput_rpm": round(workload["min_throughput_rpm"], 1),
            "assigned_gpus": gpu_ids, "gpu_shares": [{"gpu_id": a["gpu_id"], "share_pct": a["share_pct"]} for a in workload["_allocations"]],
            "gpu_count": len(gpu_ids), "estimated_utilization_pct": round(utilization, 1), "estimated_power_w": round(power, 1),
            "memory_gb_per_gpu": workload["memory_gb"], "sla_status": "PASS" if sla else "FAIL", "status": status, "decision_reason": reason})
        total_demand += demand
        total_served += served
        total_power += power

    gpu_output = []
    for gpu in gpu_state:
        allocations = gpu["_allocations"]
        gpu_output.append({k: gpu[k] for k in ("id", "model", "memory_gb", "capacity_factor", "power_w")} | {
            "allocations": [{"workload_id": a["workload_id"], "workload_name": a["workload_name"],
                "share_pct": a["share_pct"], "memory_reserved_gb": a["memory_reserved_gb"]} for a in allocations],
            "assigned_workload_id": allocations[0]["workload_id"] if len(allocations) == 1 else None,
            "assigned_workload_name": allocations[0]["workload_name"] if len(allocations) == 1 else ("Multiple workloads" if allocations else None),
            "allocated_share_pct": round((1 - gpu["_remaining_share"]) * 100, 1),
            "remaining_memory_gb": round(gpu["_remaining_memory"], 1), "status": "ALLOCATED" if allocations else "IDLE"})
    allocated = sum(g["status"] == "ALLOCATED" for g in gpu_output)
    return {"data_source": "SIMULATED CROSS-WORKLOAD PLAN", "policy": "priority + SLO pressure + demand + memory compatibility + fractional GPU sharing",
        "gpu_count": len(gpu_state), "allocated_gpu_count": allocated, "idle_gpu_count": len(gpu_state) - allocated,
        "workload_count": len(items), "queued_workload_count": sum(w["status"] == "QUEUED" for w in results),
        "sla_at_risk_count": sum(w["sla_status"] == "FAIL" for w in results), "total_demand_rpm": round(total_demand, 1),
        "estimated_served_rpm": round(total_served, 1), "estimated_cluster_power_w": round(total_power, 1),
        "assignments": assignment_records, "workloads": results, "gpus": gpu_output,
        "disclaimer": "All workload telemetry, capacity, latency, throughput, and power values are simulated estimates, not physical measurements."}
