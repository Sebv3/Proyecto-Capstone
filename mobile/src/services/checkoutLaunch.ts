type BrowserDrivers = {
  openLink: (url: string) => Promise<unknown>;
  openBrowser: (url: string, options: { toolbarColor: string; showTitle: boolean }) => Promise<{ type: string }>;
};
export class CheckoutBrowserError extends Error {
  constructor() {
    super('No pudimos abrir el navegador del pago. Cierra la ventana anterior y vuelve a intentarlo.');
    this.name = 'CheckoutBrowserError';
  }
}
// Keep native checkout in Safari/Chrome Custom Tabs rather than asking the OS to
// hand the initial universal link directly to an installed Mercado Pago app.
export async function launchCheckout(url: string, platform: string, drivers: BrowserDrivers): Promise<{ closed: boolean }> {
  try {
    if (platform === 'web') {
      await drivers.openLink(url);
      return { closed: false };
    }
    const result = await drivers.openBrowser(url, { toolbarColor: '#087D56', showTitle: true });
    if (result.type === 'locked') throw new CheckoutBrowserError();
    // A closed browser says nothing about payment approval. Caller must reconcile.
    return { closed: result.type === 'cancel' || result.type === 'dismiss' };
  } catch {
    throw new CheckoutBrowserError();
  }
}
