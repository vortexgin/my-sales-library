"use client";

import { useState } from "react";
import type { LeadActivity } from "@/app/sales/models/LeadActivityModel";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { LeadActivitySection } from "@/app/sales/components/lead/LeadActivitySection";

const TIMELINE_ENTITIES = ["lead", "lead_metadata", "lead_activity", "lead_metadata_field"].join(",");

export function LeadDetailClient({
  leadUuid,
  initialMetadataUuids,
  initialActivityUuids,
  initialFieldUuids,
  canCreateActivity,
  canUpload,
}: {
  leadUuid: string;
  initialMetadataUuids: string[];
  initialActivityUuids: string[];
  initialFieldUuids: string[];
  canCreateActivity: boolean;
  canUpload: boolean;
}) {
  const [activityUuids, setActivityUuids] = useState<string[]>(initialActivityUuids);

  function handleActivities(rows: LeadActivity[]) {
    setActivityUuids(rows.map((row) => row.uuid));
  }

  const allUuids = [leadUuid, ...initialMetadataUuids, ...activityUuids, ...initialFieldUuids].join(",");

  return (
    <>
      <LeadActivitySection leadUuid={leadUuid} canCreate={canCreateActivity} canUpload={canUpload} onActivities={handleActivities} />
      <ActivityTimeline key={allUuids} entities={TIMELINE_ENTITIES} entityUuids={allUuids} />
    </>
  );
}
