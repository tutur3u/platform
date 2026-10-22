import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { bounded } from './native-emitted-config-receipt.mjs';
import { decodeReceipt, encodeReceipt } from './native-receipt-layout.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const wire = (value) => `${JSON.stringify(encodeReceipt(value))}\n`;
// AUTHORED UNRUN. Actual historical redacted Apps51, not the current Meet payload.
// Source config-receipt.json SHA256 25401ba501c5f2829e2445821edea0736a2bc3fd9248f6f793ea899b99d64323.
const historical = JSON.parse(
  `{"schema":1,"diagnosticOnly":true,"status":"recorded","acceptance":"unchanged","keyCount":51,"configHash":"2cf116de1977e3d1c3d35ebf3769bd0b999e153434090579434be51d286ae475","pointerHash":"3bb45bee9081f928ffba85d40a8dcf66a59f80b03f5ce36ee5d35c2a0ed92e3c","inventoryHash":"fa63d3ec44a71036ab14b2bf39107ec05f64a384345592394968bcf295f221dc","inventory":[{"name":"configPath","type":"string","empty":false},{"name":"userConfigPath","type":"string","empty":false},{"name":"topLevelName","type":"string","empty":false},{"name":"definedEnvironments","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"compatibility_date","type":"string","empty":false},{"name":"compatibility_flags","type":"array","empty":false,"count":1,"itemTypes":["string"],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"jsx_factory","type":"string","empty":false},{"name":"jsx_fragment","type":"string","empty":false},{"name":"rules","type":"array","empty":false,"count":1,"itemTypes":["object"],"objectCount":1,"objectKeyCounts":[2],"objectKeyHashes":["1303c06b0b014d0ce7b988ab173a13f31227d417058ff4bbe6f8c222b4ad913c","ae3034947d14e20ac0ce6a24a29c2f496f6a1177404dad66244bde725f5cf5b7"]},{"name":"name","type":"string","empty":false},{"name":"main","type":"string","empty":false},{"name":"triggers","type":"object","empty":true,"keyCount":0,"keyHashes":[]},{"name":"assets","type":"object","empty":false,"keyCount":4,"keyHashes":["333178788eae3e0b14c9b07bbbb6232bfa4689c7f134eeaa9daae60aba96de53","42b7452f484ff092e5f896611fb372b92d9e48440f57b2697640d490ce57a709","64f87a6fec78a81578866f445bbfed6b8fee74f49c6baa7b5ab9c43c8e6a4b2c","80f70afeef3caa57646fd20afb95be9c3f2c03d38e091906de31838813dcc22e"]},{"name":"workers_dev","type":"boolean","empty":false},{"name":"vars","type":"object","empty":false,"keyCount":1,"keyHashes":["ceb982e3576d899e2c0832865ced65795a4ad834a49ef695d1741a2dacd39349"]},{"name":"durable_objects","type":"object","empty":false,"keyCount":1,"keyHashes":["1f7378b5c19e6bafe2eaeb0c3404de571bac942248db6119b20dfe74d0581b4c"]},{"name":"workflows","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"migrations","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"exports","type":"object","empty":true,"keyCount":0,"keyHashes":[]},{"name":"kv_namespaces","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"cloudchamber","type":"object","empty":true,"keyCount":0,"keyHashes":[]},{"name":"send_email","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"queues","type":"object","empty":false,"keyCount":2,"keyHashes":["2a49fdd64f2ae219b4e46fe5f730ff82774fa4345132e09feb501d91f05cb783","cd14f4034ca2bb6a4c35d0dcac12038781a226e84d20eaf0f8a4af5fe1ef14b4"]},{"name":"connect","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"r2_buckets","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"d1_databases","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"vectorize","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"ai_search_namespaces","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"ai_search","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"agent_memory","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"hyperdrive","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"services","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"analytics_engine_datasets","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"dispatch_namespaces","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"mtls_certificates","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"pipelines","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"k2","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"secrets_store_secrets","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"artifacts","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"unsafe_hello_world","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"flagship","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"worker_loaders","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"ratelimits","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"vpc_services","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"vpc_networks","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"logfwdr","type":"object","empty":false,"keyCount":1,"keyHashes":["1f7378b5c19e6bafe2eaeb0c3404de571bac942248db6119b20dfe74d0581b4c"]},{"name":"upload_source_maps","type":"boolean","empty":false},{"name":"observability","type":"object","empty":false,"keyCount":2,"keyHashes":["7a5b610be4dcb015aef6ed3b0713ca4bbf3b44550b9530bb07eb5adea7b2e13a","fb9cf75606b4070dd6a9705810906bba28d0e2ea74ff301b999a91dbb68c7d98"]},{"name":"python_modules","type":"object","empty":false,"keyCount":1,"keyHashes":["35443277fe297662cfc34d304b04f2f5fb2b853a8292901001ef6232de91a7a3"]},{"name":"dev","type":"object","empty":false,"keyCount":5,"keyHashes":["21cec20d7756692e3c37e596d257fb259c796cedd0ef92350520c601f605a2cd","44c8714375ed99e64bbbdba39a4c1dfffa86c04b1dafd2a2e8b34ffaaf69658b","ae52e6618152356a14ea174ddcb468aae0e1b4522ac2fc03c42282b00f74d4d2","bb9af5d1915da1fbc132ced081325efcd2e63e4804f96890f42e9739677237a4","e0efc1389301a590c6aac458dbb0d3752563d07204b6943bbfa9e76e0a9bf6e0"]},{"name":"no_bundle","type":"boolean","empty":false}],"pointer":{"form":"saved","nativeRelativeBase":true,"configPath":{"type":"string","absolute":false,"emptyString":false,"insideApp":true,"insideDist":true,"equalsEmitted":true}},"metadata":{"configPath":{"type":"string","absolute":true,"emptyString":false,"insideApp":true,"insideDist":false,"equalsEmitted":false},"userConfigPath":{"type":"string","absolute":true,"emptyString":false,"insideApp":true,"insideDist":false,"equalsEmitted":false},"pathsEqual":true,"definedEnvironmentsAllStrings":true},"queues":{"type":"object","empty":false,"keyCount":2,"keyHashes":["2a49fdd64f2ae219b4e46fe5f730ff82774fa4345132e09feb501d91f05cb783","cd14f4034ca2bb6a4c35d0dcac12038781a226e84d20eaf0f8a4af5fe1ef14b4"],"topKeys":[{"name":"producers"},{"name":"consumers"}],"producers":{"type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},"consumers":{"type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]}},"source":{"head":"1060e450f2c7c7b09dc0c9e388e5feaa4940657b","eventSha":"b1415b17e89642e126c31c6edb7d6415d91baf3a","equal":false},"suppliers":{"void":{"version":"1.1.12","packageHash":"8cf78a900788338d0fc6a933aa472d092eb58ee7fbbf07d41f10c05cc8a8f000","sourceHash":"53ef8c9d984eddfde3e866e584b81d1a2da9c749a11e9ba9d20b6584dde1d061"},"plugin":{"version":"1.64.0","packageHash":"af6ce02f554c2f4eb772e854d63e82b7360cb54631a63d78e8ef90c067b41f94","sourceHash":"fe86b2c409772cb658564eec127c71b79f7e024acf4eeeff784e2ef1cafd8849"},"wrangler":{"version":"4.151.0","packageHash":"777a844512eb61977eafad63daa5dcebc0f47bfe18f761e1106c05384d31b3fa","sourceHash":"fdc72018f9cdd5cecff191ec00876825ac90620113996c9bf7d343914fbc842d"}},"defaultProbe":{"materialized":{"exists":true,"canonical":true,"symlink":false,"hash":"8ce6a91968508dfe7351f48d9e3aeadfcb32c30ee44581f34bb338cdd08b9315","jsonObject":true},"retainedState":{"exists":false,"canonical":false,"symlink":false,"validShape":null},"loaderSelection":{"typedConfig":{"exists":true,"canonical":true,"symlink":false,"hash":"6a8e2b32e81d602b201b93fb52b76903822068c299557583a79ec438aa5de47b"},"legacyJsonExists":false,"legacyJsoncExists":false,"metadataSelectsMaterialized":true,"proven":true},"metadata":{"configPathEqualsInput":true,"userConfigPathEqualsInput":true,"topLevelNameEqualsInput":true,"definedEnvironmentsEqualsInput":true,"definedEnvironmentsEmpty":true},"preconditions":{"supplierProfileMatches":true,"parserProfileMatches":true,"stateMatchesInput":null,"stateTextEqualsInput":null},"materializerHash":"123762196d5964dbf008f26457b29388e6e9858902364676f860231c6ef7b4b3","parser":{"version":"3.3.1","packageHash":"a7a9192caaac00d9330592f4fd572908bee037518128a0fc3db96d2cd652e2b5","sourceHash":"6dc132e2e792a9616688ff93d10dd671c1fbcfa3301d76bff3e81193d049337d"},"input":{"buildPresent":false,"buildType":"undefined","buildCommandPresent":false,"buildCwdPresent":false,"buildCommandType":"absent","buildCwdType":"absent","buildShape":null,"resourcePresence":[{"name":"durable_objects","present":false},{"name":"queues","present":false},{"name":"logfwdr","present":false},{"name":"kv_namespaces","present":false},{"name":"r2_buckets","present":false},{"name":"d1_databases","present":false},{"name":"services","present":false},{"name":"workflows","present":false},{"name":"containers","present":false},{"name":"hyperdrive","present":false},{"name":"unsafe","present":false},{"name":"assets","present":true},{"name":"vars","present":true},{"name":"secrets","present":false},{"name":"bindings","present":false},{"name":"build","present":false},{"name":"dev","present":false},{"name":"python_modules","present":false},{"name":"send_email","present":false},{"name":"cloudchamber","present":false},{"name":"connect","present":false},{"name":"migrations","present":false},{"name":"exports","present":false},{"name":"vectorize","present":false},{"name":"ai_search_namespaces","present":false},{"name":"ai_search","present":false},{"name":"agent_memory","present":false},{"name":"analytics_engine_datasets","present":false},{"name":"dispatch_namespaces","present":false},{"name":"mtls_certificates","present":false},{"name":"tail_consumers","present":false},{"name":"streaming_tail_consumers","present":false},{"name":"browser","present":false},{"name":"analytics","present":false},{"name":"ai","present":false},{"name":"images","present":false},{"name":"stream","present":false},{"name":"media","present":false},{"name":"pipelines","present":false},{"name":"k2","present":false},{"name":"secrets_store_secrets","present":false},{"name":"artifacts","present":false},{"name":"worker_loaders","present":false},{"name":"ratelimits","present":false},{"name":"vpc_services","present":false},{"name":"vpc_networks","present":false},{"name":"version_metadata","present":false}]},"fields":[{"name":"configPath","status":"recorded","inputPresent":false,"authoredPresent":null,"retainedSourcePresent":null,"origin":"input_identity","emittedType":"string","nestedKeysMatch":true,"typesMatch":true,"candidateMatch":true,"candidates":[{"candidate":"materialized_path","exactValueMatch":true}]},{"name":"userConfigPath","status":"recorded","inputPresent":false,"authoredPresent":null,"retainedSourcePresent":null,"origin":"input_identity","emittedType":"string","nestedKeysMatch":true,"typesMatch":true,"candidateMatch":true,"candidates":[{"candidate":"materialized_path","exactValueMatch":true}]},{"name":"topLevelName","status":"recorded","inputPresent":false,"authoredPresent":null,"retainedSourcePresent":null,"origin":"input_identity","emittedType":"string","nestedKeysMatch":true,"typesMatch":true,"candidateMatch":true,"candidates":[{"candidate":"materialized_name","exactValueMatch":true}]},{"name":"jsx_factory","status":"recorded","inputPresent":false,"authoredPresent":null,"retainedSourcePresent":null,"origin":"value_candidate","emittedType":"string","nestedKeysMatch":true,"typesMatch":true,"candidateMatch":true,"candidates":[{"candidate":"pinned_normalizer_default","exactValueMatch":true}]},{"name":"jsx_fragment","status":"recorded","inputPresent":false,"authoredPresent":null,"retainedSourcePresent":null,"origin":"value_candidate","emittedType":"string","nestedKeysMatch":true,"typesMatch":true,"candidateMatch":true,"candidates":[{"candidate":"pinned_normalizer_default","exactValueMatch":true}]},{"name":"durable_objects","status":"recorded","inputPresent":false,"authoredPresent":null,"retainedSourcePresent":null,"origin":"value_candidate","emittedType":"object","nestedKeysMatch":true,"typesMatch":true,"candidateMatch":true,"candidates":[{"candidate":"pinned_normalizer_default","exactValueMatch":true}]},{"name":"queues","status":"recorded","inputPresent":false,"authoredPresent":null,"retainedSourcePresent":null,"origin":"value_candidate","emittedType":"object","nestedKeysMatch":true,"typesMatch":true,"candidateMatch":true,"candidates":[{"candidate":"pinned_normalizer_default","exactValueMatch":true}]},{"name":"logfwdr","status":"recorded","inputPresent":false,"authoredPresent":null,"retainedSourcePresent":null,"origin":"value_candidate","emittedType":"object","nestedKeysMatch":true,"typesMatch":true,"candidateMatch":true,"candidates":[{"candidate":"pinned_normalizer_default","exactValueMatch":true}]},{"name":"python_modules","status":"recorded","inputPresent":false,"authoredPresent":null,"retainedSourcePresent":null,"origin":"value_candidate","emittedType":"object","nestedKeysMatch":true,"typesMatch":true,"candidateMatch":true,"candidates":[{"candidate":"pinned_normalizer_default","exactValueMatch":true}]},{"name":"upload_source_maps","status":"recorded","inputPresent":false,"authoredPresent":null,"retainedSourcePresent":null,"origin":"value_candidate","emittedType":"boolean","nestedKeysMatch":true,"typesMatch":true,"candidateMatch":true,"candidates":[{"candidate":"emitted_true_candidate","exactValueMatch":true}]},{"name":"dev","status":"recorded","inputPresent":false,"authoredPresent":null,"retainedSourcePresent":null,"origin":"value_candidate","emittedType":"object","nestedKeysMatch":true,"typesMatch":true,"candidateMatch":true,"candidates":[{"candidate":"pinned_cli_non_windows","exactValueMatch":true},{"candidate":"pinned_cli_windows","exactValueMatch":false}]}],"evidence":[{"name":"supplier","status":"matched","reason":"supplier_profile_matched"},{"name":"parser","status":"matched","reason":"parser_profile_matched"},{"name":"loader","status":"matched","reason":"loader_selection_matched"},{"name":"configPath","status":"matched","reason":"metadata_config_path_matched"},{"name":"userConfigPath","status":"matched","reason":"metadata_user_config_path_matched"},{"name":"topLevelName","status":"matched","reason":"metadata_top_level_name_matched"},{"name":"environments","status":"matched","reason":"metadata_environments_matched"},{"name":"stateShape","status":"unknown","reason":"retained_state_shape_unknown"},{"name":"stateResolved","status":"unknown","reason":"retained_state_resolved_unknown"},{"name":"stateText","status":"unknown","reason":"retained_state_text_unknown"}],"status":"recorded","reason":"value_candidates_only","diagnosticOnly":true,"causalProvenance":{"status":"unknown","reason":"historical_process_and_authored_source_unproven","cliDefaultsProven":false,"normalizerPlatformProven":false,"resolvedSourcemapProven":false,"authoredSourceProven":false}}}`
);
// Recovered hash-bound inventory only; pairing it with the historical probe is a hybrid.
const recoveredInventory = JSON.parse(
  `[{"name":"configPath","type":"string","empty":false},{"name":"userConfigPath","type":"string","empty":false},{"name":"topLevelName","type":"string","empty":false},{"name":"definedEnvironments","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"account_id","type":"string","empty":false},{"name":"compatibility_date","type":"string","empty":false},{"name":"compatibility_flags","type":"array","empty":false,"count":2,"itemTypes":["string"],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"jsx_factory","type":"string","empty":false},{"name":"jsx_fragment","type":"string","empty":false},{"name":"rules","type":"array","empty":false,"count":1,"itemTypes":["object"],"objectCount":1,"objectKeyCounts":[2],"objectKeyHashes":["1303c06b0b014d0ce7b988ab173a13f31227d417058ff4bbe6f8c222b4ad913c","ae3034947d14e20ac0ce6a24a29c2f496f6a1177404dad66244bde725f5cf5b7"]},{"name":"name","type":"string","empty":false},{"name":"main","type":"string","empty":false},{"name":"routes","type":"array","empty":false,"count":1,"itemTypes":["object"],"objectCount":1,"objectKeyCounts":[2],"objectKeyHashes":["1671a808595dcaf74365d92b2df8947040e07c25b70e366c543a85d171827dbc","1fd38d5cbd2a997b91f725cb1cb0a710849db30dac491ee42e92443fd8e3c1a2"]},{"name":"triggers","type":"object","empty":true},{"name":"assets","type":"object","empty":false,"keyCount":4,"keyHashes":["333178788eae3e0b14c9b07bbbb6232bfa4689c7f134eeaa9daae60aba96de53","42b7452f484ff092e5f896611fb372b92d9e48440f57b2697640d490ce57a709","64f87a6fec78a81578866f445bbfed6b8fee74f49c6baa7b5ab9c43c8e6a4b2c","80f70afeef3caa57646fd20afb95be9c3f2c03d38e091906de31838813dcc22e"]},{"name":"placement","type":"object","empty":false,"keyCount":1,"keyHashes":["c697d2981bf416569a16cfbcdec1542b5398f3cc77d2b905819aa99c46ecf6f6"]},{"name":"workers_dev","type":"boolean","empty":false},{"name":"vars","type":"object","empty":false,"keyCount":4,"keyHashes":["836771e48c92ff25f73b7b06db6b1d4bea5761cf7ec32267826792e708fe3706","d11a58861e1361efde9dc7afbc896abcbf7ab667eac5e2c8885855fae7574411","ddbbac640ca1107d5931b830b83ef48700e34c8e2072394c6ed075fc3c16c7bd","e916f0ce23f8c671066750c959caef40340c048e928457fe97cd9ea86e58cf03"]},{"name":"secrets","type":"object","empty":false,"keyCount":1,"keyHashes":["d0a3630555bbec7fc05a98d311c23b00fd1ab4d8296ac4a4125976d80b6a6959"]},{"name":"durable_objects","type":"object","empty":false,"keyCount":1,"keyHashes":["1f7378b5c19e6bafe2eaeb0c3404de571bac942248db6119b20dfe74d0581b4c"]},{"name":"workflows","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"migrations","type":"array","empty":false,"count":1,"itemTypes":["object"],"objectCount":1,"objectKeyCounts":[2],"objectKeyHashes":["2a1073a6e67f0e5f09a5957c659503c690efe7272be8313df872556a9a684d8c","2d598d6896b4db6436244646084c45951aa60ffede728dff3c91f2a6aa131648"]},{"name":"exports","type":"object","empty":true},{"name":"kv_namespaces","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"cloudchamber","type":"object","empty":true},{"name":"send_email","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"queues","type":"object","empty":false,"keyCount":2,"keyHashes":["2a49fdd64f2ae219b4e46fe5f730ff82774fa4345132e09feb501d91f05cb783","cd14f4034ca2bb6a4c35d0dcac12038781a226e84d20eaf0f8a4af5fe1ef14b4"]},{"name":"connect","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"r2_buckets","type":"array","empty":false,"count":1,"itemTypes":["object"],"objectCount":1,"objectKeyCounts":[2],"objectKeyHashes":["61199a2bf5257d46233c962c07bf7504117b22afe49ac3e47276279e942e4769","80f70afeef3caa57646fd20afb95be9c3f2c03d38e091906de31838813dcc22e"]},{"name":"d1_databases","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"vectorize","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"ai_search_namespaces","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"ai_search","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"agent_memory","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"hyperdrive","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"services","type":"array","empty":false,"count":1,"itemTypes":["object"],"objectCount":1,"objectKeyCounts":[2],"objectKeyHashes":["80f70afeef3caa57646fd20afb95be9c3f2c03d38e091906de31838813dcc22e","9df6b026a8c6c26e3c3acd2370a16e93fffdc0015ff5bd879218788025db0280"]},{"name":"analytics_engine_datasets","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"dispatch_namespaces","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"mtls_certificates","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"images","type":"object","empty":false,"keyCount":1,"keyHashes":["80f70afeef3caa57646fd20afb95be9c3f2c03d38e091906de31838813dcc22e"]},{"name":"pipelines","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"k2","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"secrets_store_secrets","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"artifacts","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"unsafe_hello_world","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"flagship","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"worker_loaders","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"ratelimits","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"vpc_services","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"vpc_networks","type":"array","empty":true,"count":0,"itemTypes":[],"objectCount":0,"objectKeyCounts":[],"objectKeyHashes":[]},{"name":"logfwdr","type":"object","empty":false,"keyCount":1,"keyHashes":["1f7378b5c19e6bafe2eaeb0c3404de571bac942248db6119b20dfe74d0581b4c"]},{"name":"upload_source_maps","type":"boolean","empty":false},{"name":"observability","type":"object","empty":false,"keyCount":2,"keyHashes":["7a5b610be4dcb015aef6ed3b0713ca4bbf3b44550b9530bb07eb5adea7b2e13a","fb9cf75606b4070dd6a9705810906bba28d0e2ea74ff301b999a91dbb68c7d98"]},{"name":"python_modules","type":"object","empty":false,"keyCount":1,"keyHashes":["35443277fe297662cfc34d304b04f2f5fb2b853a8292901001ef6232de91a7a3"]},{"name":"dev","type":"object","empty":false,"keyCount":5,"keyHashes":["21cec20d7756692e3c37e596d257fb259c796cedd0ef92350520c601f605a2cd","44c8714375ed99e64bbbdba39a4c1dfffa86c04b1dafd2a2e8b34ffaaf69658b","ae52e6618152356a14ea174ddcb468aae0e1b4522ac2fc03c42282b00f74d4d2","bb9af5d1915da1fbc132ced081325efcd2e63e4804f96890f42e9739677237a4","e0efc1389301a590c6aac458dbb0d3752563d07204b6943bbfa9e76e0a9bf6e0"]},{"name":"no_bundle","type":"boolean","empty":false}]`
);
const recoveredHash =
  '9e15d5c5b5c612211bdf3d3ab65e588a36d55c687d1fe21d199940a623f1ba57';
