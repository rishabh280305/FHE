// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import {
    FHE,
    InEbool,
    InEuint8,
    InEuint32,
    ebool,
    euint8,
    euint32
} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

/// @title CipherPulseAnalytics
/// @notice Confidential analytics primitive for Web3 protocols, DAOs and communities.
/// @dev Stores encrypted aggregate state only. No raw wallet-level values are emitted or stored.
contract CipherPulseAnalytics {
    uint8 public constant COHORT_COUNT = 4;
    uint32 public constant DEFAULT_RISK_THRESHOLD = 70;

    enum Metric {
        Users,
        Volume,
        RiskHigh,
        DaoYes,
        DaoNo,
        CohortMetric,
        Alert
    }

    struct CohortAggregate {
        euint32 encryptedUsers;
        euint32 encryptedVolume;
        euint32 encryptedRiskHigh;
        euint32 encryptedDaoYes;
        euint32 encryptedDaoNo;
        euint32 encryptedMetricTotal;
    }

    address public owner;
    mapping(address => bool) public analysts;
    mapping(uint8 => CohortAggregate) private cohortAggregates;
    ebool private latestAlert;

    event AnalystUpdated(address indexed analyst, bool allowed);
    event WalletSignalSubmitted(address indexed sender, uint8 indexed cohort, bytes32 activityHandle, bytes32 riskHandle);
    event DaoPulseSubmitted(address indexed sender, uint8 indexed cohort, bytes32 voteHandle);
    event CohortMetricSubmitted(address indexed sender, uint8 indexed cohort, bytes32 metricHandle);
    event ConfidentialAlertSubmitted(address indexed sender, bytes32 kpiHandle, bytes32 alertHandle);
    event FullSignalSubmitted(
        address indexed sender,
        uint8 indexed cohort,
        bytes32 activityHandle,
        bytes32 riskHandle,
        bytes32 voteHandle,
        bytes32 kpiHandle,
        bytes32 alertHandle
    );
    event MetricRevealAuthorized(address indexed requester, uint8 indexed metric, uint8 indexed cohort, bytes32 handle);

    error NotOwner();
    error NotAnalyst();
    error InvalidCohort();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAnalyst() {
        if (msg.sender != owner && !analysts[msg.sender]) revert NotAnalyst();
        _;
    }

    constructor() {
        owner = msg.sender;
        analysts[msg.sender] = true;
        emit AnalystUpdated(msg.sender, true);
    }

    function setAnalyst(address analyst, bool allowed) external onlyOwner {
        analysts[analyst] = allowed;
        emit AnalystUpdated(analyst, allowed);
    }

    function submitWalletSignal(
        InEuint32 memory encryptedActivity,
        InEuint32 memory encryptedRisk,
        uint8 cohort
    ) external {
        _requireCohort(cohort);
        CohortAggregate storage aggregate = cohortAggregates[cohort];

        euint32 activity = FHE.asEuint32(encryptedActivity);
        euint32 risk = FHE.asEuint32(encryptedRisk);

        // FHE add: increment encrypted cohort count without revealing the submitter's raw activity.
        aggregate.encryptedUsers = FHE.add(aggregate.encryptedUsers, FHE.asEuint32(1));

        // FHE add: aggregate encrypted volume; only the encrypted total is stored.
        aggregate.encryptedVolume = FHE.add(aggregate.encryptedVolume, activity);

        // FHE compare + cast: count high-risk wallets without revealing individual risk scores.
        ebool isHighRisk = FHE.gte(risk, FHE.asEuint32(DEFAULT_RISK_THRESHOLD));
        aggregate.encryptedRiskHigh = FHE.add(aggregate.encryptedRiskHigh, FHE.asEuint32(isHighRisk));

        _allowCohortAggregate(aggregate);
        emit WalletSignalSubmitted(msg.sender, cohort, euint32.unwrap(activity), euint32.unwrap(risk));
    }

    function submitFullSignal(
        InEuint32 memory encryptedActivity,
        InEuint32 memory encryptedRisk,
        InEbool memory encryptedVoteOrSentiment,
        InEuint32 memory encryptedKpi,
        uint8 cohort,
        uint32 publicAlertThreshold
    ) external {
        _requireCohort(cohort);
        CohortAggregate storage aggregate = cohortAggregates[cohort];

        euint32 activity = FHE.asEuint32(encryptedActivity);
        euint32 risk = FHE.asEuint32(encryptedRisk);
        ebool voteYes = FHE.asEbool(encryptedVoteOrSentiment);
        euint32 kpi = FHE.asEuint32(encryptedKpi);

        // FHE add: encrypted cohort count and volume are updated without storing raw user values.
        aggregate.encryptedUsers = FHE.add(aggregate.encryptedUsers, FHE.asEuint32(1));
        aggregate.encryptedVolume = FHE.add(aggregate.encryptedVolume, activity);

        // FHE compare + cast: encrypted high-risk count is derived from the encrypted risk score.
        ebool isHighRisk = FHE.gte(risk, FHE.asEuint32(DEFAULT_RISK_THRESHOLD));
        aggregate.encryptedRiskHigh = FHE.add(aggregate.encryptedRiskHigh, FHE.asEuint32(isHighRisk));

        // FHE select: encrypted DAO pulse is aggregated without exposing the individual sentiment.
        aggregate.encryptedDaoYes = FHE.add(aggregate.encryptedDaoYes, FHE.asEuint32(voteYes));
        aggregate.encryptedDaoNo = FHE.add(aggregate.encryptedDaoNo, FHE.select(voteYes, FHE.asEuint32(0), FHE.asEuint32(1)));

        // FHE threshold: latest alert stores only an encrypted boolean handle.
        aggregate.encryptedMetricTotal = FHE.add(aggregate.encryptedMetricTotal, kpi);
        latestAlert = FHE.gte(kpi, FHE.asEuint32(publicAlertThreshold));

        _allowCohortAggregate(aggregate);
        FHE.allowThis(latestAlert);
        FHE.allowSender(latestAlert);

        emit FullSignalSubmitted(
            msg.sender,
            cohort,
            euint32.unwrap(activity),
            euint32.unwrap(risk),
            ebool.unwrap(voteYes),
            euint32.unwrap(kpi),
            ebool.unwrap(latestAlert)
        );
    }

    function submitDaoPulse(InEbool memory encryptedVoteOrSentiment, uint8 cohort) external {
        _requireCohort(cohort);
        CohortAggregate storage aggregate = cohortAggregates[cohort];

        ebool voteYes = FHE.asEbool(encryptedVoteOrSentiment);
        euint32 yesIncrement = FHE.asEuint32(voteYes);
        euint32 noIncrement = FHE.select(voteYes, FHE.asEuint32(0), FHE.asEuint32(1));

        // FHE add/select: update encrypted yes/no totals without publishing an individual vote.
        aggregate.encryptedDaoYes = FHE.add(aggregate.encryptedDaoYes, yesIncrement);
        aggregate.encryptedDaoNo = FHE.add(aggregate.encryptedDaoNo, noIncrement);

        _allowCohortAggregate(aggregate);
        emit DaoPulseSubmitted(msg.sender, cohort, ebool.unwrap(voteYes));
    }

    function submitCohortMetric(InEuint32 memory encryptedMetric, uint8 cohort) external {
        _requireCohort(cohort);
        CohortAggregate storage aggregate = cohortAggregates[cohort];

        euint32 metric = FHE.asEuint32(encryptedMetric);
        aggregate.encryptedMetricTotal = FHE.add(aggregate.encryptedMetricTotal, metric);

        _allowCohortAggregate(aggregate);
        emit CohortMetricSubmitted(msg.sender, cohort, euint32.unwrap(metric));
    }

    function submitConfidentialAlert(InEuint32 memory encryptedKpi, uint32 publicThreshold) external {
        euint32 kpi = FHE.asEuint32(encryptedKpi);

        // FHE threshold: release only the boolean alert handle, not the raw KPI.
        latestAlert = FHE.gte(kpi, FHE.asEuint32(publicThreshold));
        FHE.allowThis(latestAlert);
        FHE.allowSender(latestAlert);

        emit ConfidentialAlertSubmitted(msg.sender, euint32.unwrap(kpi), ebool.unwrap(latestAlert));
    }

    function submitBucketedRisk(InEuint8 memory encryptedRiskBucket, uint8 cohort) external {
        _requireCohort(cohort);
        CohortAggregate storage aggregate = cohortAggregates[cohort];
        euint8 bucket = FHE.asEuint8(encryptedRiskBucket);

        // FHE compare + bucket: count bucket >= 2 as high risk without exposing the bucket value.
        ebool isHighRisk = FHE.gte(bucket, FHE.asEuint8(2));
        aggregate.encryptedRiskHigh = FHE.add(aggregate.encryptedRiskHigh, FHE.asEuint32(isHighRisk));

        _allowCohortAggregate(aggregate);
        emit WalletSignalSubmitted(msg.sender, cohort, bytes32(0), euint8.unwrap(bucket));
    }

    function requestMetricReveal(Metric metric, uint8 cohort) external onlyAnalyst returns (bytes32 handle) {
        if (metric != Metric.Alert) _requireCohort(cohort);
        handle = _metricHandle(metric, cohort);
        emit MetricRevealAuthorized(msg.sender, uint8(metric), cohort, handle);
    }

    function allowMetricToSender(Metric metric, uint8 cohort) external onlyAnalyst returns (bytes32 handle) {
        if (metric != Metric.Alert) _requireCohort(cohort);
        CohortAggregate storage aggregate = cohortAggregates[cohort];

        if (metric == Metric.Users) FHE.allow(aggregate.encryptedUsers, msg.sender);
        else if (metric == Metric.Volume) FHE.allow(aggregate.encryptedVolume, msg.sender);
        else if (metric == Metric.RiskHigh) FHE.allow(aggregate.encryptedRiskHigh, msg.sender);
        else if (metric == Metric.DaoYes) FHE.allow(aggregate.encryptedDaoYes, msg.sender);
        else if (metric == Metric.DaoNo) FHE.allow(aggregate.encryptedDaoNo, msg.sender);
        else if (metric == Metric.CohortMetric) FHE.allow(aggregate.encryptedMetricTotal, msg.sender);
        else FHE.allow(latestAlert, msg.sender);

        handle = _metricHandle(metric, cohort);
        emit MetricRevealAuthorized(msg.sender, uint8(metric), cohort, handle);
    }

    function getDecryptResultSafe(Metric metric, uint8 cohort) external view onlyAnalyst returns (uint256 value, bool ready) {
        if (metric != Metric.Alert) _requireCohort(cohort);

        if (metric == Metric.Alert) {
            (bool alertResult, bool alertDecrypted) = FHE.getDecryptResultSafe(latestAlert);
            return (alertResult ? 1 : 0, alertDecrypted);
        }

        (uint32 metricResult, bool metricDecrypted) = FHE.getDecryptResultSafe(_metricAsEuint32(metric, cohort));
        return (metricResult, metricDecrypted);
    }

    function metricHandle(Metric metric, uint8 cohort) external view returns (bytes32) {
        if (metric != Metric.Alert) _requireCohort(cohort);
        return _metricHandle(metric, cohort);
    }

    function _allowCohortAggregate(CohortAggregate storage aggregate) private {
        FHE.allowThis(aggregate.encryptedUsers);
        FHE.allowThis(aggregate.encryptedVolume);
        FHE.allowThis(aggregate.encryptedRiskHigh);
        FHE.allowThis(aggregate.encryptedDaoYes);
        FHE.allowThis(aggregate.encryptedDaoNo);
        FHE.allowThis(aggregate.encryptedMetricTotal);
        FHE.allowSender(aggregate.encryptedUsers);
        FHE.allowSender(aggregate.encryptedVolume);
        FHE.allowSender(aggregate.encryptedRiskHigh);
        FHE.allowSender(aggregate.encryptedDaoYes);
        FHE.allowSender(aggregate.encryptedDaoNo);
        FHE.allowSender(aggregate.encryptedMetricTotal);
    }

    function _metricHandle(Metric metric, uint8 cohort) private view returns (bytes32) {
        if (metric == Metric.Alert) return ebool.unwrap(latestAlert);
        return euint32.unwrap(_metricAsEuint32(metric, cohort));
    }

    function _metricAsEuint32(Metric metric, uint8 cohort) private view returns (euint32) {
        CohortAggregate storage aggregate = cohortAggregates[cohort];
        if (metric == Metric.Users) return aggregate.encryptedUsers;
        if (metric == Metric.Volume) return aggregate.encryptedVolume;
        if (metric == Metric.RiskHigh) return aggregate.encryptedRiskHigh;
        if (metric == Metric.DaoYes) return aggregate.encryptedDaoYes;
        if (metric == Metric.DaoNo) return aggregate.encryptedDaoNo;
        return aggregate.encryptedMetricTotal;
    }

    function _requireCohort(uint8 cohort) private pure {
        if (cohort >= COHORT_COUNT) revert InvalidCohort();
    }
}
