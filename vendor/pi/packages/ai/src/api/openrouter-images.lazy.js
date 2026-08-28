export const openrouterImagesApi = () => ({
    generateImages: async (model, context, options) => (await import("./openrouter-images.ts")).generateImages(model, context, options),
});
