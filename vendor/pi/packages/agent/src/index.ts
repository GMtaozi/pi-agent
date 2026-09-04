// Core Agent

export { uuidv7 } from "@earendil-works/pi-ai";
export type {
	AttributeValue,
	ExactTelemetryAttributes,
	InferEventAttributes,
	InferOptionalAttributes,
	InferRequiredAndOptionalAttributes,
	InferStartAttributes,
	RecordedTelemetryEvent,
	RecordedTelemetrySpan,
	SchemaTelemetrySpan,
	SpanAttributes,
	SpanAttributes as TelemetrySpanAttributes,
	SpanOptions,
	SpanStatus,
	TelemetryAttributeDefinition,
	TelemetryAttributeMetadata,
	TelemetryAttributeType,
	TelemetryContext,
	TelemetryEventAttributeDefinition,
	TelemetryEventDefinition,
	TelemetryParentDefinition,
	TelemetrySchemaDefinition,
	TelemetrySchemaSpanEndAttributes,
	TelemetrySchemaSpanEventAttributes,
	TelemetrySchemaSpanEventName,
	TelemetrySchemaSpanName,
	TelemetrySchemaSpanStartAttributes,
	TelemetrySchemaSpanUnion,
	TelemetrySpan,
	TelemetrySpanDefinition,
	TelemetryStartAttributeDefinition,
	TypedSpanStarter,
} from "@earendil-works/pi-telemetry";
export {
	createTypedSpanStarter,
	defineTelemetrySchema,
	InMemoryTelemetryContext,
	NOOP_TELEMETRY_CONTEXT,
} from "@earendil-works/pi-telemetry";
export * from "./agent.js";
// Loop functions
export * from "./agent-loop.js";
export * from "./harness/agent-harness.js";
export {
	type BranchPreparation,
	type BranchSummaryDetails,
	type BranchSummaryResult,
	type CollectEntriesResult,
	collectEntriesForBranchSummary,
	type FileOperations,
	type GenerateBranchSummaryOptions,
	generateBranchSummary,
	prepareBranchEntries,
} from "./harness/compaction/branch-summarization.js";
export {
	type CompactionPreparation,
	type CompactionSettings,
	type CompactResult,
	calculateContextTokens,
	compact,
	DEFAULT_COMPACTION_SETTINGS,
	estimateContextTokens,
	estimateTokens,
	findCutPoint,
	findTurnStartIndex,
	generateSummary,
	generateSummaryWithUsage,
	getLastAssistantUsage,
	prepareCompaction,
	serializeConversation,
	shouldCompact,
} from "./harness/compaction/compaction.js";
export * from "./harness/messages.js";
export * from "./harness/prompt-templates.js";
// Harness
export * from "./harness/result.js";
export * from "./harness/session/index.js";
export * from "./harness/skills.js";
export * from "./harness/system-prompt.js";
export type {
	AiSpan,
	AiSpanAttributes,
	AiSpanEndAttributes,
	AiSpanEventAttributes,
	AiSpanEventName,
	AiSpanName,
	AiSpanStartAttributes,
	AiTelemetrySpan,
	HarnessSpan,
	HarnessSpanAttributes,
	HarnessSpanEndAttributes,
	HarnessSpanEventAttributes,
	HarnessSpanEventName,
	HarnessSpanName,
	HarnessSpanStartAttributes,
	HarnessTelemetrySpan,
} from "./harness/telemetry.js";
export {
	AGENT_TELEMETRY_SCHEMAS,
	AI_TELEMETRY_SCHEMA,
	HARNESS_TELEMETRY_SCHEMA,
	startAiSpan,
	startHarnessSpan,
} from "./harness/telemetry.js";
export * from "./harness/tools/index.js";
export {
	type AgentHarnessResources,
	type AgentHarnessStreamOptions,
	type AgentHarnessStreamOptionsPatch,
	type AgentHarnessTool,
	type AgentHarnessToolContextSource,
	BranchSummaryError,
	type BranchSummaryErrorCode,
	CompactionError,
	type CompactionErrorCode,
	type ExecutionEnv,
	ExecutionError,
	type ExecutionErrorCode,
	err,
	FileError,
	type FileErrorCode,
	type FileInfo,
	type FileKind,
	type FileSystem,
	getOrThrow,
	getOrUndefined,
	ok,
	type PromptTemplate,
	type Shell,
	type ShellExecOptions,
	type Skill,
	toError,
} from "./harness/types.js";
export * from "./harness/utils/shell-output.js";
export * from "./harness/utils/truncate.js";
// Proxy utilities
export * from "./proxy.js";
export * from "./search/index.js";
// Stream defaults
export { setDefaultStreamFn } from "./stream-fn.js";
// Types
export * from "./types.js";
