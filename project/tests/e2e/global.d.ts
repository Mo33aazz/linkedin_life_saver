interface StealthPlugin {
  // Opaque type representing the puppeteer-extra stealth plugin.
  _isPuppeteerExtraPlugin: boolean;
}

declare module 'puppeteer-extra-plugin-stealth' {
  const stealth: () => StealthPlugin;
  export default stealth;
}
