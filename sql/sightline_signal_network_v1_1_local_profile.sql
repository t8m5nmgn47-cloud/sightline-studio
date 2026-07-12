-- Sightline Signal Network v1.1 compatibility patch
-- Run this once on projects that installed v1 before local_profile was added.

alter table public.signal_sources
  drop constraint if exists signal_sources_source_type_check;

alter table public.signal_sources
  add constraint signal_sources_source_type_check check (source_type in (
    'website','local_profile','social_profile','review_profile','search_query','news_feed',
    'job_feed','ad_library','business_system'
  ));
