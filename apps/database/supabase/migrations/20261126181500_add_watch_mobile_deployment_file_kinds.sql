-- Allow Apple Watch companion app and WidgetKit extension App Store
-- provisioning profiles in the mobile deployment vault.

alter table private.mobile_deployment_file_artifacts
  drop constraint if exists mobile_deployment_file_artifacts_kind_chk;

alter table private.mobile_deployment_file_artifacts
  add constraint mobile_deployment_file_artifacts_kind_chk
  check (
    kind in (
      'android_google_services_json',
      'ios_google_service_info_plist',
      'android_upload_keystore',
      'google_play_service_account_json',
      'apple_distribution_certificate_p12',
      'apple_app_store_provisioning_profile',
      'apple_watch_app_store_provisioning_profile',
      'apple_watch_widgets_app_store_provisioning_profile',
      'app_store_connect_private_key_p8'
    )
  );
