drop policy "Admin manages backfill" on "public"."gads_backfill_queue";

drop policy "Agency admin updates own agency" on "public"."agencies";

drop policy "Super admin manages agencies" on "public"."agencies";

drop policy "Users read own agency" on "public"."agencies";

drop policy "Agency admin manages credentials" on "public"."agency_platform_credentials";

drop policy "Super admin reads all credentials" on "public"."agency_platform_credentials";

drop policy "Agency admin manages tabs" on "public"."agency_report_tabs";

drop policy "Agency members read tabs" on "public"."agency_report_tabs";

drop policy "Agency admin manages accounts" on "public"."client_platform_accounts";

drop policy "Agency members read accounts" on "public"."client_platform_accounts";

drop policy "secure_read" on "public"."gads_adgroup_daily";

drop policy "secure_read" on "public"."gads_adgroup_status";

drop policy "secure_read" on "public"."gads_campaign_daily";

drop policy "secure_read" on "public"."gads_campaign_status";

drop policy "secure_read" on "public"."gads_conversion_actions";

drop policy "secure_read" on "public"."gads_conversion_daily";

drop policy "secure_read" on "public"."gads_customers";

drop policy "secure_read" on "public"."gads_geo_location_daily";

drop policy "secure_read" on "public"."gads_keyword_daily";

drop policy "secure_read" on "public"."gads_keyword_status";

drop policy "secure_read" on "public"."gads_search_term_daily";

drop policy "Super admin manages permissions" on "public"."permissions";

drop policy "Super admin manages role_permissions" on "public"."role_permissions";

drop policy "Super admin manages roles" on "public"."roles";

drop policy "Agency members read sync log" on "public"."sync_log";

drop policy "Users can insert sync_log for their agency" on "public"."sync_log";

drop policy "Users can read sync_log for their agency" on "public"."sync_log";

drop policy "Admin manages user_clients" on "public"."user_clients";

drop policy "Admin manages profiles" on "public"."user_profiles";

drop policy "Agency admin reads agency profiles" on "public"."user_profiles";

drop policy "Super admin reads all profiles" on "public"."user_profiles";

revoke delete on table "public"."gads_backfill_queue" from "anon";

revoke insert on table "public"."gads_backfill_queue" from "anon";

revoke references on table "public"."gads_backfill_queue" from "anon";

revoke select on table "public"."gads_backfill_queue" from "anon";

revoke trigger on table "public"."gads_backfill_queue" from "anon";

revoke truncate on table "public"."gads_backfill_queue" from "anon";

revoke update on table "public"."gads_backfill_queue" from "anon";

revoke delete on table "public"."gads_backfill_queue" from "authenticated";

revoke insert on table "public"."gads_backfill_queue" from "authenticated";

revoke references on table "public"."gads_backfill_queue" from "authenticated";

revoke select on table "public"."gads_backfill_queue" from "authenticated";

revoke trigger on table "public"."gads_backfill_queue" from "authenticated";

revoke truncate on table "public"."gads_backfill_queue" from "authenticated";

revoke update on table "public"."gads_backfill_queue" from "authenticated";

revoke delete on table "public"."gads_backfill_queue" from "service_role";

revoke insert on table "public"."gads_backfill_queue" from "service_role";

revoke references on table "public"."gads_backfill_queue" from "service_role";

revoke select on table "public"."gads_backfill_queue" from "service_role";

revoke trigger on table "public"."gads_backfill_queue" from "service_role";

revoke truncate on table "public"."gads_backfill_queue" from "service_role";

revoke update on table "public"."gads_backfill_queue" from "service_role";

alter table "public"."gads_backfill_queue" drop constraint "gads_backfill_queue_customer_id_fill_date_func_key";

alter table "public"."agency_platform_credentials" drop constraint "agency_platform_credentials_agency_id_fkey";

alter table "public"."agency_platform_credentials" drop constraint "agency_platform_credentials_connected_by_fkey";

alter table "public"."agency_report_tabs" drop constraint "agency_report_tabs_agency_id_fkey";

alter table "public"."client_platform_accounts" drop constraint "client_platform_accounts_agency_id_fkey";

alter table "public"."client_platform_accounts" drop constraint "client_platform_accounts_credential_id_fkey";

alter table "public"."role_permissions" drop constraint "role_permissions_permission_id_fkey";

alter table "public"."role_permissions" drop constraint "role_permissions_role_id_fkey";

alter table "public"."sync_log" drop constraint "sync_log_agency_id_fkey";

