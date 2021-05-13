import * as github from "@actions/github";
import {WebhookPayload} from "@actions/github/lib/interfaces";

export type PRPayload = WebhookPayload & {
  // pull_request: Required<WebhookPayload>["pull_request"];
} & {
  repository: Required<WebhookPayload>["repository"];
};

export type PRContext = {
  payload: PRPayload;
  octokit: ReturnType<typeof github.getOctokit>;
};

export type Await<T> = T extends {
  then(_onfulfilled?: (_value: infer U) => unknown): unknown;
}
  ? U
  : T;

export type Comment = Await<
  ReturnType<PRContext["octokit"]["issues"]["createComment"]>
>["data"];
