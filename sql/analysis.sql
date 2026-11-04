SET search_path TO production;

-- 1. 案例規模與完整性
SELECT * FROM case_profile ORDER BY 1,2;

-- 2. 工件加工需求排名
SELECT * FROM job_load ORDER BY 1,2;

-- 3. 各機台負荷與占比
SELECT * FROM machine_load ORDER BY 1,2;

-- 4. 各機台工序數與平均工時
SELECT * FROM machine_work ORDER BY 1,2;

-- 5. 最長的十道工序
SELECT * FROM long_operations ORDER BY 1,2;

-- 6. 情境利用率與閒置
SELECT * FROM machine_capacity ORDER BY 1,2;

-- 7. 開頭、中間、結尾空檔
SELECT * FROM machine_gaps ORDER BY 1,2;

-- 8. 案例負荷不均衡
SELECT * FROM load_imbalance ORDER BY 1,2;

-- 9. 情境完工跨度與平均利用率
SELECT * FROM scenario_summary ORDER BY 1,2;

-- 10. 工件完工與排隊等待
SELECT * FROM job_performance ORDER BY 1,2;

-- 11. 相對 FIFO 改善率
SELECT * FROM rule_comparison ORDER BY 1,2;

-- 12. 高負荷候選機台空檔變化
SELECT * FROM high_load_gaps ORDER BY 1,2;
