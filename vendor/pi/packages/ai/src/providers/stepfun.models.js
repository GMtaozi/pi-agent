export const STEPFUN_MODELS = {
    id: "stepfun",
    name: "StepFun",
    models: {
        "step-3.7-flash": {
            id: "step-3.7-flash",
            name: "Step 3.7 Flash",
            api: "openai-completions",
            provider: "stepfun",
            baseUrl: "https://api.stepfun.com/step_plan/v1",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 8192,
            maxTokens: 4096
        }
    }
};
export const stepfunModels = STEPFUN_MODELS;