function hybrid() {
  return {
    ...structuredClone(historical),
    keyCount: 56,
    inventory: structuredClone(recoveredInventory),
    inventoryHash: recoveredHash,
  };
}
function roundtrip(logical) {
  const before = JSON.stringify(logical);
  const serialized = wire(logical);
  const decoded = decodeReceipt(serialized);
  assert.deepEqual(decoded, logical);
  assert.equal(JSON.stringify(decoded), before);
  assert.equal(JSON.stringify(logical), before);
  if (logical.inventory) {
    assert.equal(
      JSON.stringify(decoded.inventory),
      JSON.stringify(logical.inventory)
    );
    assert.equal(
      hash(JSON.stringify(decoded.inventory)),
      logical.inventoryHash
    );
  }
  return serialized;
}

test('actual historical v1 and explicit v2 retain complete ordered diagnostics', () => {
  assert.equal(Buffer.byteLength(`${JSON.stringify(historical)}\n`), 16380);
  assert.deepEqual(
    decodeReceipt(`${JSON.stringify(historical)}\n`),
    historical
  );
  const serialized = roundtrip(historical);
  const encoded = JSON.parse(serialized);
  assert.equal(encoded.schema, 2);
  assert.equal(encoded.wireEncoding, 'scoped-layouts-v1');
  for (const key of Object.keys(historical).filter(
    (key) => !['schema', 'inventory', 'defaultProbe'].includes(key)
  ))
    assert.deepEqual(encoded[key], historical[key]);
  assert.equal(historical.defaultProbe.fields.length, 11);
  assert.equal(
    historical.defaultProbe.fields.reduce(
      (n, row) => n + row.candidates.length,
      0
    ),
    12
  );
  assert.equal(historical.defaultProbe.evidence.length, 10);
});

