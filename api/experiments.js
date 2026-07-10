// GET /api/experiments?domain=example.com
// POST /api/experiments actions: plan, start, complete.
// Admin-only via middleware.

import { randomUUID } from "node:crypto";
import { clean, readBody, sbInsert, sbSelect, sbUpdate } from "./_lib.js";
import { normDomain } from "./_audit.js";
import {
  experimentEventRow,
  foldExperiments,
  normalizeExperimentPlan,
  recommendationOutcomeFromCompletion,
} from "./_experiment_planner.js";

const DOMAIN_RE = /^([a-z0-9-]+\.)+[a-z]{2,}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function experimentEvents(domain, experimentId = null) {
  let query = `select=id,event_type,occurred_at,channel,campaign_id,value_numeric,metadata&entity_key=eq.${encodeURIComponent(domain)}`;
  if (experimentId) query += `&campaign_id=eq.${encodeURIComponent(experimentId)}`;
  query += "&order=occurred_at.asc&limit=1000";
  return sbSelect("bi_events", query);
}

async function closeLinkedRecommendation(experiment, completion, occurredAt) {
  const insightId = experiment.insight_id;
  if (!insightId || !UUID_RE.test(insightId)) return false;

  const outcome = recommendationOutcomeFromCompletion(
    { insight_id: insightId },
    completion,
    occurredAt,
  );
  const existing = await sbSelect(
    "bi_recommendation_outcomes",
    `select=id,accepted_at,implemented_at,measurement_start&insight_id=eq.${encodeURIComponent(insightId)}&limit=1`,
  );

  if (existing?.[0]?.id) {
    await sbUpdate(
      "bi_recommendation_outcomes",
      `id=eq.${encodeURIComponent(existing[0].id)}`,
      {
        implemented_at: existing[0].implemented_at || experiment.started_at || occurredAt,
        measurement_start: existing[0].measurement_start || experiment.started_at || occurredAt,
        measurement_end: outcome.measurement_end,
        result: outcome.result,
        measured_lift: outcome.measured_lift,
        notes: outcome.notes,
        updated_at: occurredAt,
      },
    );
  } else {
    await sbInsert("bi_recommendation_outcomes", {
      insight_id: insightId,
      implemented_at: experiment.started_at || occurredAt,
      measurement_start: experiment.started_at || occurredAt,
      measurement_end: outcome.measurement_end,
      result: outcome.result,
      measured_lift: outcome.measured_lift,
      notes: outcome.notes,
      updated_at: occurredAt,
    });
  }

  await sbUpdate("bi_insights", `id=eq.${encodeURIComponent(insightId)}`, { status: "measured" });
  return true;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const domain = normDomain(req.query?.domain || "");
    if (!domain || !DOMAIN_RE.test(domain)) return res.status(400).json({ ok: false, error: "Enter a valid domain." });
    try {
      const events = await experimentEvents(domain);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json({ ok: true, entity_key: domain, experiments: foldExperiments(events) });
    } catch (e) {
      console.error("experiment read failed:", e?.message || e);
      return res.status(500).json({ ok: false, error: "Could not load experiments." });
    }
  }

  if (req.method === "POST") {
    try {
      const body = readBody(req);
      const action = clean(body.action, 30);
      const domain = normDomain(body.entity_key || body.domain || "");
      if (!domain || !DOMAIN_RE.test(domain)) return res.status(400).json({ ok: false, error: "Enter a valid domain." });
      const occurredAt = new Date().toISOString();

      if (action === "plan") {
        const plan = normalizeExperimentPlan(body.plan || body);
        const experimentId = `exp-${randomUUID()}`;
        const row = experimentEventRow({ entityKey: domain, experimentId, action: "plan", plan, occurredAt });
        await sbInsert("bi_events", row);
        return res.status(201).json({ ok: true, experiment_id: experimentId, status: "planned", experiment: foldExperiments([row])[0] });
      }

      const experimentId = clean(body.experiment_id, 160);
      if (!experimentId) return res.status(400).json({ ok: false, error: "experiment_id is required." });
      const rows = await experimentEvents(domain, experimentId);
      const experiment = foldExperiments(rows)[0];
      if (!experiment) return res.status(404).json({ ok: false, error: "Experiment not found." });

      const plan = {
        hypothesis: experiment.hypothesis,
        primary_metric: experiment.primary_metric,
        baseline: experiment.baseline,
        variant: experiment.variant,
        constants: experiment.constants,
        min_observations: experiment.min_observations,
        measurement_days: experiment.measurement_days,
        recommendation_headline: experiment.recommendation_headline,
        insight_id: experiment.insight_id,
      };

      if (action === "start") {
        if (experiment.status !== "planned") return res.status(409).json({ ok: false, error: "Only planned experiments can be started." });
        const row = experimentEventRow({ entityKey: domain, experimentId, action: "start", plan, occurredAt });
        await sbInsert("bi_events", row);
        return res.status(200).json({ ok: true, experiment_id: experimentId, status: "running" });
      }

      if (action === "complete") {
        if (experiment.status !== "running") return res.status(409).json({ ok: false, error: "Start the experiment before completing it." });
        const completion = body.completion || body;
        const row = experimentEventRow({ entityKey: domain, experimentId, action: "complete", plan, occurredAt, completion });
        await sbInsert("bi_events", row);
        const recommendationMeasured = await closeLinkedRecommendation(experiment, completion, occurredAt);
        return res.status(200).json({
          ok: true,
          experiment_id: experimentId,
          status: "completed",
          result: row.metadata.result,
          recommendation_measured: recommendationMeasured,
        });
      }

      return res.status(400).json({ ok: false, error: "Action must be plan, start, or complete." });
    } catch (e) {
      return res.status(400).json({ ok: false, error: String(e?.message || e) });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
