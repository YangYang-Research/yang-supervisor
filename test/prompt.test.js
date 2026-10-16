import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSupervisorMessages, wrapComment} from '../src/prompt.js';

test('buildSupervisorMessages includes classification sections', () => {
  const messages = buildSupervisorMessages({
    eventType: 'issue',
    title: 'How to hook RN?',
    body: 'Need help hooking JS',
    author: 'alice',
    labels: ['question']
  });
  assert.equal(messages[0].role, 'system');
  assert.match(messages[1].content, /Classification/);
  assert.match(messages[1].content, /How to hook RN/);
});

test('wrapComment adds yang-git-assistant marker', () => {
  const body = wrapComment('## Summary\nHello');
  assert.match(body, /<!-- yang-git-assistant -->/);
  assert.match(body, /Yang Git Assistant/);
});
