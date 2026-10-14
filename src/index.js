import * as core from '@actions/core';
import * as github from '@actions/github';
import {requestCompletion, resolveProviderConfig} from './providers.js';
import {buildSupervisorMessages, wrapComment} from './prompt.js';

const MARKER = '<!-- yang-supervisor -->';
const AI_REVIEW_LABEL = 'ai-review';
const AI_REVIEW_LABEL_COLOR = '5319E7';
const AI_REVIEW_LABEL_DESCRIPTION = 'Responded by Yang Supervisor Agent (YSA)';

function parseTemperature(raw) {
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0 || value > 1) {
    throw new Error('MODEL_TEMPERATURE must be a number between 0 and 1');
  }
  return value;
}

function resolveMode(modeInput, eventName, payload) {
  const mode = (modeInput || 'auto').toLowerCase();
  if (mode === 'issue' || mode === 'pull_request') {
    return mode;
  }
  if (payload.pull_request || eventName === 'pull_request') {
    return 'pull_request';
  }
  if (payload.issue || eventName === 'issues') {
    return 'issue';
  }
  throw new Error(
    `Unsupported event "${eventName}". Trigger on issues or pull_request.`
  );
}

async function alreadyReplied(octokit, {owner, repo, issueNumber}) {
  const {data: comments} = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100
  });
  return comments.some((comment) => (comment.body || '').includes(MARKER));
}

async function ensureAiReviewLabel(octokit, {owner, repo}) {
  try {
    await octokit.rest.issues.getLabel({
      owner,
      repo,
      name: AI_REVIEW_LABEL
    });
  } catch (error) {
    if (error.status !== 404) {
      throw error;
    }
    await octokit.rest.issues.createLabel({
      owner,
      repo,
      name: AI_REVIEW_LABEL,
      color: AI_REVIEW_LABEL_COLOR,
      description: AI_REVIEW_LABEL_DESCRIPTION
    });
  }
}

async function addAiReviewLabel(octokit, {owner, repo, issueNumber}) {
  await ensureAiReviewLabel(octokit, {owner, repo});
  await octokit.rest.issues.addLabels({
    owner,
    repo,
    issue_number: issueNumber,
    labels: [AI_REVIEW_LABEL]
  });
}

async function run() {
  try {
    const provider = core.getInput('PROVIDER', {required: true});
    const apiKey = core.getInput('API_KEY', {required: true});
    const modelName = core.getInput('MODEL_NAME', {required: true});
    const modelTemperature = parseTemperature(core.getInput('MODEL_TEMPERATURE'));
    const maxTokens = Number(core.getInput('MAX_TOKENS') || '2048');
    const githubToken = core.getInput('GITHUB_TOKEN', {required: true});
    const modeInput = core.getInput('MODE') || 'auto';

    core.setSecret(apiKey);
    core.setSecret(githubToken);

    const providerConfig = resolveProviderConfig({provider, apiKey});
    const context = github.context;
    const owner = context.repo.owner;
    const repo = context.repo.repo;
    const octokit = github.getOctokit(githubToken);
    const mode = resolveMode(modeInput, context.eventName, context.payload);

    let issueNumber;
    let title;
    let body;
    let author;
    let labels = [];
    let extra = '';

    if (mode === 'pull_request') {
      const pr = context.payload.pull_request;
      if (!pr) {
        throw new Error('pull_request payload missing');
      }
      issueNumber = pr.number;
      title = pr.title;
      body = pr.body || '';
      author = pr.user?.login;
      labels = (pr.labels || []).map((label) => label.name);
      extra = [
        `PR URL: ${pr.html_url}`,
        `Base: ${pr.base?.ref}`,
        `Head: ${pr.head?.ref}`,
        `Changed files: ${pr.changed_files ?? 'unknown'}`,
        `Additions: ${pr.additions ?? 'unknown'}`,
        `Deletions: ${pr.deletions ?? 'unknown'}`
      ].join('\n');
    } else {
      const issue = context.payload.issue;
      if (!issue) {
        throw new Error('issue payload missing');
      }
      if (issue.pull_request) {
        core.info('Issue is a pull request shadow issue; skipping.');
        return;
      }
      issueNumber = issue.number;
      title = issue.title;
      body = issue.body || '';
      author = issue.user?.login;
      labels = (issue.labels || []).map((label) =>
        typeof label === 'string' ? label : label.name
      );
    }

    if (author?.endsWith('[bot]') || author === 'dependabot[bot]') {
      core.info(`Skipping bot author: ${author}`);
      return;
    }

    if (await alreadyReplied(octokit, {owner, repo, issueNumber})) {
      core.info(`Yang Supervisor already commented on #${issueNumber}; skip.`);
      return;
    }

    const messages = buildSupervisorMessages({
      eventType: mode,
      title,
      body,
      author,
      labels,
      extra
    });

    const reply = await requestCompletion({
      config: providerConfig,
      model: modelName,
      temperature: modelTemperature,
      maxTokens,
      messages,
      agent: 'yang-supervisor',
      onRetry: (attempt, maxAttempts, error) => {
        core.warning(
          `Retry ${attempt}/${maxAttempts} after: ${error.message || error}`
        );
      }
    });

    if (!reply) {
      throw new Error('Model returned an empty reply');
    }

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: wrapComment(reply)
    });

    core.info(`Posted Yang Supervisor response on #${issueNumber}`);

    try {
      await addAiReviewLabel(octokit, {owner, repo, issueNumber});
      core.info(`Added label "${AI_REVIEW_LABEL}" on #${issueNumber}`);
    } catch (labelError) {
      core.warning(
        `Failed to add "${AI_REVIEW_LABEL}" label: ${labelError.message}`
      );
    }
  } catch (error) {
    core.setFailed(error.message || String(error));
  }
}

run();