alter table "public"."user_clients" drop constraint "user_clients_client_id_fkey";

alter table "public"."user_clients" drop constraint "user_clients_user_id_fkey";

alter table "public"."user_profiles" drop constraint "user_profiles_agency_id_fkey";

alter table "public"."user_profiles" drop constraint "user_profiles_role_id_fkey";

drop function if exists "public"."gads_backfill_next"();

drop function if exists "public"."trigger_daily_gads_sync"();

alter table "public"."gads_backfill_queue" drop constraint "gads_backfill_queue_pkey";

drop index if exists "public"."gads_backfill_queue_customer_id_fill_date_func_key";

drop index if exists "public"."gads_backfill_queue_pkey";

drop table "public"."gads_backfill_queue";

alter table "public"."agency_platform_credentials" add constraint "agency_platform_credentials_agency_id_fkey" FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE not valid;

alter table "public"."agency_platform_credentials" validate constraint "agency_platform_credentials_agency_id_fkey";

alter table "public"."agency_platform_credentials" add constraint "agency_platform_credentials_connected_by_fkey" FOREIGN KEY (connected_by) REFERENCES public.user_profiles(id) not valid;

alter table "public"."agency_platform_credentials" validate constraint "agency_platform_credentials_connected_by_fkey";

alter table "public"."agency_report_tabs" add constraint "agency_report_tabs_agency_id_fkey" FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE not valid;

alter table "public"."agency_report_tabs" validate constraint "agency_report_tabs_agency_id_fkey";

alter table "public"."client_platform_accounts" add constraint "client_platform_accounts_agency_id_fkey" FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE not valid;

alter table "public"."client_platform_accounts" validate constraint "client_platform_accounts_agency_id_fkey";

alter table "public"."client_platform_accounts" add constraint "client_platform_accounts_credential_id_fkey" FOREIGN KEY (credential_id) REFERENCES public.agency_platform_credentials(id) not valid;

alter table "public"."client_platform_accounts" validate constraint "client_platform_accounts_credential_id_fkey";

alter table "public"."role_permissions" add constraint "role_permissions_permission_id_fkey" FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE not valid;

alter table "public"."role_permissions" validate constraint "role_permissions_permission_id_fkey";

alter table "public"."role_permissions" add constraint "role_permissions_role_id_fkey" FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE not valid;

alter table "public"."role_permissions" validate constraint "role_permissions_role_id_fkey";

alter table "public"."sync_log" add constraint "sync_log_agency_id_fkey" FOREIGN KEY (agency_id) REFERENCES public.agencies(id) not valid;

alter table "public"."sync_log" validate constraint "sync_log_agency_id_fkey";

alter table "public"."user_clients" add constraint "user_clients_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.client_platform_accounts(id) ON DELETE CASCADE not valid;

alter table "public"."user_clients" validate constraint "user_clients_client_id_fkey";

alter table "public"."user_clients" add constraint "user_clients_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE not valid;

alter table "public"."user_clients" validate constraint "user_clients_user_id_fkey";

alter table "public"."user_profiles" add constraint "user_profiles_agency_id_fkey" FOREIGN KEY (agency_id) REFERENCES public.agencies(id) not valid;

alter table "public"."user_profiles" validate constraint "user_profiles_agency_id_fkey";

alter table "public"."user_profiles" add constraint "user_profiles_role_id_fkey" FOREIGN KEY (role_id) REFERENCES public.roles(id) not valid;

alter table "public"."user_profiles" validate constraint "user_profiles_role_id_fkey";


  create policy "Agency admin updates own agency"
  on "public"."agencies"
  as permissive
  for update
  to authenticated
using (public.is_agency_admin(id));



  create policy "Super admin manages agencies"
  on "public"."agencies"
  as permissive
  for all
  to authenticated
using (public.is_super_admin());



  create policy "Users read own agency"
  on "public"."agencies"
  as permissive
  for select
  to authenticated
using (((id IN ( SELECT user_profiles.agency_id
   FROM public.user_profiles
  WHERE (user_profiles.id = auth.uid()))) OR public.is_super_admin()));



  create policy "Agency admin manages credentials"
  on "public"."agency_platform_credentials"
  as permissive
  for all
  to authenticated
using (public.is_agency_admin(agency_id));



  create policy "Super admin reads all credentials"
  on "public"."agency_platform_credentials"
  as permissive
  for select
  to authenticated
using (public.is_super_admin());



  create policy "Agency admin manages tabs"
  on "public"."agency_report_tabs"
  as permissive
  for all
  to authenticated
