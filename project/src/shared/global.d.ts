export {};

declare global {
  interface Window {
    __LINKEDIN_SAVE_AI_CONFIG?: () => Promise<void>;
  }
}