test('explicit hybrid retains recovered 56-row inventory preimage and all historical probe facts', () => {
  const receipt = hybrid();
  assert.equal(receipt.inventory.length, 56);
  assert.equal(hash(JSON.stringify(receipt.inventory)), recoveredHash);
  const serialized = roundtrip(receipt);
  assert.ok(Buffer.byteLength(serialized) < 16384);
  const probe = decodeReceipt(serialized).defaultProbe;
  assert.deepEqual(probe, historical.defaultProbe);
  assert.ok(
    receipt.inventory.some(
      (row) => row.type === 'object' && row.empty === false
    )
  );
  assert.ok(
    receipt.inventory.some((row) => row.type === 'array' && row.count > 0)
  );
});

test('tags retain arbitrary typed shapes, unknown names, full unique hashes and property order', () => {
  const inventory = Array.from({ length: 12 }, (_, i) => ({
    unknownNameHash: hash(`unknown-${i}`),
    type: 'array',
    empty: false,
    count: 5,
    itemTypes: ['array', 'boolean', 'null', 'number', 'object'],
    objectCount: 1,
    objectKeyCounts: [2],
    objectKeyHashes: [hash(`first-${i}`), hash(`second-${i}`)],
  }));
  const receipt = {
    schema: 1,
    status: 'unavailable',
    reason: 'unchanged',
    diagnosticOnly: true,
    inventoryHash: hash(JSON.stringify(inventory)),
    inventory,
    defaultProbe: {
      status: 'unavailable',
      candidateMatch: null,
      inputPresent: false,
      emptyObject: {},
      emptyArray: [],
      mixed: [
        [0, 1, false],
        [1, null],
        null,
        false,
        0,
        '',
        { z: true, a: null },
      ],
      ordered: { second: false, first: null },
      explicitNull: null,
    },
  };
  const serialized = roundtrip(receipt);
  assert.equal(
    Object.hasOwn(decodeReceipt(serialized).defaultProbe, 'absent'),
    false
  );
  for (const row of inventory) {
    assert.ok(serialized.includes(row.unknownNameHash));
    for (const h of row.objectKeyHashes) assert.ok(serialized.includes(h));
  }
});

