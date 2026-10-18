import assert from 'node:assert/strict';
import test from 'node:test';
import { CheckoutBrowserError, launchCheckout } from '../src/services/checkoutLaunch.ts';
const url = 'https://www.mercadopago.cl/checkout/v1/redirect?pref_id=test';

test('iOS and Android use native browser rather than universal-link app dispatch', async () => {
  for (const platform of ['ios', 'android']) {
    let opened = 0;
    const result = await launchCheckout(url, platform, {
      openLink: () => assert.fail('Native checkout should not dispatch to Mercado Pago app'),
      openBrowser: async (value, options) => {
        assert.equal(value, url); assert.equal(options.toolbarColor, '#087D56');
        opened++; return { type: platform === 'ios' ? 'cancel' : 'opened' };
      },
    });
    assert.equal(opened, 1);
    assert.equal(result.closed, platform === 'ios');
    assert.equal(result.approved, undefined);
  }
});
test('web preserves its existing link flow without starting a native browser', async () => {
  let opened = false;
  const result = await launchCheckout(url, 'web', {
    openLink: async (value) => { assert.equal(value, url); opened = true; },
    openBrowser: () => assert.fail('Web should not start native browser'),
  });
  assert.equal(opened, true); assert.equal(result.closed, false);
});
test('dismissal requests reconciliation, never marks a payment approved', async () => {
  const result = await launchCheckout(url, 'ios', {
    openLink: () => assert.fail('unexpected link call'),
    openBrowser: async () => ({ type: 'dismiss' }),
  });
  assert.deepEqual(result, { closed: true });
});
test('locked browser and native launch failures surface a browser-specific retry message', async () => {
  for (const openBrowser of [async () => ({ type: 'locked' }), async () => { throw new Error('native error'); }]) {
    await assert.rejects(launchCheckout(url, 'ios', {
      openLink: () => assert.fail('unexpected link call'), openBrowser,
    }), (error) => error instanceof CheckoutBrowserError && /navegador/.test(error.message));
  }
});
