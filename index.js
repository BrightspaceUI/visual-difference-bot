// index.js
const CHECK_RUN_NAME = 'Visual Difference Tests'
const VD_TEST_MSG = 'Stage 2: Visual-difference-tests'
const VD_TEST_FAILURE = '### Stage 2: Visual-difference-tests\nThis stage **failed**'
const VD_TEST_CANCEL = '### Stage 2: Visual-difference-tests\nThis stage **canceled**'
const VD_TEST_PASS = '### Stage 2: Visual-difference-tests\nThis stage **passed**'
const GITHUB_API_BASE = 'https://api.github.com'
const TRAVIS_API_BASE = 'https://api.travis-ci.com'
const TRAVIS_HOME_BASE = 'https://travis-ci.com/'
const TRAVIS_BUILDS_PATH = '/builds/'
const TRAVIS_PR_BUILD = 'Travis CI - Pull Request'
const TRAVIS_BR_BUILD = 'Travis CI - Branch'

const QUEUED = 'queued'
const COMPLETED = 'completed'
const IN_PROG = 'in_progress'

const FAILURE = 'failure'
const SUCCESS = 'success'
const CANCELLED = 'cancelled'

const REGEN_CMD = 'r'
const LEAVE_COMMENTS = false

/*
 * ---------------------------------------------------------------------
 * -----------The command that regenerates the Golden images------------
 * ---------------------------------------------------------------------
 */
const MAKE_GOLDENS = 'npm run test:diff:golden && npm run test:diff:golden:commit'
const REGEN_NPM_CMD = `npm run build && ${MAKE_GOLDENS} || ${MAKE_GOLDENS}`
const PASS = `echo "Skipping...";`

const INFO_PREFIX = '[INFO] '
const ERROR_PREFIX = '[ERROR] '

var repoPath = ''
var repoPathTravis = ''

const got = require('got')

/**
 * @param {import('probot').Application} app
 */
module.exports = app => {
  app.on('*', async context => {
    console.log(`${INFO_PREFIX}Updated global information from GitHub event.`)
    await updateGlobals(context)
  })
  app.on('check_run', async context => {
    // If it's a travis PR build, create/update a Visual Difference check run.
    if (context.payload.check_run.name === TRAVIS_PR_BUILD) {
      const hasVDTest = await hasVisualDiffTest(context)
      if (hasVDTest && context.payload.check_run.status === QUEUED) {
        // If this travis PR has a VD test and it's queued.
        // Create our VD check run.
        await createInProgressCR(context)
      } else if (hasVDTest && context.payload.check_run.status === COMPLETED && context.payload.check_run.conclusion === SUCCESS) {
        // If this travis PR has a VD test and it's finished.
        // Finish our VD check run.
        await markCRComplete(context)
      } else if (hasVDTest && context.payload.check_run.status === COMPLETED && context.payload.check_run.conclusion === FAILURE && await confirmVDFailure(context)) {
        // If this travis PR has a VD test and it has failed.
        // Mark our VD check run as failed.
        await markCRFailed(context)
      } else if (hasVDTest && context.payload.check_run.status === COMPLETED && context.payload.check_run.conclusion === CANCELLED) {
        // If this travis PR has a VD test and it was cancelled.
        // Mark our VD check run as cancelled.
        await markCRCancelled(context)
      } else if (hasVDTest && context.payload.check_run.status === COMPLETED && context.payload.check_run.conclusion === FAILURE && await confirmVDCancel(context)) {
        // If this travis PR has a VD test and the build failed and the VD was cancelled.
        // Mark our VD check run as cancelled.
        await markCRCancelled(context)
      } else if (hasVDTest && context.payload.check_run.status === COMPLETED && context.payload.check_run.conclusion === FAILURE && await confirmVDPass(context)) {
        // If this travis PR has a VD test and the build failed but the VD passed.
        // Mark our VD check run as passed.
        await markCRComplete(context)
      }
    }
  })
  app.on('check_run.requested_action', async context => {
    if (context.payload.requested_action.identifier === REGEN_CMD) {
      const issueNum = await getIssueNumFromCRAction(context)
      const branch = await getBranchFromPR(context, issueNum)
      await regenGoldens(context, branch)
    }
  })
  app.on('check_run.rerequested', async context => {
    const issueNum = await getIssueNumFromCRAction(context)
    await reRunBuild(context, issueNum)
  })
}

const timer = ms => new Promise(resolve => setTimeout(resolve, ms))

async function updateGlobals (context) {
  repoPath = context.payload.repository.url.split(GITHUB_API_BASE)[1]
  repoPathTravis = repoPath.replace('/repos', '/repo')
  var regex = /\/(?=[^/]*$)/g
  repoPathTravis = repoPathTravis.replace(regex, '%2F')
}