for (const status of ['recorded', 'unavailable']) {
  test(`known/unavailable input facts remain literal with ${status} status`, () => {
    const receipt = hybrid();
    receipt.status = status;
    receipt.defaultProbe.status = status;
    receipt.defaultProbe.input.status = status;
    receipt.defaultProbe.input.available = status === 'recorded';
    receipt.defaultProbe.input.absent = null;
    receipt.defaultProbe.evidence[0].status = 'mismatch';
    receipt.defaultProbe.fields[0].candidateMatch = false;
    roundtrip(receipt);
  });
}

for (const receipt of [
  {
    schema: 1,
    diagnosticOnly: true,
    status: 'unavailable',
    reason: 'input_unavailable',
  },
  {
    schema: 1,
    diagnosticOnly: true,
    status: 'unavailable',
    reason: 'overflow',
    keyCount: 400,
  },
]) {
  test(`legacy ${receipt.reason} summary remains unchanged`, () => {
    assert.deepEqual(encodeReceipt(receipt), receipt);
    assert.deepEqual(decodeReceipt(JSON.stringify(receipt)), receipt);
  });
}

function malformed(change) {
  const value = {
    schema: 2,
    wireEncoding: 'scoped-layouts-v1',
    layouts: [['a']],
    inventory: [0, 0, true],
  };
  change(value);
  assert.throws(
    () => decodeReceipt(JSON.stringify(value)),
    /invalid_diagnostic_receipt/
  );
}
for (const [name, change] of [
  [
    'unknown schema',
    (x) => {
      x.schema = 3;
    },
  ],
  [
    'unknown encoding',
    (x) => {
      x.wireEncoding = 'other';
    },
  ],
  [
    'missing encoding',
    (x) => {
      delete x.wireEncoding;
    },
  ],
  [
    'missing dictionary',
    (x) => {
      delete x.layouts;
    },
  ],
  [
    'missing scoped fields',
    (x) => {
      delete x.inventory;
    },
  ],
  [
    'unknown tag',
    (x) => {
      x.inventory[0] = 2;
    },
  ],
  [
    'empty tag',
    (x) => {
      x.inventory = [];
    },
  ],
  [
    'negative index',
    (x) => {
      x.inventory[1] = -1;
    },
  ],
  [
    'fractional index',
    (x) => {
      x.inventory[1] = 0.5;
    },
  ],
  [
    'string index',
    (x) => {
      x.inventory[1] = '0';
    },
  ],
  [
    'out of range index',
    (x) => {
      x.inventory[1] = 1;
    },
  ],
  [
    'truncated values',
    (x) => {
      x.inventory.pop();
    },
  ],
  [
    'extra values',
    (x) => {
      x.inventory.push(null);
    },
  ],
  [
    'raw object',
    (x) => {
      x.inventory = {};
    },
  ],
  [
    'duplicate keys',
    (x) => {
      x.layouts = [['a', 'a']];
      x.inventory.push(false);
    },
  ],
  [
    'duplicate layouts',
    (x) => {
      x.layouts.push(['a']);
    },
  ],
  [
    'nonstring key',
    (x) => {
      x.layouts = [[1]];
    },
  ],
  [
    'nonarray layout',
    (x) => {
      x.layouts = [{}];
    },
  ],
  [
    'nonarray dictionary',
    (x) => {
      x.layouts = {};
    },
  ],
])
  test(`decoder rejects ${name}`, () => malformed(change));

