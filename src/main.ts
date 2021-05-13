import * as core from "@actions/core";
import * as github from "@actions/github";

import {updateOutToDatePR} from "./cd";
import {PRPayload} from "./types";

async function run(): Promise<void> {
  try {
    const context = github.context;
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          payload: context.payload,
          repo: context.repo,
          issue: context.issue,
          eventName: context.eventName,
          sha: context.sha,
          ref: context.ref,
          workflow: context.workflow,
          action: context.action,
          actor: context.actor,
          job: context.job,
          runNumber: context.runNumber,
          runId: context.runId,
        },
        null,
        2,
      ),
    );
    const payload = {...context.payload};
    if (context.eventName === "push") {
      // wait to let time to github to compute the merge status of the PR
      await new Promise(res => setTimeout(res, 25000));
    }
    payload.repository = {
      name: github.context.repo.repo,
      owner: {
        login: github.context.repo.owner,
      },
    };
    await updateOutToDatePR({
      payload: payload as PRPayload,
      octokit: github.getOctokit(process.env.GITHUB_TOKEN as string),
    });
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
