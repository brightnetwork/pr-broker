import * as _ from "lodash/fp";

import {Await, PRContext} from "./types";
import {updatePr} from "./github";
import type {getOctokit} from "@actions/github";

const MAIN_BRANCH = "main";

const {log} = console;

// ==================================
type Octokit = ReturnType<typeof getOctokit>;

interface PRData {
  pull: Await<ReturnType<Octokit["pulls"]["get"]>>["data"];
  reviews: Await<ReturnType<Octokit["pulls"]["listReviews"]>>["data"];
  checks: Await<ReturnType<Octokit["checks"]["listForRef"]>>["data"];
  status: Await<
    ReturnType<Octokit["repos"]["getCombinedStatusForRef"]>
  >["data"];
}

interface Action extends PRData {
  action: "merge" | "update" | "inprogress" | "updateYellow" | "label";
  labels?: string;
}

// ====================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const setFP = (key: string, fn: Function) => (obj: any) =>
  _.set(key, fn(obj))(obj);

/**
 * Convert an object { [key: string]: promise }
 * in a promise that resolve in { [key: string]: promise result }
 *
 * All the Promise are simultaneous (Promise.all)
 * One reject reject all.
 */
const Object2Promise = _.pipe(
  _.toPairs,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _.map(([key, value]) => value.then((res: any) => _.set(key, res.data))),
  async promises =>
    Promise.all(promises).then(res => res.reduce((acc, cur) => cur(acc), {}))
);

// ==================================

const doesPRPassesTests = _.allPass([
  _.anyPass([
    _.pipe(_.prop("status.state"), _.isEqual("success")),
    _.pipe(_.prop("status.total_count"), _.isEqual(0)),
  ]),
  _.pipe(
    _.prop("checks.check_runs"),
    _.map("conclusion"),
    _.all(_.isEqual("success"))
  ),
]);

const doesPRhaveYellowTests = _.anyPass([
  _.pipe(_.prop("status.state"), _.isEqual("in_progress")),
  _.pipe(
    _.prop("checks.check_runs"),
    _.map("status"),
    _.includes("in_progress")
  ),
]);

const isPrApproved = _.pipe(
  _.prop("reviews"),
  _.reject({state: "COMMENTED"}),
  _.sortBy("submitted_at"),
  array => array.slice().reverse(),
  _.uniqBy(_.prop("user.login")),
  _.uniqBy(_.prop("state")),
  _.map("state"),
  _.allPass([_.includes("APPROVED"), _.negate(_.includes("CHANGES_REQUESTED"))])
);

const isPrBehind = _.pipe(
  _.prop("pull"),
  _.allPass([
    _.prop("mergeable"),
    _.pipe(_.prop("mergeable_state"), _.isEqual("behind")),
  ])
);

const isPrMergeable = _.prop("pull.mergeable");
const isPrNotDraft = _.negate(_.prop("pull.draft"));
const isPRBlockedByLabels = _.pipe(
  _.prop("pull.labels"),
  _.map("name"),
  _.map(_.lowerCase),
  _.any(_.includes("blocked"))
);

const isPrOnMainBranch = _.pipe(
  _.prop("pull.base.ref"),
  _.isEqual(MAIN_BRANCH)
);

const isAutoMergeEnabled = _.pipe(_.prop("pull.auto_merge"), _.isNull, x => !x);

const shouldConsiderPR = _.allPass([
  isPrOnMainBranch,
  isPrNotDraft,
  isPrMergeable,
  isPrApproved,
  isAutoMergeEnabled,
  _.negate(isPRBlockedByLabels),
]);

const getComputedData = _.pipe(
  setFP("data.notDraft", isPrNotDraft),
  setFP("data.behind", isPrBehind),
  setFP("data.mergeable", isPrMergeable),
  setFP("data.approved", isPrApproved),
  setFP("data.green", doesPRPassesTests),
  setFP("data.yellow", doesPRhaveYellowTests),
  setFP("data.onMainBranch", isPrOnMainBranch),
  setFP("data.blockedByLabels", isPRBlockedByLabels),
  setFP("data.isAutoMergeEnabled", isAutoMergeEnabled),
  setFP("data.shouldConsiderPR", shouldConsiderPR)
);

const actions = {
  merge: _.allPass([doesPRPassesTests, _.negate(isPrBehind)]),
  inprogress: _.allPass([doesPRhaveYellowTests, _.negate(isPrBehind)]),
  update: _.allPass([doesPRPassesTests, isPrBehind]),
  updateYellow: _.allPass([doesPRhaveYellowTests, isPrBehind]),
};

const extractActions = _.pipe(
  ..._.toPairs(actions).map(([key, value]) =>
    setFP(
      `actions.${key}`,
      _.pipe(
        _.prop("pulls"),
        _.sortBy(["pull.number"]),
        _.filter(shouldConsiderPR),
        _.filter(value),
        _.map(_.set("action", key))
      )
    )
  ),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (data: any) =>
    _.flatten(_.keys(actions).map(key => _.get(`actions.${key}`)(data)))
);

const getParams = (
  payload: PRContext["payload"]
): {
  repo: string;
  owner: string;
} => ({
  repo: payload.repository.name,
  owner: payload.repository.owner.login,
});

const planify: (_pulls: PRData[]) => Action = _.pipe(
  pulls => ({pulls}),
  extractActions,
  _.first
);

// =================================================================
const getPulls = async ({payload, octokit}: PRContext): Promise<PRData[]> =>
  octokit.pulls.list(getParams(payload)).then(async pulls =>
    Promise.all(
      pulls.data.map(async pull =>
        Object2Promise({
          reviews: octokit.pulls.listReviews({
            ...getParams(payload),
            pull_number: pull.number,
          }),
          checks: octokit.checks.listForRef({
            ref: pull.head.sha,
            ...getParams(payload),
          }),
          pull: octokit.pulls.get({
            ...getParams(payload),
            pull_number: pull.number,
          }),
          status: octokit.repos.getCombinedStatusForRef({
            ...getParams(payload),
            ref: pull.head.sha,
          }),
        })
      )
    )
  );

const act = (context: PRContext) => async (
  action: Action
): Promise<string | undefined> => {
  switch (action?.action) {
    case null:
    case undefined:
      log(`action: nothing to do`);
      return undefined;
    case "inprogress":
      log(
        `action: nothing because PR is already in progress ${action.pull.number}`
      );
      return undefined;
    case "merge":
      log(`action: should merge ${action.pull.title} ${action.pull.number}`);
      return undefined; //`merge ${action.pull.number}: ${action.pull.title}`;
    case "update":
    case "updateYellow":
      log(
        `action: should ${action.action} ${action.pull.title} ${action.pull.number}`
      );
      await updatePr(context)(action.pull.number);
      return `${action.action} ${action.pull.number}: ${action.pull.title}`;
    default:
      log("invalid action");
      throw new Error("invalid action");
  }
};

const apply = (context: PRContext) => async (action: Action) => {
  const msg = await act(context)(action);
  if (msg) log(msg);
};

// =================================================================

export const updateOutToDatePR = async (context: PRContext): Promise<void> => {
  log("fetching data...");
  const pulls = await getPulls(context);

  log("CD");
  pulls.forEach(
    _.pipe(getComputedData, _.pick(["pull.number", "pull.title", "data"]), log)
  );

  log("plan...");
  const plan = planify(pulls);
  log({
    plan: _.pick(["action", "pull.title", "pull.number"])(plan),
  });
  log("apply...");
  await apply(context)(plan);
  log("applied");
  log("");
};
