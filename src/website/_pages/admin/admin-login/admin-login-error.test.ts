import assert from 'node:assert/strict';
import test from 'node:test';
import { adminLoginErrorMessage } from './admin-login-error.ts';

test('explains an incorrect password without exposing server details', () => {
  assert.equal(adminLoginErrorMessage(401), 'The password is incorrect. Please try again.');
});

test('explains a temporary sign-in lockout', () => {
  assert.equal(adminLoginErrorMessage(429), 'Too many attempts. Please wait 15 minutes before trying again.');
});

test('explains unavailable sign-in configuration', () => {
  assert.equal(adminLoginErrorMessage(503), 'Sign-in is not configured. Please contact a site administrator.');
});

test('keeps unexpected sign-in failures generic', () => {
  assert.equal(adminLoginErrorMessage(500), 'Sign-in is temporarily unavailable. Please try again shortly.');
  assert.equal(adminLoginErrorMessage(undefined), 'Sign-in is temporarily unavailable. Please try again shortly.');
});