for (const key of ['__proto__', 'constructor', 'prototype']) {
  test(`rejects dangerous own property ${key} in layouts, readable fields and legacy data`, () => {
    malformed((x) => {
      x.layouts = [[key]];
    });
    malformed((x) => {
      Object.defineProperty(x, key, { value: {}, enumerable: true });
    });
    const legacy = JSON.parse(`{"schema":1,"inventory":[],"${key}":{}}`);
    assert.throws(
      () => decodeReceipt(JSON.stringify(legacy)),
      /invalid_diagnostic_receipt/
    );
    assert.throws(() => encodeReceipt(legacy), /invalid_diagnostic_receipt/);
    assert.equal(Object.hasOwn({}, 'polluted'), false);
  });
}

test('decoder rejects excessive depth, layout expansion, wire size and malformed JSON', () => {
  let nested = null;
  for (let i = 0; i < 70; i++) nested = [1, nested];
  const base = {
    schema: 2,
    wireEncoding: 'scoped-layouts-v1',
    layouts: [],
    inventory: nested,
  };
  assert.throws(
    () => decodeReceipt(JSON.stringify(base)),
    /diagnostic_receipt_limit/
  );
  base.layouts = [['x'.repeat(1000)]];
  base.inventory = [1, ...Array.from({ length: 1100 }, () => [0, 0, null])];
  assert.ok(Buffer.byteLength(JSON.stringify(base)) < 16384);
  assert.throws(
    () => decodeReceipt(JSON.stringify(base)),
    /diagnostic_receipt_limit/
  );
  const legacy = { schema: 1, inventory: [] };
  let deep = null;
  for (let i = 0; i < 70; i++) deep = [deep];
  legacy.inventory = deep;
  assert.throws(
    () => decodeReceipt(JSON.stringify(legacy)),
    /diagnostic_receipt_limit/
  );
  assert.throws(() => encodeReceipt(legacy), /diagnostic_receipt_limit/);
  assert.throws(
    () => decodeReceipt(' '.repeat(16385)),
    /invalid_diagnostic_receipt/
  );
  assert.throws(() => decodeReceipt('{'), /invalid_diagnostic_receipt/);
  for (const schema of [0, null, '1', 3])
    assert.throws(
      () => decodeReceipt(JSON.stringify({ schema })),
      /invalid_diagnostic_receipt/
    );
  assert.throws(
    () => decodeReceipt(JSON.stringify({ schema: 1, wireEncoding: 'unknown' })),
    /invalid_diagnostic_receipt/
  );
});

