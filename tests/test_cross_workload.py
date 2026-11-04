from engine.cross_workload import DEFAULT_WORKLOADS, GPU_POOL, plan_cross_workload


def test_default_plan_has_valid_gpu_and_workload_totals():
    result = plan_cross_workload()
    assert result["workload_count"] == len(DEFAULT_WORKLOADS)
    assert result["allocated_gpu_count"] + result["idle_gpu_count"] == len(GPU_POOL)


def test_fractional_sharing_never_exceeds_gpu_compute_or_memory():
    result = plan_cross_workload()
    for gpu in result["gpus"]:
        assert 0 <= gpu["allocated_share_pct"] <= 100
        assert gpu["remaining_memory_gb"] >= 0
        assert sum(a["share_pct"] for a in gpu["allocations"]) <= 100


def test_one_gpu_can_host_multiple_workloads():
    gpu = [{"id":"GPU-A","model":"Test","memory_gb":80,"capacity_factor":1,"power_w":300}]
    workloads = [
        {"id":"llm","kind":"llm","demand_rpm":100,"priority":5,"memory_gb":20},
        {"id":"batch","kind":"batch","demand_rpm":100,"priority":1,"memory_gb":10},
    ]
    result = plan_cross_workload(workloads, gpu)
    assert len(result["gpus"][0]["allocations"]) == 2
    assert result["allocated_gpu_count"] == 1


def test_memory_incompatible_workload_is_queued():
    result = plan_cross_workload([{"id":"large","kind":"llm","demand_rpm":300,"memory_gb":90}])
    assert result["workloads"][0]["status"] == "QUEUED"
    assert result["workloads"][0]["assigned_gpus"] == []


def test_duplicate_ids_and_unknown_kinds_are_rejected():
    for payload, expected in [
        ([{"id":"x","kind":"llm"},{"id":"x","kind":"batch"}], "Duplicate"),
        ([{"id":"bad","kind":"video"}], "Unsupported"),
    ]:
        try:
            plan_cross_workload(payload)
        except ValueError as exc:
            assert expected in str(exc)
        else:
            raise AssertionError("Expected invalid workload input to be rejected")


def test_plan_is_explicitly_simulated():
    result = plan_cross_workload(DEFAULT_WORKLOADS)
    assert result["data_source"] == "SIMULATED CROSS-WORKLOAD PLAN"
    assert "not physical measurements" in result["disclaimer"]