using (public.is_agency_admin(agency_id));



  create policy "Agency members read tabs"
  on "public"."agency_report_tabs"
  as permissive
  for select
  to authenticated
using (((agency_id IN ( SELECT user_profiles.agency_id
   FROM public.user_profiles
  WHERE (user_profiles.id = auth.uid()))) OR public.is_super_admin()));



  create policy "Agency admin manages accounts"
  on "public"."client_platform_accounts"
  as permissive
  for all
  to authenticated
using (public.is_agency_admin(agency_id));



  create policy "Agency members read accounts"
  on "public"."client_platform_accounts"
  as permissive
  for select
  to authenticated
using (((agency_id IN ( SELECT user_profiles.agency_id
   FROM public.user_profiles
  WHERE (user_profiles.id = auth.uid()))) OR public.is_super_admin()));



  create policy "secure_read"
  on "public"."gads_adgroup_daily"
  as permissive
  for select
  to authenticated
using (public.can_access_customer(customer_id));



  create policy "secure_read"
  on "public"."gads_adgroup_status"
  as permissive
  for select
  to authenticated
using (public.can_access_customer(customer_id));



  create policy "secure_read"
  on "public"."gads_campaign_daily"
  as permissive
  for select
  to authenticated
using (public.can_access_customer(customer_id));



  create policy "secure_read"
  on "public"."gads_campaign_status"
  as permissive
  for select
  to authenticated
using (public.can_access_customer(customer_id));



  create policy "secure_read"
  on "public"."gads_conversion_actions"
  as permissive
  for select
  to authenticated
using (public.can_access_customer(customer_id));



  create policy "secure_read"
  on "public"."gads_conversion_daily"
  as permissive
  for select
  to authenticated
using (public.can_access_customer(customer_id));



  create policy "secure_read"
  on "public"."gads_customers"
  as permissive
  for select
  to authenticated
using (public.can_access_customer(customer_id));



  create policy "secure_read"
  on "public"."gads_geo_location_daily"
  as permissive
  for select
  to authenticated
using (public.can_access_customer(customer_id));



  create policy "secure_read"
  on "public"."gads_keyword_daily"
  as permissive
  for select
  to authenticated
using (public.can_access_customer(customer_id));



  create policy "secure_read"
  on "public"."gads_keyword_status"
  as permissive
  for select
  to authenticated
using (public.can_access_customer(customer_id));



  create policy "secure_read"
  on "public"."gads_search_term_daily"
  as permissive
  for select
  to authenticated
using (public.can_access_customer(customer_id));



  create policy "Super admin manages permissions"
  on "public"."permissions"
  as permissive
  for all
  to authenticated
using (public.is_super_admin());



  create policy "Super admin manages role_permissions"
  on "public"."role_permissions"
  as permissive
  for all
  to authenticated
using (public.is_super_admin());



  create policy "Super admin manages roles"
  on "public"."roles"
  as permissive
  for all
  to authenticated
using (public.is_super_admin());



  create policy "Agency members read sync log"
  on "public"."sync_log"
  as permissive
  for select
  to authenticated
using (((agency_id IN ( SELECT user_profiles.agency_id
   FROM public.user_profiles
  WHERE (user_profiles.id = auth.uid()))) OR public.is_super_admin()));



  create policy "Users can insert sync_log for their agency"
  on "public"."sync_log"
  as permissive
  for insert
  to public
with check ((agency_id IN ( SELECT user_profiles.agency_id
   FROM public.user_profiles
  WHERE (user_profiles.id = auth.uid()))));



  create policy "Users can read sync_log for their agency"
  on "public"."sync_log"
  as permissive
  for select
  to public
using ((agency_id IN ( SELECT user_profiles.agency_id
   FROM public.user_profiles
  WHERE (user_profiles.id = auth.uid()))));



  create policy "Admin manages user_clients"
  on "public"."user_clients"
  as permissive
  for all
  to authenticated
using (public.is_admin());



  create policy "Admin manages profiles"
  on "public"."user_profiles"
  as permissive
  for all
  to authenticated
using (public.is_admin())
with check (public.is_admin());



  create policy "Agency admin reads agency profiles"
  on "public"."user_profiles"
  as permissive
  for select
  to authenticated
using (((agency_id = public.get_user_agency_id()) AND public.is_admin()));



  create policy "Super admin reads all profiles"
  on "public"."user_profiles"
  as permissive
  for select
  to authenticated
using (public.is_super_admin());


drop trigger if exists "on_auth_user_created" on "auth"."users";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