test('complete wire cap includes final LF and UTF-8: exactly 16384 succeeds; +1 fails closed', () => {
  const receipt = {
    schema: 1,
    diagnosticOnly: true,
    status: 'recorded',
    keyCount: 1,
    configHash: hash('config'),
    pointerHash: hash('pointer'),
    inventory: [
      { unknownNameHash: hash('redacted'), type: 'object', empty: true },
    ],
    padding: 'é漢🙂',
  };
  receipt.inventoryHash = hash(JSON.stringify(receipt.inventory));
  receipt.padding += 'x'.repeat(16384 - Buffer.byteLength(wire(receipt)));
  const exact = bounded(receipt);
  assert.equal(Buffer.byteLength(exact), 16384);
  assert.ok(exact.endsWith('\n'));
  assert.deepEqual(decodeReceipt(exact), receipt);
  receipt.padding += 'x';
  assert.equal(Buffer.byteLength(wire(receipt)), 16385);
  assert.throws(
    () => decodeReceipt(wire(receipt)),
    /invalid_diagnostic_receipt/
  );
  assert.deepEqual(JSON.parse(bounded(receipt)), {
    schema: 1,
    diagnosticOnly: true,
    status: 'unavailable',
    reason: 'overflow',
    keyCount: 1,
    configHash: receipt.configHash,
    pointerHash: receipt.pointerHash,
    inventoryHash: receipt.inventoryHash,
  });
});

