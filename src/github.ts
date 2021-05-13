import {Comment, PRContext} from "./types";

const UNIQUE_ID = "7cb6cdf1-b349-4121-a6ec-44e96a054943";

const getSignature = (type: string): string => `<!-- ${UNIQUE_ID}:${type} -->`;

export const signComment = (type: string, body: string): string =>
  body.concat("\n").concat(getSignature(type));

export const isCommentSigned =
  (type: string) =>
  (comment: Comment): boolean =>
    comment.body?.includes(getSignature(type)) || false;

export const addLabels =
  (labels: string[], issue_number: number) =>
  async ({payload, octokit}: PRContext) =>
    octokit.rest.issues.addLabels({
      issue_number,
      repo: payload.repository.name,
      owner: payload.repository.owner.login,
      labels,
    });

export const removeLabel =
  (label: string, issue_number: number) =>
  async ({payload, octokit}: PRContext) =>
    octokit.rest.issues.removeLabel({
      issue_number,
      repo: payload.repository.name,
      owner: payload.repository.owner.login,
      name: label,
    });

export const getIssuesByLabel =
  (labels: string[]) =>
  async ({payload, octokit}: PRContext) =>
    (
      await octokit.rest.issues.list({
        repo: payload.repository.name,
        owner: payload.repository.owner.login,
        filter: "all",
        labels: labels.join(","),
        state: "all",
      })
    ).data;

export const updatePr =
  ({payload, octokit}: PRContext) =>
  async (number: number) =>
    octokit.rest.pulls.updateBranch({
      repo: payload.repository.name,
      owner: payload.repository.owner.login,
      pull_number: number,
    });
