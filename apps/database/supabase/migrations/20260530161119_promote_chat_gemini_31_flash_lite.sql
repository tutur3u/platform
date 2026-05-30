do $$
begin
  if exists (
    select 1
    from public.ai_gateway_models
    where id = 'google/gemini-3.1-flash-lite'
  ) then
    update private.chat_conversation_ai_settings
    set
      model_id = 'google/gemini-3.1-flash-lite',
      updated_at = now()
    where model_id in ('gemini-3-flash', 'google/gemini-3-flash');

    update public.ai_chats
    set model = 'google/gemini-3.1-flash-lite'
    where model in ('gemini-3-flash', 'google/gemini-3-flash');

    update public.ai_credit_plan_allocations
    set
      default_language_model = case
        when default_language_model in (
          'gemini-3-flash',
          'google/gemini-3-flash'
        ) then 'google/gemini-3.1-flash-lite'
        else default_language_model
      end,
      allowed_models = array_replace(
        array_replace(
          allowed_models,
          'google/gemini-3-flash',
          'google/gemini-3.1-flash-lite'
        ),
        'gemini-3-flash',
        'google/gemini-3.1-flash-lite'
      ),
      updated_at = now()
    where default_language_model in (
      'gemini-3-flash',
      'google/gemini-3-flash'
    )
    or allowed_models && array[
      'gemini-3-flash',
      'google/gemini-3-flash'
    ];
  end if;
end;
$$;
