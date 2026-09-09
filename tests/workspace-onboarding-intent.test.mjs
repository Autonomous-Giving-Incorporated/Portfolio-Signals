import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ONBOARDING_INTENT_KEY,
  bindOnboardingIntentToUser,
  captureOnboardingIntent,
  clearOnboardingIntent,
  readOnboardingIntent,
  resolveOnboardingIntent
} from '../workspace/onboarding-intent.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
}

describe('shared onboarding entry intent', () => {
  test('captures only the Impact Relay intent and a literal tenant hint', () => {
    const storage = memoryStorage();
    assert.deepEqual(captureOnboardingIntent(
      'https://autogive.app/portfolio-signals/workspace?onboarding=impact-relay&tenant=org_example',
      storage
    ), { source: 'impact-relay', tenantHint: 'org_example' });
    assert.deepEqual(JSON.parse(storage.getItem(ONBOARDING_INTENT_KEY)).intent, {
      source: 'impact-relay', tenantHint: 'org_example'
    });
  });

  test('rejects duplicate intent parameters and does not honor redirect-shaped input', () => {
    const storage = memoryStorage();
    assert.equal(captureOnboardingIntent(
      'https://autogive.app/portfolio-signals/workspace?onboarding=impact-relay&onboarding=evil&next=https://evil.invalid',
      storage
    ), null);
    assert.equal(storage.getItem(ONBOARDING_INTENT_KEY), null);
  });

  test('marks malformed or duplicate tenant hints unavailable without preserving their value', () => {
    for (const query of [
      'onboarding=impact-relay&tenant=../../private-user',
      'onboarding=impact-relay&tenant=org_one&tenant=org_two'
    ]) {
      const storage = memoryStorage();
      assert.deepEqual(captureOnboardingIntent(`https://autogive.app/workspace?${query}`, storage), {
        source: 'impact-relay', tenantHint: null, invalidTenantHint: true
      });
      assert.deepEqual(resolveOnboardingIntent(
        readOnboardingIntent(storage),
        [{ id: 'org_one', role: 'director' }]
      ), { available: false, client: null });
      assert.doesNotMatch(storage.getItem(ONBOARDING_INTENT_KEY), /private-user|org_one|org_two/);
    }
  });

  test('enforces the verified tenant length grammar', () => {
    const valid = `org_${'a'.repeat(124)}`;
    const tooLong = `org_${'a'.repeat(125)}`;
    assert.equal(captureOnboardingIntent(
      `https://autogive.app/workspace?onboarding=impact-relay&tenant=${valid}`,
      memoryStorage()
    ).tenantHint, valid);
    assert.deepEqual(captureOnboardingIntent(
      `https://autogive.app/workspace?onboarding=impact-relay&tenant=${tooLong}`,
      memoryStorage()
    ), { source: 'impact-relay', tenantHint: null, invalidTenantHint: true });
  });
});

describe('authorized onboarding intent resolution', () => {
  test('selects a hinted tenant only from the authenticated context list', () => {
    const intent = { source: 'impact-relay', tenantHint: 'org_authorized' };
    assert.deepEqual(resolveOnboardingIntent(intent, [
      { id: 'org_other', role: 'director' },
      { id: 'org_authorized', role: 'director' }
    ]), {
      available: true,
      client: { id: 'org_authorized', role: 'director' }
    });
    assert.deepEqual(resolveOnboardingIntent(intent, [
      { id: 'org_other', role: 'director' }
    ]), { available: false, client: null });
  });
});

describe('persisted onboarding intent', () => {
  test('expires and removes stale intent', () => {
    const storage = memoryStorage();
    captureOnboardingIntent(
      'https://autogive.app/portfolio-signals/workspace?onboarding=impact-relay&tenant=org_example',
      storage,
      1_000
    );
    assert.equal(readOnboardingIntent(storage, 1_000 + 30 * 60 * 1000), null);
    assert.equal(storage.getItem(ONBOARDING_INTENT_KEY), null);
  });

  test('rejects forged storage values and clears them', () => {
    for (const value of [
      '{not json',
      JSON.stringify({ source: 'impact-relay', tenantHint: 'org_example', expiresAt: 'never' }),
      JSON.stringify({ source: 'impact-relay', tenantHint: 'org_EXAMPLE', expiresAt: Date.now() + 60_000 }),
      JSON.stringify({ source: 'other', tenantHint: null, expiresAt: Date.now() + 60_000 })
    ]) {
      const storage = memoryStorage();
      storage.setItem(ONBOARDING_INTENT_KEY, value);
      assert.equal(readOnboardingIntent(storage), null);
      assert.equal(storage.getItem(ONBOARDING_INTENT_KEY), null);
    }
  });

  test('continues safely when session storage is unavailable', () => {
    const storage = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
      removeItem() { throw new Error('blocked'); }
    };
    assert.deepEqual(captureOnboardingIntent(
      'https://autogive.app/workspace?onboarding=impact-relay&tenant=org_example',
      storage
    ), { source: 'impact-relay', tenantHint: 'org_example' });
    assert.equal(readOnboardingIntent(storage), null);
  });

  test('continues safely when the global sessionStorage getter throws', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() { throw new Error('blocked'); }
    });
    try {
      assert.deepEqual(captureOnboardingIntent(
        'https://autogive.app/workspace?onboarding=impact-relay&tenant=org_example'
      ), { source: 'impact-relay', tenantHint: 'org_example' });
      assert.equal(readOnboardingIntent(), null);
      assert.doesNotThrow(() => clearOnboardingIntent());
      assert.equal(bindOnboardingIntentToUser(
        { source: 'impact-relay', tenantHint: 'org_example' },
        'user-1'
      ).userId, 'user-1');
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor);
      else delete globalThis.sessionStorage;
    }
  });

  test('does not replay a pending intent for a different signed-in user', () => {
    const storage = memoryStorage();
    captureOnboardingIntent(
      'https://autogive.app/workspace?onboarding=impact-relay&tenant=org_example',
      storage
    );
    const claimed = bindOnboardingIntentToUser(readOnboardingIntent(storage), 'user-1', storage);
    assert.equal(claimed.userId, 'user-1');
    assert.equal(readOnboardingIntent(storage).userId, 'user-1');
    assert.equal(bindOnboardingIntentToUser(readOnboardingIntent(storage), 'user-2', storage), null);
    assert.equal(storage.getItem(ONBOARDING_INTENT_KEY), null);
  });
});
