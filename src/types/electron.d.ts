export {};

declare global {
  interface Window {
    charlie?: {
      getVersion: () => Promise<string>;
    };
  }
}
