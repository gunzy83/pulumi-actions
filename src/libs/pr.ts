import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';
import dedent from 'dedent';
import invariant from 'ts-invariant';
import { Config } from '../config';
import { extractViewLiveLink, stripAnsiControlCodes } from './utils';

function trimOutputByCharacters(
  message: string,
  maxLength: number,
  alwaysIncludeSummary: boolean,
): [string, boolean] {
  /**
   *  Trim message to maxLength
   *  message: string to trim
   *  maxLength: Maximum number of characters of final message
   *  alwaysIncludeSummary: if true, trim message from front (if trimming is needed), otherwise from end
   *
   *  return message and information if message was trimmed
   */
  let trimmed = false;

  // Check if message exceeds max characters
  if (message.length > maxLength) {
    // Trim input message by number of exceeded characters from front or back as configured
    const dif: number = message.length - maxLength;

    if (alwaysIncludeSummary) {
      message = message.substring(dif, message.length);
    } else {
      message = message.substring(0, message.length - dif);
    }

    trimmed = true;
  }

  return [message, trimmed];
}

export async function handlePullRequestMessage(
  config: Config,
  projectName: string,
  output: string,
  hasChanges: boolean,
  failed = false,
): Promise<void> {
  const {
    githubToken,
    command,
    stackName,
    editCommentOnPr,
    alwaysIncludeSummary,
  } = config;

  // Remove ANSI symbols from output because they are not supported in GitHub PR message
  output = stripAnsiControlCodes(output);

  // GitHub limits PR comment characters to 65_535, use lower max to keep buffer for variable values
  const MAX_CHARACTER_COMMENT = 64_000;

  const successHeading = `#### :tropical_drink: \`${command}\` on ${projectName}/${stackName} has changes.`;
  const failedHeading = `#### :x: \`${command}\` on ${projectName}/${stackName} failed!`;
  const heading = failed ? failedHeading : successHeading;

  const summary = '<summary>Pulumi report</summary>';

  const [message, trimmed]: [string, boolean] = trimOutputByCharacters(
    output,
    MAX_CHARACTER_COMMENT,
    alwaysIncludeSummary,
  );

  const viewLiveLink = extractViewLiveLink(output);

  const body = dedent`
    ${heading}

    ${viewLiveLink ? `\n[View in Pulumi Cloud](${viewLiveLink})\n` : ''}

    <details>
    ${summary}
    ${
      trimmed && alwaysIncludeSummary
        ? ':warning: **Warn**: The output was too long and trimmed from the front.'
        : ''
    }
    <pre>
    ${message}
    </pre>
    ${
      trimmed && !alwaysIncludeSummary
        ? ':warning: **Warn**: The output was too long and trimmed.'
        : ''
    }
    </details>
  `;

  const payload = context.payload;
  const repo = config.commentOnPrRepo
    ? {
        owner: config.commentOnPrRepo.split('/')[0],
        repo: config.commentOnPrRepo.split('/')[1],
      }
    : context.repo;

  // Assumes PR numbers are always positive.
  const nr = config.commentOnPrNumber || payload.pull_request?.number;
  invariant(nr, 'Missing pull request event data.');

  const octokit = getOctokit(githubToken);

  if (!hasChanges && !failed) {
    try {
      if (editCommentOnPr) {
        const { data: comments } = await octokit.rest.issues.listComments({
          ...repo,
          issue_number: nr,
        });
        const comment = comments.find(
          (comment) =>
            (comment.body.startsWith(successHeading) ||
              comment.body.startsWith(failedHeading)) &&
            comment.body.includes(summary),
        );

        // If comment exists, delete it.
        if (comment) {
          await octokit.rest.issues.deleteComment({
            ...repo,
            comment_id: comment.id,
          });
          return;
        }
      }
    } catch {
      core.warning(
        'Not able to list comments in order to delete comments, skipping.',
      );
    }
    return;
  }

  try {
    if (editCommentOnPr) {
      const { data: comments } = await octokit.rest.issues.listComments({
        ...repo,
        issue_number: nr,
      });
      const comment = comments.find(
        (comment) =>
          (comment.body.startsWith(successHeading) ||
            comment.body.startsWith(failedHeading)) &&
          comment.body.includes(summary),
      );

      // If comment exists, update it.
      if (comment) {
        await octokit.rest.issues.updateComment({
          ...repo,
          comment_id: comment.id,
          body,
        });
        return;
      }
    }
  } catch {
    core.warning(
      'Not able to edit comment, defaulting to creating a new comment.',
    );
  }

  await octokit.rest.issues.createComment({
    ...repo,
    issue_number: nr,
    body,
  });
}
