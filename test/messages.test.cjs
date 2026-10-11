// SPDX-License-Identifier: AGPL-3.0-only
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Config } = require('../lib/config')
const { MessageFlow } = require('../lib/core/messages')
test('selected waiting and result messages are recalled only after the workflow finishes', async () => {
  const scheduled = [], removed = []; let id = 0
  const ctx = { setTimeout(fn, ms) { scheduled.push({ fn, ms }) }, logger() { return { debug() {} } } }
  const session = { channelId: 'channel', async send() { return [String(++id)] }, bot: { async deleteMessage(channel, message) { removed.push([channel, message]) } } }
  const flow = new MessageFlow(ctx, session, Config({ recallTargets: ['waiting', 'result'] }))
  await flow.send('waiting', 'waiting'); assert.equal(scheduled.length, 0)
  await flow.send('damage', 'damage'); await flow.send('result', 'result'); await flow.send('image', 'result', true)
  assert.equal(scheduled.length, 0); flow.end(); assert.equal(scheduled.length, 1); assert.equal(scheduled[0].ms, 5000)
  await scheduled[0].fn(); assert.deepEqual(removed, [['channel', '1'], ['channel', '3']])
})
test('platform recall failure does not block recalling other selected messages', async () => {
  let callback, calls = 0
  const flow = new MessageFlow({ setTimeout(fn) { callback = fn }, logger() { return { debug() {} } } },
    { channelId: 'channel', async send() { return ['1', '2'] }, bot: { async deleteMessage() { calls++; if (calls === 1) throw Error('unsupported') } } }, Config({ recallTargets: ['trade'] }))
  await flow.send('sale', 'trade'); flow.end(); await callback(); assert.equal(calls, 2)
})
