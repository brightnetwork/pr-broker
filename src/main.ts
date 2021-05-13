import * as core from "@actions/core";
import * as github from "@actions/github";

import {updateOutToDatePR} from "./cd";
import {PRPayload} from "./types";

async function run(): Promise<void> {
  try {
    const payload = github.context.payload;

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(payload, null, 2));

    if (!payload.repository) throw new Error("invalid payload");
    await updateOutToDatePR({
      payload: payload as PRPayload,
      octokit: github.getOctokit(process.env.GITHUB_TOKEN as string),
    });
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
