--
-- Table structure for table `artifacts`
--

DROP TABLE IF EXISTS `artifacts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `artifacts` (
  `id` char(36) COLLATE utf8mb4_general_ci NOT NULL,
  `run_id` char(36) COLLATE utf8mb4_general_ci NOT NULL,
  `artifact_type` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `content_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `content_hash` char(64) COLLATE utf8mb4_general_ci NOT NULL,
  `size_bytes` int NOT NULL,
  `created_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_artifacts_run_id` (`run_id`),
  KEY `idx_artifacts_hash` (`content_hash`),
  CONSTRAINT `artifacts_chk_1` CHECK (json_valid(`content_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `contracts`
--

DROP TABLE IF EXISTS `contracts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contracts` (
  `id` char(36) COLLATE utf8mb4_general_ci NOT NULL,
  `domain_id` varchar(64) COLLATE utf8mb4_general_ci NOT NULL,
  `contract_version` varchar(32) COLLATE utf8mb4_general_ci NOT NULL,
  `schema_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `schema_hash` char(64) COLLATE utf8mb4_general_ci NOT NULL,
  `created_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_domain_version` (`domain_id`,`contract_version`),
  UNIQUE KEY `uq_contracts_domain_version` (`domain_id`,`contract_version`),
  KEY `idx_domain` (`domain_id`),
  KEY `idx_hash` (`schema_hash`),
  CONSTRAINT `contracts_chk_1` CHECK (json_valid(`schema_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `mutations`
--

DROP TABLE IF EXISTS `mutations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `mutations` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `run_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `from_step_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `to_step_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `patch_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `summary_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_mutations_run_id` (`run_id`),
  KEY `idx_mutations_from_to` (`from_step_id`,`to_step_id`),
  KEY `idx_mutations_created` (`created_at`),
  CONSTRAINT `mutations_chk_1` CHECK (json_valid(`patch_json`)),
  CONSTRAINT `mutations_chk_2` CHECK (json_valid(`summary_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `run_steps`
--

DROP TABLE IF EXISTS `run_steps`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `run_steps` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `run_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `seq` int NOT NULL,
  `type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `input_hash` char(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `output_hash` char(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `step_output_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `validation_report_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `meta_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_run_steps_run_seq` (`run_id`,`seq`),
  KEY `idx_run_steps_run_id` (`run_id`),
  KEY `idx_run_steps_type` (`type`),
  KEY `idx_run_steps_created` (`created_at`),
  CONSTRAINT `run_steps_chk_1` CHECK (json_valid(`step_output_json`)),
  CONSTRAINT `run_steps_chk_2` CHECK (json_valid(`validation_report_json`)),
  CONSTRAINT `run_steps_chk_3` CHECK (json_valid(`meta_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `runs`
--

DROP TABLE IF EXISTS `runs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `runs` (
  `id` char(36) COLLATE utf8mb4_general_ci NOT NULL,
  `correlation_id` char(36) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `input_hash` char(64) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `output_hash` char(64) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_general_ci NOT NULL,
  `domain_id` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `contract_version` varchar(20) COLLATE utf8mb4_general_ci NOT NULL,
  `input_payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `working_payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `result_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `validation_report` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `provenance` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `created_at` datetime(3) NOT NULL,
  `completed_at` datetime(3) DEFAULT NULL,
  `repair_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `locked_at` datetime DEFAULT NULL,
  `locked_by` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `attempts` int NOT NULL DEFAULT '0',
  `next_attempt_at` datetime DEFAULT NULL,
  `last_error` text COLLATE utf8mb4_general_ci,
  PRIMARY KEY (`id`),
  KEY `idx_runs_created_at` (`created_at`),
  KEY `idx_runs_domain_id` (`domain_id`),
  KEY `idx_runs_correlation_id` (`correlation_id`),
  KEY `idx_runs_input_hash` (`input_hash`),
  KEY `idx_runs_queue` (`status`,`next_attempt_at`,`locked_at`,`created_at`),
  CONSTRAINT `runs_chk_1` CHECK (json_valid(`input_payload`)),
  CONSTRAINT `runs_chk_2` CHECK (json_valid(`working_payload`)),
  CONSTRAINT `runs_chk_3` CHECK (json_valid(`result_json`)),
  CONSTRAINT `runs_chk_4` CHECK (json_valid(`validation_report`)),
  CONSTRAINT `runs_chk_5` CHECK (json_valid(`provenance`)),
  CONSTRAINT `runs_chk_6` CHECK (json_valid(`repair_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `steps`
--

DROP TABLE IF EXISTS `steps`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `steps` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `run_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `step_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `attempt_number` int NOT NULL DEFAULT '1',
  `input_hash` char(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `output_hash` char(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `error_code` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `error_message` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `created_at` datetime(3) NOT NULL,
  `completed_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_steps_run_id` (`run_id`),
  KEY `idx_steps_run_id_created` (`run_id`,`created_at`),
  CONSTRAINT `steps_chk_1` CHECK (json_valid(`metadata_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `uploaded_artifacts`
--

DROP TABLE IF EXISTS `uploaded_artifacts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `uploaded_artifacts` (
  `id` char(36) COLLATE utf8mb4_general_ci NOT NULL,
  `sha256` char(64) COLLATE utf8mb4_general_ci NOT NULL,
  `size_bytes` bigint NOT NULL,
  `content_type` varchar(128) COLLATE utf8mb4_general_ci NOT NULL,
  `original_filename` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `stored_path` text COLLATE utf8mb4_general_ci NOT NULL,
  `metadata_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_uploaded_artifacts_sha256` (`sha256`),
  KEY `idx_uploaded_artifacts_created_at` (`created_at`),
  CONSTRAINT `uploaded_artifacts_chk_1` CHECK (json_valid(`metadata_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `worker_heartbeats`
--

DROP TABLE IF EXISTS `worker_heartbeats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `worker_heartbeats` (
  `worker_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `host` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pid` int DEFAULT NULL,
  `poll_ms` int DEFAULT NULL,
  `requeue_every_loops` int DEFAULT NULL,
  `last_seen_at` datetime(3) NOT NULL,
  PRIMARY KEY (`worker_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-03-13 10:01:20
