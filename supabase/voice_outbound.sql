-- I AM Real Estate · Calls made by the AI (Nov 24, 2026).
-- 1) Jarvis calls the team (urgent items, or "call me" from the portal).
-- 2) The AI agent calls a customer who gave permission.
-- Safe to run again.

-- Where each team member wants Jarvis to call, and whether Jarvis may call them on its own.
alter table team_members add column if not exists phone text;
alter table team_members add column if not exists jarvis_call boolean not null default true;
alter table team_members add column if not exists call_lang text not null default 'en';

-- New kinds of calls in the call log.
alter table voice_calls drop constraint if exists voice_calls_source_check;
alter table voice_calls add constraint voice_calls_source_check check (source in ('test','phone','web','jarvis','outbound'));
alter table voice_calls add column if not exists call_sid text;
alter table voice_calls add column if not exists status text;

-- People who asked not to be called again by the AI.
alter table opt_outs drop constraint if exists opt_outs_channel_check;
alter table opt_outs add constraint opt_outs_channel_check check (channel in ('sms','email','call'));

notify pgrst, 'reload schema';