async function hasVisualDiffTest (context) {
  return context.payload.check_run.output.text.includes(VD_TEST_MSG)
}

async function confirmVDFailure (context) {
  return context.payload.check_run.output.text.includes(VD_TEST_FAILURE)
}

async function confirmVDCancel (context) {
  return context.payload.check_run.output.text.includes(VD_TEST_CANCEL)
}

async function confirmVDPass (context) {
  return context.payload.check_run.output.text.includes(VD_TEST_PASS)
}

async function createInProgressCR (context) {
  const params = context.issue({
    name: CHECK_RUN_NAME,
    head_sha: context.payload.check_run.head_sha,
    status: IN_PROG,
    started_at: context.payload.check_run.started_at,
    output: {
      title: CHECK_RUN_NAME,
      summary: 'Visual difference tests are in progress.'
    },
    details_url: context.payload.check_run.details_url
  })

  console.log(`${INFO_PREFIX}Visual difference tests are in progress.`)
  return context.github.checks.create(params)
}

async function markCRComplete (context) {
  const params = context.issue({
    name: CHECK_RUN_NAME,
    head_sha: context.payload.check_run.head_sha,
    status: COMPLETED,
    conclusion: SUCCESS,
    started_at: context.payload.check_run.started_at,
    completed_at: context.payload.check_run.completed_at,
    output: {
      title: CHECK_RUN_NAME,
      summary: 'Visual difference tests passed!'
    },
    details_url: context.payload.check_run.details_url
  })

  console.log(`${INFO_PREFIX}Visual difference tests passed.`)
  return context.github.checks.create(params)
}

async function markCRCancelled (context) {
  const params = context.issue({
    name: CHECK_RUN_NAME,
    head_sha: context.payload.check_run.head_sha,
    status: COMPLETED,
    conclusion: CANCELLED,
    started_at: context.payload.check_run.started_at,
    completed_at: context.payload.check_run.completed_at,
    actions: [{
      label: 'Regenerate Goldens',
      description: 'Regenerate the Goldens from this branch.',
      identifier: REGEN_CMD
    }],
    output: {
      title: CHECK_RUN_NAME,
      summary: 'Visual difference tests were cancelled.'
    },
    details_url: context.payload.check_run.details_url
  })

  console.log(`${INFO_PREFIX}Visual difference tests were cancelled.`)
  return context.github.checks.create(params)
}

async function markCRFailed (context) {
  await makeCommentFailure(context)

  const params = context.issue({
    name: CHECK_RUN_NAME,
    head_sha: context.payload.check_run.head_sha,
    status: COMPLETED,
    conclusion: FAILURE,
    started_at: context.payload.check_run.started_at,
    completed_at: context.payload.check_run.completed_at,
    actions: [{
      label: 'Regenerate Goldens',
      description: 'Regenerate the Goldens from this branch.',
      identifier: REGEN_CMD
    }],
    output: {
      title: CHECK_RUN_NAME,
      summary: 'Visual difference tests failed.'
    },
    details_url: context.payload.check_run.details_url
  })

  console.log(`${INFO_PREFIX}Visual difference tests failed.`)
  return context.github.checks.create(params)
}

async function makeCommentFailure (context) {
  const URL = context.payload.check_run.details_url
  const issueNum = await getIssueNumFromCR(context)

  // Post a comment letting the dev know their build failed.
  const params = context.issue({
    body: `Hey there! It looks like your Pull Request \
               build failed, due to the Visual Difference tests failing. \
               Check out the details of the Travis build [here](${URL}). \
               To regenerate the Goldens please see the details page for this check run.`,
    number: issueNum
  })

  if (LEAVE_COMMENTS) {
    console.log(`${INFO_PREFIX}Leaving a comment on the PR due to a failed visual difference test.`)
    return context.github.issues.createComment(params)
  }
}

async function getIssueNumFromCR (context) {
  let issueNum = 0

  for (const element of context.payload.check_run.pull_requests) {
    if (element.hasOwnProperty('number')) {
      issueNum = element.number
      break
    }
  }

  return issueNum
}

async function getIssueNumFromCRAction (context) {
  let issueNum = 0

  for (const element of context.payload.check_run.check_suite.pull_requests) {
    issueNum = element.number
    break
  }

  return issueNum
}

async function getBranchFromPR (context, issueNum) {
  const params = context.issue({
    pull_number: issueNum,
    number: issueNum
  })

  const prInfo = await context.github.pullRequests.get(params)
  return prInfo.data.head.ref
}

