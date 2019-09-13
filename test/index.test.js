// index.test.js

const nock = require('nock')

// Requiring our app implementation
const myProbotApp = require('..')
const { Probot } = require('probot')

// Fixtures and outputs
const payloadIssueOpen = require('./fixtures/issues.opened')
const issueCreatedBody = { body: 'Thanks for opening this issue!' }

const payloadCheckRunCreate = require('./fixtures/check_run.created')
const payloadCheckRunFail = require('./fixtures/check_run.failed')
const payloadCheckRunCancel = require('./fixtures/check_run.canceled')
const payloadCheckRunPass = require('./fixtures/check_run.passed')
const payloadCheckRunRequestAction = require('./fixtures/check_run.requested_action')
const newCheckRunOutput = {
  name: 'Visual Difference Tests'
}
const buildFailedCommentBody = {
  body: 'Hey there! It looks like your Pull Request build failed.'
}

nock.disableNetConnect()

describe('Visual-Difference Bot', () => {
  let probot

  beforeEach(() => {
    probot = new Probot({})
    // Load our app into probot
    const app = probot.load(myProbotApp)

    // Just return a test token
    app.app = () => 'test'
  })

  // Testing receiving a sample event
  test('parsing data on a sample event', async () => {
    // Test that we correctly return a test token
    nock('https://api.github.com')
      .post('/app/installations/2/access_tokens')
      .reply(200, { token: 'test' })

    // Test that a comment is posted (example of an event)
    nock('https://api.github.com')
      .post('/repos/BrightspaceHypermediaComponents/activities/issues/1/comments', (body) => {
        expect(body).toMatchObject(issueCreatedBody)
        return true
      })
      .reply(200)

    // Receive a webhook event
    await probot.receive({ name: 'issues', payload: payloadIssueOpen })
  })

  // Check that we can process the receipt of a check_run.created event.
  test('creating a check-run when Travis PR build is created', async () => {
    // Test for POSTing a check_run
    nock('https://api.github.com')
      .post('/repos/BrightspaceHypermediaComponents/activities/check-runs')
      .reply(200, newCheckRunOutput)

    // Receive a webhook event
    await probot.receive({ name: 'check_run', payload: payloadCheckRunCreate })
  })

  // Check that we can process the receipt of a check_run.completed failure event.
  test('updating a check-run to failed when visual diff tests fail in Travis', async () => {
    // Test for POSTing a check_run
    nock('https://api.github.com')
      .post('/repos/BrightspaceHypermediaComponents/activities/check-runs')
      .reply(200, newCheckRunOutput)

    // Test that a comment is posted (example of an event)
    nock('https://api.github.com')
      .post('/repos/BrightspaceHypermediaComponents/activities/issues/352/comments', (body) => {
        expect(body.body.includes(buildFailedCommentBody.body))
        return true
      })
      .reply(200)

    // Receive a webhook event
    await probot.receive({ name: 'check_run', payload: payloadCheckRunFail })
  })

  // Check that we can process the receipt of a check_run.completed cancelled event.
  test('updating a check-run to cancelled when visual diff tests are cancelled in Travis', async () => {
    // Test for POSTing a check_run
    nock('https://api.github.com')
      .post('/repos/BrightspaceHypermediaComponents/activities/check-runs')
      .reply(200, newCheckRunOutput)

    // Receive a webhook event
    await probot.receive({ name: 'check_run', payload: payloadCheckRunCancel })
  })

  // Check that we can process the receipt of a check_run.completed success event.
  test('updating a check-run to success when visual diff tests pass in Travis', async () => {
    // Test for POSTing a check_run
    nock('https://api.github.com')
      .post('/repos/BrightspaceHypermediaComponents/activities/check-runs')
      .reply(200, newCheckRunOutput)

    // Receive a webhook event
    await probot.receive({ name: 'check_run', payload: payloadCheckRunPass })
  })

  // Check that we can process the receipt of a check_run.requested_action event.
  test('requesting action on the check run', async () => {
    // Test that we correctly call the Travis API
    nock('https://api.travis-ci.com')
      .post('/repo/BrightspaceHypermediaComponents%2Factivities/requests')
      .reply(200)

    // Receive a webhook event
    await probot.receive({ name: 'check_run.requested_action', payload: payloadCheckRunRequestAction })
  })
})