test('the two scoped fields share layouts while differing property orders stay distinct', () => {
  const inventory = [
    { status: 'recorded', reason: null },
    { reason: null, status: 'unavailable' },
  ];
  const receipt = {
    schema: 1,
    status: 'recorded',
    inventory,
    inventoryHash: hash(JSON.stringify(inventory)),
    defaultProbe: { status: 'recorded', reason: null },
  };
  const encoded = encodeReceipt(receipt);
  assert.equal(encoded.inventory[1][1], encoded.defaultProbe[1]);
  assert.notEqual(encoded.inventory[1][1], encoded.inventory[2][1]);
  assert.deepEqual(encoded.layouts[encoded.defaultProbe[1]], [
    'status',
    'reason',
  ]);
  roundtrip(receipt);
});

test('non-JSON scalar inputs and unexpected legacy wire metadata fail without coercion', () => {
  for (const value of [undefined, NaN, Infinity, () => true])
    assert.throws(
      () => encodeReceipt({ schema: 1, inventory: [value] }),
      /invalid_diagnostic_receipt/
    );
  assert.throws(
    () => encodeReceipt({ schema: 1, layouts: [] }),
    /invalid_diagnostic_receipt/
  );
  assert.throws(
    () => decodeReceipt({ schema: 1 }),
    /invalid_diagnostic_receipt/
  );
});