async function regenGoldens (context, branchName) {
  const issueNum = await getIssueNumFromCRAction(context)

  // Custom build data to send to Travis
  const data = JSON.stringify({
    request: {
      merge_mode: 'deep_merge',
      config: {
        install: [
          'npm install'
        ],
        // We include many jobs as to override the existing jobs in the configuration
        jobs: {
          include: [{
            stage: 'Code-tests',
            script: [
              PASS
            ]
          },
          {
            stage: 'Visual-difference-tests',
            script: [
              PASS
            ]
          },
          {
            stage: 'Regen-goldens',
            script: [
              REGEN_NPM_CMD
            ]
          },
          {
            stage: 'Update-version',
            script: [
              PASS
            ]
          }]
        },
        branches: {
          only: branchName
        }
      },
      branch: branchName,
      message: `[#${issueNum}] Regenerating the Goldens from "${branchName}"`
    }
  })

  try {
    const response = await got.post(
      `${repoPathTravis}/requests`, {
        baseUrl: TRAVIS_API_BASE,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Travis-API-Version': '3',
          Authorization: `token ${process.env.TRAVIS_AUTH}`
        },
        body: data,
        timeout: 5000
      })

    if (response.statusCode === 202) {
      console.log(`${INFO_PREFIX}Requsted a regenration of the Goldens from the "${branchName}" branch.`)

      const data = await JSON.parse(response.body)
      const reqID = data.request.id

      console.log(`${INFO_PREFIX}Waiting for 6 seconds...`)
      await timer(6000).then(_ => makeCommentRegen(context, issueNum, branchName, reqID))
    }
  } catch (error) {
    console.log(`${ERROR_PREFIX}${error}`)
  }
}

async function makeCommentRegen (context, issueNum, branchName, reqID) {
  try {
    const response = await got(
      `${repoPathTravis}/request/${reqID}`, {
        baseUrl: TRAVIS_API_BASE,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Travis-API-Version': '3',
          Authorization: `token ${process.env.TRAVIS_AUTH}`
        },
        timeout: 5000
      })

    if (response.statusCode === 200 || response.statusCode === 201) {
      let buildID = 0

      const data = await JSON.parse(response.body)
      for (const element of data.builds) {
        buildID = element.id
        break
      }
      const buildURL = `${TRAVIS_HOME_BASE}${repoPath.split('/repos/')[1]}${TRAVIS_BUILDS_PATH}${buildID}`

      if (LEAVE_COMMENTS) {
        console.log(`${INFO_PREFIX}Leaving a comment on the PR to notify the dev of the regeneration.`)
      }

      // Let the dev know what is going on.
      const params = context.issue({
        body: `The Goldens will be regenerated off of the "${branchName}" branch shortly. \
                        You can check the status of the build [here](${buildURL}). \
                        Once the build is done, the visual difference tests will be re-run automatically.`,
        number: issueNum
      })

      await reRunBuild(context, issueNum)

      if (LEAVE_COMMENTS) {
        return context.github.issues.createComment(params)
      }
    }
  } catch (error) {
    console.log(`${ERROR_PREFIX}${error}`)
  }
}

async function reRunBuild (context, issueNum) {
  const prParams = context.issue({
    pull_number: issueNum,
    number: issueNum
  })
  const prInfo = await context.github.pullRequests.get(prParams)

  // Get the Travis CI build ID from that SHA commit (the visual difference test we want to re-run)
  const sha = prInfo.data.head.sha
  const crParams = context.issue({
    ref: sha
  })
  const crInfo = await context.github.checks.listForRef(crParams)

  // Get the build IDs
  let buildIDPR = 0
  let buildIDBranch = 0
  for (const element of crInfo.data.check_runs) {
    if (element.name === TRAVIS_PR_BUILD) {
      buildIDPR = element.external_id
    }
    if (element.name === TRAVIS_BR_BUILD) {
      buildIDBranch = element.external_id
    }
  }

  console.log(`Contacting Travis about a build re-run of ${buildIDPR} and ${buildIDBranch}.`)

  await contactTravisReRun(buildIDPR)
  await contactTravisReRun(buildIDBranch)
}

async function contactTravisReRun (buildID) {
  try {
    const response = await got.post(
      `/build/${buildID}/restart`, {
        baseUrl: TRAVIS_API_BASE,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Travis-API-Version': '3',
          Authorization: `token ${process.env.TRAVIS_AUTH}`
        },
        timeout: 5000
      })

    if (response.statusCode === 200 || response.statusCode === 201) {
      console.log(`${INFO_PREFIX}Requsted a re-run of the Travis build.`)
    }
  } catch (error) {
    console.log(`${ERROR_PREFIX}${error}`)
  }
}
