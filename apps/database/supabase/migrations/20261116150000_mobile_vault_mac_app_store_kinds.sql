-- The iOS bundle optionally carries the Mac App Store installer identity and
-- macOS provisioning profile, so the vault accepts both file kinds alongside
-- the existing mobile signing resources. Existing rows already satisfy the
-- wider check; no rows, policies or grants change.
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
        'app_store_connect_private_key_p8',
        'apple_mac_installer_certificate_p12',
        'apple_mac_app_store_provisioning_profile'
      )
    );
