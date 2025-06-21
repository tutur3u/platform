alter table "public"."healthcare_checkup_vital_groups" drop constraint "healthcare_checkup_vital_groups_checkup_id_fkey";

alter table "public"."healthcare_checkup_vital_groups" drop constraint "healthcare_checkup_vital_groups_group_id_fkey";

alter table "public"."healthcare_checkup_vitals" drop constraint "healthcare_checkup_vitals_checkup_id_fkey";

alter table "public"."healthcare_checkups" drop constraint "healthcare_checkups_creator_id_fkey";

alter table "public"."healthcare_checkups" drop constraint "healthcare_checkups_diagnosis_id_fkey";

alter table "public"."healthcare_checkups" drop constraint "healthcare_checkups_patient_id_fkey";

alter table "public"."healthcare_checkups" drop constraint "healthcare_checkups_ws_id_fkey";

alter table "public"."healthcare_diagnoses" drop constraint "healthcare_diagnoses_ws_id_fkey";

alter table "public"."healthcare_vital_groups" drop constraint "healthcare_vital_groups_ws_id_fkey";

alter table "public"."healthcare_vitals" drop constraint "healthcare_vitals_ws_id_fkey";

alter table "public"."vital_group_vitals" drop constraint "vital_group_vitals_group_id_fkey";

alter table "public"."vital_group_vitals" drop constraint "vital_group_vitals_vital_id_fkey";

alter table "public"."schema_migrations" drop constraint "schema_migrations_pkey";

drop index if exists "public"."schema_migrations_pkey";

drop table "public"."schema_migrations";

alter table "public"."healthcare_checkup_vital_groups" add constraint "healthcare_checkup_vital_groups_checkup_id_fkey" FOREIGN KEY (checkup_id) REFERENCES healthcare_checkups(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."healthcare_checkup_vital_groups" validate constraint "healthcare_checkup_vital_groups_checkup_id_fkey";

alter table "public"."healthcare_checkup_vital_groups" add constraint "healthcare_checkup_vital_groups_group_id_fkey" FOREIGN KEY (group_id) REFERENCES healthcare_vital_groups(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."healthcare_checkup_vital_groups" validate constraint "healthcare_checkup_vital_groups_group_id_fkey";

alter table "public"."healthcare_checkup_vitals" add constraint "healthcare_checkup_vitals_checkup_id_fkey" FOREIGN KEY (checkup_id) REFERENCES healthcare_checkups(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."healthcare_checkup_vitals" validate constraint "healthcare_checkup_vitals_checkup_id_fkey";

alter table "public"."healthcare_checkups" add constraint "healthcare_checkups_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."healthcare_checkups" validate constraint "healthcare_checkups_creator_id_fkey";

alter table "public"."healthcare_checkups" add constraint "healthcare_checkups_diagnosis_id_fkey" FOREIGN KEY (diagnosis_id) REFERENCES healthcare_diagnoses(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."healthcare_checkups" validate constraint "healthcare_checkups_diagnosis_id_fkey";

alter table "public"."healthcare_checkups" add constraint "healthcare_checkups_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES workspace_users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."healthcare_checkups" validate constraint "healthcare_checkups_patient_id_fkey";

alter table "public"."healthcare_checkups" add constraint "healthcare_checkups_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."healthcare_checkups" validate constraint "healthcare_checkups_ws_id_fkey";

alter table "public"."healthcare_diagnoses" add constraint "healthcare_diagnoses_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."healthcare_diagnoses" validate constraint "healthcare_diagnoses_ws_id_fkey";

alter table "public"."healthcare_vital_groups" add constraint "healthcare_vital_groups_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."healthcare_vital_groups" validate constraint "healthcare_vital_groups_ws_id_fkey";

alter table "public"."healthcare_vitals" add constraint "healthcare_vitals_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."healthcare_vitals" validate constraint "healthcare_vitals_ws_id_fkey";

alter table "public"."vital_group_vitals" add constraint "vital_group_vitals_group_id_fkey" FOREIGN KEY (group_id) REFERENCES healthcare_vital_groups(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."vital_group_vitals" validate constraint "vital_group_vitals_group_id_fkey";

alter table "public"."vital_group_vitals" add constraint "vital_group_vitals_vital_id_fkey" FOREIGN KEY (vital_id) REFERENCES healthcare_vitals(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."vital_group_vitals" validate constraint "vital_group_vitals_vital_id_fkey";