test('encoding capacity limits still produce the unchanged complete overflow summary', () => {
  const receipt = {
    schema: 1,
    status: 'recorded',
    diagnosticOnly: true,
    keyCount: 1,
    configHash: hash('config'),
    pointerHash: hash('pointer'),
    inventoryHash: hash('inventory'),
    inventory: ['x'.repeat(1024 * 1024)],
  };
  assert.deepEqual(JSON.parse(bounded(receipt)), {
    schema: 1,
    diagnosticOnly: true,
    status: 'unavailable',
    reason: 'overflow',
    keyCount: 1,
    configHash: receipt.configHash,
    pointerHash: receipt.pointerHash,
    inventoryHash: receipt.inventoryHash,
  });
});

for (const status of ['recorded', 'unavailable']) {
  test(`producer optional reason keeps old JSON omission and ${status} status`, () => {
    for (const variant of ['absent', 'undefined', 'null', 'false']) {
      const parsed = { input: {} };
      const materialized = { exists: true, jsonObject: true };
      if (variant !== 'absent')
        materialized.reason =
          variant === 'undefined'
            ? parsed.reason
            : variant === 'null'
              ? null
              : false;
      const receipt = {
        schema: 1,
        status,
        inventory: [],
        defaultProbe: {
          materialized,
          status: 'recorded',
          reason: 'value_candidates_only',
        },
      };
      const expected = JSON.parse(JSON.stringify(receipt));
      assert.equal(Object.hasOwn(materialized, 'reason'), variant !== 'absent');
      for (const serialized of [wire(receipt), bounded(receipt)]) {
        assert.ok(Buffer.byteLength(serialized) <= 16384);
        const decoded = decodeReceipt(serialized);
        assert.deepEqual(decoded, expected);
        assert.equal(decoded.status, status);
        assert.equal(decoded.defaultProbe.reason, 'value_candidates_only');
        const result = decoded.defaultProbe.materialized;
        assert.equal(
          Object.hasOwn(result, 'reason'),
          ['null', 'false'].includes(variant)
        );
        if (variant === 'null') assert.equal(result.reason, null);
        if (variant === 'false') assert.equal(result.reason, false);
      }
      assert.equal(Object.hasOwn(materialized, 'reason'), variant !== 'absent');
      if (variant === 'undefined') assert.equal(materialized.reason, undefined);
    }
  });
}

test('minimal successful-parser shape is omitted before bounded encoding, including overflow', () => {
  const receipt = {
    schema: 1,
    status: 'recorded',
    inventory: [],
    defaultProbe: { materialized: { reason: undefined } },
  };
  assert.deepEqual(decodeReceipt(bounded(receipt)), {
    schema: 1,
    status: 'recorded',
    inventory: [],
    defaultProbe: { materialized: {} },
  });
  receipt.padding = 'x'.repeat(16384);
  assert.equal(JSON.parse(bounded(receipt)).reason, 'overflow');
  assert.equal(JSON.parse(bounded(receipt)).status, 'unavailable');
});

test('omission preserves readable-field semantics and reserved-key rejection', () => {
  const receipt = { schema: 1, status: 'unavailable', reason: undefined };
  assert.deepEqual(encodeReceipt(receipt), {
    schema: 1,
    status: 'unavailable',
  });
  assert.deepEqual(
    decodeReceipt(bounded(receipt)),
    JSON.parse(JSON.stringify(receipt))
  );
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const materialized = {};
    Object.defineProperty(materialized, key, {
      value: undefined,
      enumerable: true,
    });
    assert.throws(
      () => encodeReceipt({ schema: 1, defaultProbe: { materialized } }),
      /invalid_diagnostic_receipt/
    );
  }
});
