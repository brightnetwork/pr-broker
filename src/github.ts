import {Comment, PRContext} from "./types";

const UNIQUE_ID = "7cb6cdf1-b349-4121-a6ec-44e96a054943";

const getSignature = (type: string): string => `<!-- ${UNIQUE_ID}:${type} -->`;

export const signComment = (type: string, body: string): string =>
  body.concat("\n").concat(getSignature(type));

export const isCommentSigned = (type: string) => (comment: Comment): boolean =>
  comment.body?.includes(getSignature(type)) || false;

export const addLabels = (labels: string[], issue_number: number) => async ({
  payload,
  octokit,
}: PRContext) =>
  octokit.issues.addLabels({
    issue_number,
    repo: payload.repository.name,
    owner: payload.repository.owner.login,
    labels,
  });

// export const removeComments = (type: string) => async ({
//   payload,
//   octokit,
// }: PRContext) => {
//   const comments = await octokit.issues.listComments({
//     issue_number: payload.pull_request.number,
//     repo: payload.repository.name,
//     owner: payload.repository.owner.login,
//   });
//   const migrationsComments = comments.data.filter(isCommentSigned(type));
//   return Promise.all(
//     migrationsComments.map(async comment =>
//       octokit.issues.deleteComment({
//         repo: payload.repository.name,
//         comment_id: comment.id,
//         owner: payload.repository.owner.login,
//       })
//     )
//   );
// };

// export const addComment = (type: string, body: string) => async ({
//   payload,
//   octokit,
// }: PRContext) =>
//   octokit.issues.createComment({
//     body: signComment(type, body),
//     issue_number: payload.pull_request.number,
//     repo: payload.repository.name,
//     owner: payload.repository.owner.login,
//   });

export const updatePr = ({payload, octokit}: PRContext) => async (
  number: number
) =>
  octokit.pulls.updateBranch({
    repo: payload.repository.name,
    owner: payload.repository.owner.login,
    pull_number: number,
  });
