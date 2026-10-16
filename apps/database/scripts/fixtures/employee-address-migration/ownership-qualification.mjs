export async function qualifyOwnership({
  test,
  reserve,
  json,
  rpc,
  providerEmail,
  sql,
  rejects,
  user,
  other,
  attempt,
  source,
  destination,
}) {
  for (const phase of ['attempted', 'completed']) {
    await test(`ownership-only changes reject both addresses after ${phase}`, async () => {
      const bound = await reserve();
      await json(rpc('claim', bound, attempt));
      await providerEmail(true);
      if (phase === 'completed') await json(rpc('complete', bound));
      for (const address of [source, destination]) {
        await rejects(
          `update private.mail_mailboxes set created_by='${other}'
          where address='${address}'`,
          '23505'
        );
        // Populate target-owned rows through the enabled guards, then change
        // only ownership; changing the address would mask a missing trigger.
        await sql(
          `insert into private.employee_creation_intents values ('${user}','${address}')`
        );
        await rejects(
          `update private.employee_creation_intents set user_id='${other}'
          where staff_email='${address}'`,
          '23505'
        );
        await sql(
          `update public.user_private_details set email='${address}' where user_id='${user}'`
        );
        await rejects(
          `update public.user_private_details set user_id='${other}'
          where email='${address}'`,
          '23505'
        );
        await sql(
          `update auth.identities set identity_data=jsonb_set(identity_data,'{email}',to_jsonb('${address}'::text)) where user_id='${user}'`
        );
        await rejects(
          `update auth.identities set user_id='${other}'
          where user_id='${user}'`,
          '23505'
        );
      }
    });
  }
}
